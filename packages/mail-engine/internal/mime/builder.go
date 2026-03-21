package mime

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"math/rand"
	"mime"
	"mime/multipart"
	"net/textproto"
	"strings"
	"time"
)

// EmailBuilder constructs RFC 5322 compliant email messages.
type EmailBuilder struct {
	from        string
	to          []string
	cc          []string
	bcc         []string
	subject     string
	textBody    string
	htmlBody    string
	headers     map[string]string
	attachments []Attachment
	messageID   string
	inReplyTo   string
	references  []string
}

// NewEmailBuilder creates a new EmailBuilder.
func NewEmailBuilder() *EmailBuilder {
	return &EmailBuilder{
		headers: make(map[string]string),
	}
}

func (b *EmailBuilder) From(from string) *EmailBuilder {
	b.from = from
	return b
}

func (b *EmailBuilder) To(to ...string) *EmailBuilder {
	b.to = to
	return b
}

func (b *EmailBuilder) Cc(cc ...string) *EmailBuilder {
	b.cc = cc
	return b
}

func (b *EmailBuilder) Bcc(bcc ...string) *EmailBuilder {
	b.bcc = bcc
	return b
}

func (b *EmailBuilder) Subject(subject string) *EmailBuilder {
	b.subject = subject
	return b
}

func (b *EmailBuilder) TextBody(body string) *EmailBuilder {
	b.textBody = body
	return b
}

func (b *EmailBuilder) HTMLBody(body string) *EmailBuilder {
	b.htmlBody = body
	return b
}

func (b *EmailBuilder) Header(key, value string) *EmailBuilder {
	b.headers[key] = value
	return b
}

func (b *EmailBuilder) MessageID(id string) *EmailBuilder {
	b.messageID = id
	return b
}

func (b *EmailBuilder) InReplyTo(id string) *EmailBuilder {
	b.inReplyTo = id
	return b
}

func (b *EmailBuilder) References(refs ...string) *EmailBuilder {
	b.references = refs
	return b
}

func (b *EmailBuilder) AddAttachment(filename, contentType string, data []byte) *EmailBuilder {
	b.attachments = append(b.attachments, Attachment{
		Filename:    filename,
		ContentType: contentType,
		Data:        data,
	})
	return b
}

// Build constructs the raw email message as bytes.
func (b *EmailBuilder) Build() ([]byte, error) {
	var buf bytes.Buffer

	// Write headers
	if b.messageID == "" {
		b.messageID = generateMessageID(extractDomain(b.from))
	}
	fmt.Fprintf(&buf, "Message-ID: <%s>\r\n", b.messageID)
	fmt.Fprintf(&buf, "Date: %s\r\n", time.Now().UTC().Format(time.RFC1123Z))
	fmt.Fprintf(&buf, "From: %s\r\n", b.from)
	fmt.Fprintf(&buf, "To: %s\r\n", strings.Join(b.to, ", "))

	if len(b.cc) > 0 {
		fmt.Fprintf(&buf, "Cc: %s\r\n", strings.Join(b.cc, ", "))
	}
	// Bcc is not included in headers (by design)

	encodedSubject := mime.QEncoding.Encode("utf-8", b.subject)
	fmt.Fprintf(&buf, "Subject: %s\r\n", encodedSubject)

	if b.inReplyTo != "" {
		fmt.Fprintf(&buf, "In-Reply-To: <%s>\r\n", b.inReplyTo)
	}
	if len(b.references) > 0 {
		refs := make([]string, len(b.references))
		for i, r := range b.references {
			refs[i] = "<" + r + ">"
		}
		fmt.Fprintf(&buf, "References: %s\r\n", strings.Join(refs, " "))
	}

	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")

	// Custom headers
	for key, value := range b.headers {
		fmt.Fprintf(&buf, "%s: %s\r\n", key, value)
	}

	// Determine content structure
	hasText := b.textBody != ""
	hasHTML := b.htmlBody != ""
	hasAttachments := len(b.attachments) > 0

	switch {
	case hasAttachments:
		return b.buildMixed(&buf)
	case hasText && hasHTML:
		return b.buildAlternative(&buf)
	case hasHTML:
		return b.buildSinglePart(&buf, "text/html", b.htmlBody)
	default:
		return b.buildSinglePart(&buf, "text/plain", b.textBody)
	}
}

func (b *EmailBuilder) buildSinglePart(buf *bytes.Buffer, contentType, body string) ([]byte, error) {
	fmt.Fprintf(buf, "Content-Type: %s; charset=utf-8\r\n", contentType)
	fmt.Fprintf(buf, "Content-Transfer-Encoding: quoted-printable\r\n")
	fmt.Fprintf(buf, "\r\n")
	buf.WriteString(body)
	return buf.Bytes(), nil
}

func (b *EmailBuilder) buildAlternative(buf *bytes.Buffer) ([]byte, error) {
	writer := multipart.NewWriter(buf)
	fmt.Fprintf(buf, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", writer.Boundary())

	// Text part
	textHeader := make(textproto.MIMEHeader)
	textHeader.Set("Content-Type", "text/plain; charset=utf-8")
	textHeader.Set("Content-Transfer-Encoding", "quoted-printable")
	textPart, err := writer.CreatePart(textHeader)
	if err != nil {
		return nil, fmt.Errorf("failed to create text part: %w", err)
	}
	textPart.Write([]byte(b.textBody))

	// HTML part
	htmlHeader := make(textproto.MIMEHeader)
	htmlHeader.Set("Content-Type", "text/html; charset=utf-8")
	htmlHeader.Set("Content-Transfer-Encoding", "quoted-printable")
	htmlPart, err := writer.CreatePart(htmlHeader)
	if err != nil {
		return nil, fmt.Errorf("failed to create html part: %w", err)
	}
	htmlPart.Write([]byte(b.htmlBody))

	writer.Close()
	return buf.Bytes(), nil
}

func (b *EmailBuilder) buildMixed(buf *bytes.Buffer) ([]byte, error) {
	writer := multipart.NewWriter(buf)
	fmt.Fprintf(buf, "Content-Type: multipart/mixed; boundary=%s\r\n\r\n", writer.Boundary())

	// Body part(s)
	if b.textBody != "" && b.htmlBody != "" {
		// Create a nested multipart/alternative for text + html
		altHeader := make(textproto.MIMEHeader)
		altWriter := multipart.NewWriter(nil) // just for boundary generation
		altHeader.Set("Content-Type", fmt.Sprintf("multipart/alternative; boundary=%s", altWriter.Boundary()))
		altPart, err := writer.CreatePart(altHeader)
		if err != nil {
			return nil, err
		}
		altMultipart := multipart.NewWriter(altPart)
		// Force same boundary
		altMultipart.SetBoundary(altWriter.Boundary())

		textH := make(textproto.MIMEHeader)
		textH.Set("Content-Type", "text/plain; charset=utf-8")
		tp, _ := altMultipart.CreatePart(textH)
		tp.Write([]byte(b.textBody))

		htmlH := make(textproto.MIMEHeader)
		htmlH.Set("Content-Type", "text/html; charset=utf-8")
		hp, _ := altMultipart.CreatePart(htmlH)
		hp.Write([]byte(b.htmlBody))

		altMultipart.Close()
	} else {
		bodyHeader := make(textproto.MIMEHeader)
		body := b.textBody
		ct := "text/plain; charset=utf-8"
		if b.htmlBody != "" {
			body = b.htmlBody
			ct = "text/html; charset=utf-8"
		}
		bodyHeader.Set("Content-Type", ct)
		bodyPart, err := writer.CreatePart(bodyHeader)
		if err != nil {
			return nil, err
		}
		bodyPart.Write([]byte(body))
	}

	// Attachment parts
	for _, att := range b.attachments {
		attHeader := make(textproto.MIMEHeader)
		attHeader.Set("Content-Type", att.ContentType)
		attHeader.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", att.Filename))
		attHeader.Set("Content-Transfer-Encoding", "base64")
		attPart, err := writer.CreatePart(attHeader)
		if err != nil {
			return nil, fmt.Errorf("failed to create attachment part: %w", err)
		}
		encoded := base64.StdEncoding.EncodeToString(att.Data)
		// Write in 76-char lines per RFC 2045
		for i := 0; i < len(encoded); i += 76 {
			end := i + 76
			if end > len(encoded) {
				end = len(encoded)
			}
			attPart.Write([]byte(encoded[i:end]))
			attPart.Write([]byte("\r\n"))
		}
	}

	writer.Close()
	return buf.Bytes(), nil
}

func generateMessageID(domain string) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 24)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return fmt.Sprintf("%s@%s", string(b), domain)
}

func extractDomain(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) < 2 {
		return "localhost"
	}
	// Handle "Name <email@domain>" format
	domain := parts[len(parts)-1]
	domain = strings.TrimSuffix(domain, ">")
	return domain
}
