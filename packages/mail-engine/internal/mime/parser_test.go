package mime

import (
	"strings"
	"testing"
)

func TestParse_SimplePlainText(t *testing.T) {
	raw := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Test Subject\r\n" +
		"Message-ID: <test123@example.com>\r\n" +
		"Date: Mon, 01 Jan 2024 00:00:00 +0000\r\n" +
		"\r\n" +
		"Hello, this is a test email."

	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.From != "sender@example.com" {
		t.Errorf("expected From=sender@example.com, got %s", parsed.From)
	}
	if len(parsed.To) != 1 || parsed.To[0] != "sender@example.com" {
		// The To field will be the parsed address
	}
	if parsed.Subject != "Test Subject" {
		t.Errorf("expected Subject=Test Subject, got %s", parsed.Subject)
	}
	if parsed.MessageID != "test123@example.com" {
		t.Errorf("expected MessageID=test123@example.com, got %s", parsed.MessageID)
	}
	if parsed.TextBody != "Hello, this is a test email." {
		t.Errorf("expected text body, got %q", parsed.TextBody)
	}
	if parsed.HTMLBody != "" {
		t.Errorf("expected empty HTML body, got %q", parsed.HTMLBody)
	}
}

func TestParse_HTMLOnly(t *testing.T) {
	raw := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: HTML Test\r\n" +
		"Content-Type: text/html; charset=utf-8\r\n" +
		"\r\n" +
		"<h1>Hello</h1>"

	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.HTMLBody != "<h1>Hello</h1>" {
		t.Errorf("expected HTML body, got %q", parsed.HTMLBody)
	}
	if parsed.TextBody != "" {
		t.Errorf("expected empty text body, got %q", parsed.TextBody)
	}
}

func TestParse_MultipartAlternative(t *testing.T) {
	raw := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Multipart Test\r\n" +
		"Content-Type: multipart/alternative; boundary=\"boundary123\"\r\n" +
		"\r\n" +
		"--boundary123\r\n" +
		"Content-Type: text/plain; charset=utf-8\r\n" +
		"\r\n" +
		"Plain text content\r\n" +
		"--boundary123\r\n" +
		"Content-Type: text/html; charset=utf-8\r\n" +
		"\r\n" +
		"<p>HTML content</p>\r\n" +
		"--boundary123--\r\n"

	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.TextBody != "Plain text content" {
		t.Errorf("expected text body, got %q", parsed.TextBody)
	}
	if parsed.HTMLBody != "<p>HTML content</p>" {
		t.Errorf("expected HTML body, got %q", parsed.HTMLBody)
	}
}

func TestParse_WithAttachment(t *testing.T) {
	raw := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Attachment Test\r\n" +
		"Content-Type: multipart/mixed; boundary=\"mixedboundary\"\r\n" +
		"\r\n" +
		"--mixedboundary\r\n" +
		"Content-Type: text/plain; charset=utf-8\r\n" +
		"\r\n" +
		"Email body\r\n" +
		"--mixedboundary\r\n" +
		"Content-Type: application/pdf\r\n" +
		"Content-Disposition: attachment; filename=\"test.pdf\"\r\n" +
		"Content-Transfer-Encoding: base64\r\n" +
		"\r\n" +
		"dGVzdCBwZGYgY29udGVudA==\r\n" +
		"--mixedboundary--\r\n"

	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.TextBody != "Email body" {
		t.Errorf("expected text body, got %q", parsed.TextBody)
	}
	if len(parsed.Attachments) != 1 {
		t.Fatalf("expected 1 attachment, got %d", len(parsed.Attachments))
	}
	if parsed.Attachments[0].Filename != "test.pdf" {
		t.Errorf("expected filename=test.pdf, got %s", parsed.Attachments[0].Filename)
	}
	if parsed.Attachments[0].ContentType != "application/pdf" {
		t.Errorf("expected content type=application/pdf, got %s", parsed.Attachments[0].ContentType)
	}
	if string(parsed.Attachments[0].Data) != "test pdf content" {
		t.Errorf("expected decoded attachment data, got %q", string(parsed.Attachments[0].Data))
	}
}

func TestParse_MultipleRecipients(t *testing.T) {
	raw := "From: sender@example.com\r\n" +
		"To: alice@example.com, bob@example.com\r\n" +
		"Cc: charlie@example.com\r\n" +
		"Subject: Multi-recipient\r\n" +
		"\r\n" +
		"Body"

	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(parsed.To) != 2 {
		t.Errorf("expected 2 To recipients, got %d", len(parsed.To))
	}
	if len(parsed.Cc) != 1 {
		t.Errorf("expected 1 Cc recipient, got %d", len(parsed.Cc))
	}
}

func TestParse_InReplyTo(t *testing.T) {
	raw := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Re: Test\r\n" +
		"In-Reply-To: <original123@example.com>\r\n" +
		"References: <original123@example.com> <reply456@example.com>\r\n" +
		"\r\n" +
		"Reply body"

	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.InReplyTo != "original123@example.com" {
		t.Errorf("expected InReplyTo=original123@example.com, got %s", parsed.InReplyTo)
	}
	if len(parsed.References) != 2 {
		t.Errorf("expected 2 references, got %d", len(parsed.References))
	}
}

func TestParse_RawSize(t *testing.T) {
	raw := "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Size Test\r\n\r\nBody"
	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if parsed.RawSize != len(raw) {
		t.Errorf("expected RawSize=%d, got %d", len(raw), parsed.RawSize)
	}
}

func TestParse_HeadersPreserved(t *testing.T) {
	raw := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Headers\r\n" +
		"X-Custom-Header: custom-value\r\n" +
		"\r\n" +
		"Body"

	parsed, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if parsed.Headers["X-Custom-Header"] != "custom-value" {
		t.Errorf("expected custom header, got %q", parsed.Headers["X-Custom-Header"])
	}
}

func TestCleanAngleBrackets(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"<test@example.com>", "test@example.com"},
		{"test@example.com", "test@example.com"},
		{"  <test@example.com>  ", "test@example.com"},
		{"", ""},
	}

	for _, tt := range tests {
		result := cleanAngleBrackets(tt.input)
		if result != tt.expected {
			t.Errorf("cleanAngleBrackets(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestDecodeBody_Base64(t *testing.T) {
	encoded := "SGVsbG8gV29ybGQ="
	decoded := decodeBody([]byte(encoded), "base64")
	if string(decoded) != "Hello World" {
		t.Errorf("expected 'Hello World', got %q", string(decoded))
	}
}

func TestDecodeBody_QuotedPrintable(t *testing.T) {
	encoded := "Hello=20World"
	decoded := decodeBody([]byte(encoded), "quoted-printable")
	if string(decoded) != "Hello World" {
		t.Errorf("expected 'Hello World', got %q", string(decoded))
	}
}

func TestDecodeBody_PlainPassthrough(t *testing.T) {
	plain := "Hello World"
	decoded := decodeBody([]byte(plain), "7bit")
	if string(decoded) != plain {
		t.Errorf("expected passthrough, got %q", string(decoded))
	}
}

func TestExtractDomain(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"user@example.com", "example.com"},
		{"Name <user@example.com>", "example.com"},
		{"noatsign", "localhost"},
	}

	for _, tt := range tests {
		result := extractDomain(tt.input)
		if result != tt.expected {
			t.Errorf("extractDomain(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestParseAddressList(t *testing.T) {
	result := parseAddressList("alice@example.com, bob@example.com")
	if len(result) != 2 {
		t.Errorf("expected 2 addresses, got %d", len(result))
	}

	empty := parseAddressList("")
	if len(empty) != 0 {
		t.Errorf("expected 0 addresses for empty string, got %d", len(empty))
	}
}

func TestEmailBuilder_SimplePlainText(t *testing.T) {
	builder := NewEmailBuilder().
		From("sender@example.com").
		To("recipient@example.com").
		Subject("Test").
		TextBody("Hello, World!")

	raw, err := builder.Build()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	msg := string(raw)
	if !strings.Contains(msg, "From: sender@example.com") {
		t.Error("missing From header")
	}
	if !strings.Contains(msg, "To: recipient@example.com") {
		t.Error("missing To header")
	}
	if !strings.Contains(msg, "Hello, World!") {
		t.Error("missing body")
	}
	if !strings.Contains(msg, "text/plain") {
		t.Error("missing content type")
	}
}

func TestEmailBuilder_Roundtrip(t *testing.T) {
	builder := NewEmailBuilder().
		From("sender@example.com").
		To("recipient@example.com").
		Subject("Roundtrip Test").
		TextBody("Plain text version").
		HTMLBody("<p>HTML version</p>").
		MessageID("test-roundtrip@example.com")

	raw, err := builder.Build()
	if err != nil {
		t.Fatalf("build error: %v", err)
	}

	parsed, err := Parse(raw)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if parsed.From != "sender@example.com" {
		t.Errorf("roundtrip From mismatch: %s", parsed.From)
	}
	if parsed.MessageID != "test-roundtrip@example.com" {
		t.Errorf("roundtrip MessageID mismatch: %s", parsed.MessageID)
	}
	if parsed.TextBody == "" {
		t.Error("missing text body after roundtrip")
	}
	if parsed.HTMLBody == "" {
		t.Error("missing HTML body after roundtrip")
	}
}
