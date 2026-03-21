package mime

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"
)

// ParsedEmail represents a fully parsed email message.
type ParsedEmail struct {
	MessageID  string
	From       string
	To         []string
	Cc         []string
	Bcc        []string
	Subject    string
	Date       string
	InReplyTo  string
	References []string
	Headers    map[string]string

	TextBody string
	HTMLBody  string

	Attachments []Attachment

	RawSize int
}

// Attachment represents an email attachment.
type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

// Parse parses raw email bytes into a ParsedEmail struct.
func Parse(rawData []byte) (*ParsedEmail, error) {
	msg, err := mail.ReadMessage(bytes.NewReader(rawData))
	if err != nil {
		return nil, fmt.Errorf("failed to read message: %w", err)
	}

	parsed := &ParsedEmail{
		MessageID:  cleanAngleBrackets(msg.Header.Get("Message-Id")),
		From:       msg.Header.Get("From"),
		Subject:    decodeHeader(msg.Header.Get("Subject")),
		Date:       msg.Header.Get("Date"),
		InReplyTo:  cleanAngleBrackets(msg.Header.Get("In-Reply-To")),
		Headers:    make(map[string]string),
		RawSize:    len(rawData),
	}

	// Parse To
	parsed.To = parseAddressList(msg.Header.Get("To"))

	// Parse Cc
	parsed.Cc = parseAddressList(msg.Header.Get("Cc"))

	// Parse Bcc
	parsed.Bcc = parseAddressList(msg.Header.Get("Bcc"))

	// Parse References
	if refs := msg.Header.Get("References"); refs != "" {
		for _, ref := range strings.Fields(refs) {
			parsed.References = append(parsed.References, cleanAngleBrackets(ref))
		}
	}

	// Copy all headers
	for key := range msg.Header {
		parsed.Headers[key] = msg.Header.Get(key)
	}

	// Parse body
	contentType := msg.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "text/plain"
	}

	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		// Fallback: read as plain text
		body, readErr := io.ReadAll(msg.Body)
		if readErr != nil {
			return nil, fmt.Errorf("failed to read body: %w", readErr)
		}
		parsed.TextBody = string(body)
		return parsed, nil
	}

	if strings.HasPrefix(mediaType, "multipart/") {
		err = parseMultipart(parsed, msg.Body, params["boundary"])
		if err != nil {
			return nil, fmt.Errorf("failed to parse multipart: %w", err)
		}
	} else {
		body, readErr := io.ReadAll(msg.Body)
		if readErr != nil {
			return nil, fmt.Errorf("failed to read body: %w", readErr)
		}
		decoded := decodeBody(body, msg.Header.Get("Content-Transfer-Encoding"))
		if strings.HasPrefix(mediaType, "text/html") {
			parsed.HTMLBody = string(decoded)
		} else {
			parsed.TextBody = string(decoded)
		}
	}

	return parsed, nil
}

func parseMultipart(parsed *ParsedEmail, body io.Reader, boundary string) error {
	reader := multipart.NewReader(body, boundary)

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read part: %w", err)
		}

		partContentType := part.Header.Get("Content-Type")
		if partContentType == "" {
			partContentType = "text/plain"
		}

		mediaType, params, err := mime.ParseMediaType(partContentType)
		if err != nil {
			continue
		}

		disposition := part.Header.Get("Content-Disposition")
		filename := part.FileName()

		// Recursive multipart
		if strings.HasPrefix(mediaType, "multipart/") {
			if err := parseMultipart(parsed, part, params["boundary"]); err != nil {
				return err
			}
			continue
		}

		data, err := io.ReadAll(part)
		if err != nil {
			return fmt.Errorf("failed to read part data: %w", err)
		}

		decoded := decodeBody(data, part.Header.Get("Content-Transfer-Encoding"))

		// Check if this is an attachment
		if filename != "" || strings.HasPrefix(disposition, "attachment") {
			if filename == "" {
				filename = "unnamed"
			}
			parsed.Attachments = append(parsed.Attachments, Attachment{
				Filename:    filename,
				ContentType: mediaType,
				Data:        decoded,
			})
			continue
		}

		// Inline body content
		if strings.HasPrefix(mediaType, "text/html") {
			parsed.HTMLBody = string(decoded)
		} else if strings.HasPrefix(mediaType, "text/plain") {
			parsed.TextBody = string(decoded)
		}
	}

	return nil
}

func decodeBody(data []byte, encoding string) []byte {
	switch strings.ToLower(encoding) {
	case "base64":
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
		if err != nil {
			return data
		}
		return decoded
	case "quoted-printable":
		decoded, err := io.ReadAll(quotedprintable.NewReader(bytes.NewReader(data)))
		if err != nil {
			return data
		}
		return decoded
	default:
		return data
	}
}

func decodeHeader(header string) string {
	dec := new(mime.WordDecoder)
	decoded, err := dec.DecodeHeader(header)
	if err != nil {
		return header
	}
	return decoded
}

func parseAddressList(header string) []string {
	if header == "" {
		return nil
	}

	addresses, err := mail.ParseAddressList(header)
	if err != nil {
		// Fallback: split by comma
		parts := strings.Split(header, ",")
		result := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				result = append(result, p)
			}
		}
		return result
	}

	result := make([]string, 0, len(addresses))
	for _, addr := range addresses {
		result = append(result, addr.Address)
	}
	return result
}

func cleanAngleBrackets(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "<")
	s = strings.TrimSuffix(s, ">")
	return s
}
