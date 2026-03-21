package dkim

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
	"time"
)

// Signer signs outbound emails with DKIM.
type Signer struct {
	Domain     string
	Selector   string
	PrivateKey *rsa.PrivateKey
}

// NewSigner creates a new DKIM signer.
func NewSigner(domain, selector string, privateKeyPEM string) (*Signer, error) {
	key, err := ParsePrivateKey(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	return &Signer{
		Domain:     domain,
		Selector:   selector,
		PrivateKey: key,
	}, nil
}

// Sign adds a DKIM-Signature header to the email data.
func (s *Signer) Sign(emailData []byte) ([]byte, error) {
	// Split headers and body
	headerEnd := findHeaderEnd(emailData)
	headers := string(emailData[:headerEnd])
	body := emailData[headerEnd:]

	// Canonicalize body (relaxed)
	canonBody := canonicalizeBodyRelaxed(body)

	// Hash body
	bodyHash := sha256.Sum256(canonBody)
	bodyHashB64 := base64.StdEncoding.EncodeToString(bodyHash[:])

	// Select headers to sign
	signedHeaders := selectSignHeaders(headers)
	headerNames := make([]string, len(signedHeaders))
	for i, h := range signedHeaders {
		headerNames[i] = h.name
	}

	// Build DKIM-Signature header (without b= value)
	timestamp := time.Now().Unix()
	dkimHeader := fmt.Sprintf(
		"DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=%s; s=%s; t=%d; h=%s; bh=%s; b=",
		s.Domain,
		s.Selector,
		timestamp,
		strings.Join(headerNames, ":"),
		bodyHashB64,
	)

	// Canonicalize signed headers + DKIM header for signing
	var canonHeaders strings.Builder
	for _, h := range signedHeaders {
		canonHeaders.WriteString(canonicalizeHeaderRelaxed(h.raw))
		canonHeaders.WriteString("\r\n")
	}
	canonHeaders.WriteString(canonicalizeHeaderRelaxed(dkimHeader))

	// Sign
	headerHash := sha256.Sum256([]byte(canonHeaders.String()))
	signature, err := rsa.SignPKCS1v15(rand.Reader, s.PrivateKey, crypto.SHA256, headerHash[:])
	if err != nil {
		return nil, fmt.Errorf("signing failed: %w", err)
	}

	signatureB64 := base64.StdEncoding.EncodeToString(signature)

	// Build final email with DKIM header prepended
	fullDKIMHeader := dkimHeader + signatureB64 + "\r\n"
	result := make([]byte, 0, len(fullDKIMHeader)+len(emailData))
	result = append(result, []byte(fullDKIMHeader)...)
	result = append(result, emailData...)

	return result, nil
}

// GenerateKeyPair generates a new RSA key pair for DKIM signing.
func GenerateKeyPair(bits int) (privateKeyPEM string, publicKeyDNS string, err error) {
	if bits == 0 {
		bits = 2048
	}

	privateKey, err := rsa.GenerateKey(rand.Reader, bits)
	if err != nil {
		return "", "", fmt.Errorf("key generation failed: %w", err)
	}

	// Encode private key to PEM
	privateKeyBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	privateKeyBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privateKeyBytes,
	}
	privateKeyPEM = string(pem.EncodeToMemory(privateKeyBlock))

	// Encode public key for DNS TXT record
	publicKeyBytes, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return "", "", fmt.Errorf("public key encoding failed: %w", err)
	}
	publicKeyB64 := base64.StdEncoding.EncodeToString(publicKeyBytes)
	publicKeyDNS = fmt.Sprintf("v=DKIM1; k=rsa; p=%s", publicKeyB64)

	return privateKeyPEM, publicKeyDNS, nil
}

// ParsePrivateKey parses a PEM-encoded RSA private key.
func ParsePrivateKey(pemData string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, fmt.Errorf("no PEM block found")
	}

	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		// Try PKCS8
		keyInterface, err2 := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("failed to parse private key: %w (pkcs1: %v)", err2, err)
		}
		rsaKey, ok := keyInterface.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("key is not RSA")
		}
		return rsaKey, nil
	}

	return key, nil
}

// ─── Canonicalization ───────────────────────────────────────────────────────

type headerField struct {
	name string
	raw  string
}

func findHeaderEnd(data []byte) int {
	s := string(data)
	idx := strings.Index(s, "\r\n\r\n")
	if idx >= 0 {
		return idx + 4 // Include the separator
	}
	idx = strings.Index(s, "\n\n")
	if idx >= 0 {
		return idx + 2
	}
	return len(data)
}

func canonicalizeHeaderRelaxed(header string) string {
	// Convert header name to lowercase
	colonIdx := strings.Index(header, ":")
	if colonIdx < 0 {
		return strings.TrimSpace(strings.ToLower(header))
	}

	name := strings.ToLower(strings.TrimSpace(header[:colonIdx]))
	value := strings.TrimSpace(header[colonIdx+1:])

	// Collapse whitespace in value
	var result strings.Builder
	inSpace := false
	for _, ch := range value {
		if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n' {
			if !inSpace {
				result.WriteByte(' ')
				inSpace = true
			}
		} else {
			result.WriteRune(ch)
			inSpace = false
		}
	}

	return name + ":" + result.String()
}

func canonicalizeBodyRelaxed(body []byte) []byte {
	lines := strings.Split(string(body), "\n")
	var result []string

	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		// Collapse WSP to single space, trim trailing WSP
		var canonLine strings.Builder
		inSpace := false
		for _, ch := range line {
			if ch == ' ' || ch == '\t' {
				if !inSpace {
					canonLine.WriteByte(' ')
					inSpace = true
				}
			} else {
				canonLine.WriteRune(ch)
				inSpace = false
			}
		}
		result = append(result, strings.TrimRight(canonLine.String(), " "))
	}

	// Remove empty lines at the end
	for len(result) > 0 && result[len(result)-1] == "" {
		result = result[:len(result)-1]
	}

	canonBody := strings.Join(result, "\r\n")
	if canonBody != "" {
		canonBody += "\r\n"
	}

	return []byte(canonBody)
}

func selectSignHeaders(headers string) []headerField {
	// Headers to sign (in order of priority)
	signHeaderNames := []string{
		"from", "to", "subject", "date", "message-id",
		"cc", "in-reply-to", "references", "mime-version",
		"content-type", "content-transfer-encoding",
		"reply-to",
	}

	headerLines := parseHeaderLines(headers)
	var selected []headerField

	for _, targetName := range signHeaderNames {
		for _, h := range headerLines {
			if strings.EqualFold(h.name, targetName) {
				selected = append(selected, h)
				break
			}
		}
	}

	return selected
}

func parseHeaderLines(headers string) []headerField {
	var fields []headerField
	lines := strings.Split(headers, "\n")

	var currentHeader string
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			break
		}

		// Continuation line (starts with space or tab)
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			currentHeader += "\r\n" + line
			continue
		}

		// Save previous header
		if currentHeader != "" {
			colonIdx := strings.Index(currentHeader, ":")
			if colonIdx > 0 {
				fields = append(fields, headerField{
					name: strings.TrimSpace(currentHeader[:colonIdx]),
					raw:  currentHeader,
				})
			}
		}
		currentHeader = line
	}

	// Save last header
	if currentHeader != "" {
		colonIdx := strings.Index(currentHeader, ":")
		if colonIdx > 0 {
			fields = append(fields, headerField{
				name: strings.TrimSpace(currentHeader[:colonIdx]),
				raw:  currentHeader,
			})
		}
	}

	return fields
}
