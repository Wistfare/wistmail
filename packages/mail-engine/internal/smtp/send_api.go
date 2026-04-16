package smtp

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"mime/quotedprintable"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Wistfare/wistmail/packages/mail-engine/internal/dkim"
)

// OutboundRequest is the JSON body accepted by the internal send API.
type OutboundRequest struct {
	From      string            `json:"from"`
	To        []string          `json:"to"`
	Cc        []string          `json:"cc,omitempty"`
	Bcc       []string          `json:"bcc,omitempty"`
	ReplyTo   string            `json:"replyTo,omitempty"`
	Subject   string            `json:"subject"`
	Text      string            `json:"text,omitempty"`
	HTML      string            `json:"html,omitempty"`
	InReplyTo string            `json:"inReplyTo,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
}

// DkimLookup returns the PEM-encoded private key and selector for a domain.
// Returns empty strings if no DKIM key is configured.
type DkimLookup func(domain string) (privateKeyPEM, selector string)

// StartSendAPI starts an internal HTTP server on the given port that accepts
// outbound send requests from the API service. It is never exposed externally —
// only reachable within the Docker network.
func StartSendAPI(hostname string, port int, client *Client, dkimLookup DkimLookup) {
	secret := os.Getenv("INBOUND_SECRET")

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/send", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if secret == "" || r.Header.Get("X-Inbound-Secret") != secret {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req OutboundRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if req.From == "" || len(req.To) == 0 {
			http.Error(w, "from and to are required", http.StatusBadRequest)
			return
		}

		data, err := buildMessage(hostname, &req)
		if err != nil {
			log.Printf("send_api: build message error: %v", err)
			sendAPIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build message"})
			return
		}

		// DKIM sign the message if we have a key for the sending domain
		senderDomain := extractDomain(req.From)
		if senderDomain != "" && dkimLookup != nil {
			privKey, selector := dkimLookup(senderDomain)
			if privKey != "" && selector != "" {
				signer, err := dkim.NewSigner(senderDomain, selector, privKey)
				if err != nil {
					log.Printf("send_api: DKIM signer init failed for %s: %v", senderDomain, err)
				} else {
					signed, err := signer.Sign(data)
					if err != nil {
						log.Printf("send_api: DKIM signing failed for %s: %v", senderDomain, err)
					} else {
						data = signed
						log.Printf("send_api: DKIM signed for domain %s (selector=%s)", senderDomain, selector)
					}
				}
			}
		}

		// SMTP RCPT TO must include all recipients (To + Cc + Bcc).
		// Bcc is excluded from message headers (already not present in buildMessage).
		recipients := make([]string, 0, len(req.To)+len(req.Cc)+len(req.Bcc))
		recipients = append(recipients, req.To...)
		recipients = append(recipients, req.Cc...)
		recipients = append(recipients, req.Bcc...)

		result, err := client.Send(r.Context(), req.From, recipients, data)
		if err != nil {
			log.Printf("send_api: smtp error: %v", err)
			sendAPIJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if !result.Success {
			errMsg := ""
			if result.Error != nil {
				errMsg = result.Error.Error()
			}
			log.Printf("send_api: delivery failed from %s: %s", req.From, errMsg)
			sendAPIJSON(w, http.StatusInternalServerError, map[string]string{"error": errMsg})
			return
		}

		log.Printf("send_api: delivered from %s to %v", req.From, req.To)
		sendAPIJSON(w, http.StatusOK, map[string]string{"status": "sent"})
	})

	addr := fmt.Sprintf(":%d", port)
	log.Printf("Send API listening on %s (internal only)", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("send_api: server error: %v", err)
	}
}

func sendAPIJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

// extractDomain pulls the domain part from an email address or "Name <addr>" format.
func extractDomain(from string) string {
	addr := from
	if idx := strings.LastIndex(addr, "<"); idx >= 0 {
		addr = addr[idx+1:]
		addr = strings.TrimSuffix(addr, ">")
	}
	if idx := strings.LastIndex(addr, "@"); idx >= 0 {
		return strings.ToLower(addr[idx+1:])
	}
	return ""
}

// buildMessage constructs a standards-compliant RFC 2822 / MIME email from the request.
func buildMessage(hostname string, req *OutboundRequest) ([]byte, error) {
	var buf bytes.Buffer

	msgID, err := newMessageID(hostname)
	if err != nil {
		return nil, fmt.Errorf("message-id: %w", err)
	}

	fmt.Fprintf(&buf, "Message-ID: <%s>\r\n", msgID)
	fmt.Fprintf(&buf, "Date: %s\r\n", time.Now().UTC().Format(time.RFC1123Z))
	fmt.Fprintf(&buf, "From: %s\r\n", req.From)
	if len(req.To) > 0 {
		fmt.Fprintf(&buf, "To: %s\r\n", strings.Join(req.To, ", "))
	}
	if len(req.Cc) > 0 {
		fmt.Fprintf(&buf, "Cc: %s\r\n", strings.Join(req.Cc, ", "))
	}
	if req.ReplyTo != "" {
		fmt.Fprintf(&buf, "Reply-To: %s\r\n", req.ReplyTo)
	}
	if req.InReplyTo != "" {
		v := req.InReplyTo
		if !strings.HasPrefix(v, "<") {
			v = "<" + v + ">"
		}
		fmt.Fprintf(&buf, "In-Reply-To: %s\r\n", v)
	}

	fmt.Fprintf(&buf, "Subject: %s\r\n", mime.QEncoding.Encode("utf-8", req.Subject))
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")

	// Custom headers (protected fields are skipped)
	protected := map[string]bool{
		"from": true, "to": true, "cc": true, "bcc": true,
		"subject": true, "date": true, "message-id": true, "mime-version": true,
	}
	for k, v := range req.Headers {
		if !protected[strings.ToLower(k)] {
			fmt.Fprintf(&buf, "%s: %s\r\n", k, v)
		}
	}

	// Body
	switch {
	case req.HTML != "" && req.Text != "":
		boundary := newBoundary()
		fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", boundary)

		fmt.Fprintf(&buf, "--%s\r\n", boundary)
		fmt.Fprintf(&buf, "Content-Type: text/plain; charset=utf-8\r\n")
		fmt.Fprintf(&buf, "Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		if err := writeQP(&buf, req.Text); err != nil {
			return nil, err
		}
		fmt.Fprintf(&buf, "\r\n")

		fmt.Fprintf(&buf, "--%s\r\n", boundary)
		fmt.Fprintf(&buf, "Content-Type: text/html; charset=utf-8\r\n")
		fmt.Fprintf(&buf, "Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		if err := writeQP(&buf, req.HTML); err != nil {
			return nil, err
		}
		fmt.Fprintf(&buf, "\r\n")

		fmt.Fprintf(&buf, "--%s--\r\n", boundary)

	case req.HTML != "":
		fmt.Fprintf(&buf, "Content-Type: text/html; charset=utf-8\r\n")
		fmt.Fprintf(&buf, "Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		if err := writeQP(&buf, req.HTML); err != nil {
			return nil, err
		}

	default:
		text := req.Text
		if text == "" {
			text = " "
		}
		fmt.Fprintf(&buf, "Content-Type: text/plain; charset=utf-8\r\n")
		fmt.Fprintf(&buf, "Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		if err := writeQP(&buf, text); err != nil {
			return nil, err
		}
	}

	return buf.Bytes(), nil
}

func writeQP(w *bytes.Buffer, content string) error {
	qw := quotedprintable.NewWriter(w)
	if _, err := qw.Write([]byte(content)); err != nil {
		return err
	}
	return qw.Close()
}

func newMessageID(hostname string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b) + "@" + hostname, nil
}

func newBoundary() string {
	b := make([]byte, 12)
	rand.Read(b) //nolint:errcheck
	return "alt_" + hex.EncodeToString(b)
}
