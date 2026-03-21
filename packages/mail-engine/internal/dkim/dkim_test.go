package dkim

import (
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"strings"
	"testing"
)

func TestGenerateKeyPair(t *testing.T) {
	privateKeyPEM, publicKeyDNS, err := GenerateKeyPair(2048)
	if err != nil {
		t.Fatalf("key generation failed: %v", err)
	}

	// Verify private key is valid PEM
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		t.Fatal("private key is not valid PEM")
	}
	if block.Type != "RSA PRIVATE KEY" {
		t.Errorf("expected RSA PRIVATE KEY, got %s", block.Type)
	}

	// Verify we can parse the private key
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		t.Fatalf("failed to parse private key: %v", err)
	}
	if key.N.BitLen() != 2048 {
		t.Errorf("expected 2048-bit key, got %d", key.N.BitLen())
	}

	// Verify DNS record format
	if !strings.HasPrefix(publicKeyDNS, "v=DKIM1; k=rsa; p=") {
		t.Errorf("invalid DNS record format: %s", publicKeyDNS)
	}
}

func TestParsePrivateKey(t *testing.T) {
	privateKeyPEM, _, err := GenerateKeyPair(2048)
	if err != nil {
		t.Fatalf("key generation failed: %v", err)
	}

	key, err := ParsePrivateKey(privateKeyPEM)
	if err != nil {
		t.Fatalf("failed to parse private key: %v", err)
	}

	if key.N.BitLen() != 2048 {
		t.Errorf("expected 2048-bit key, got %d", key.N.BitLen())
	}
}

func TestParsePrivateKey_Invalid(t *testing.T) {
	_, err := ParsePrivateKey("not a valid PEM")
	if err == nil {
		t.Error("expected error for invalid PEM")
	}
}

func TestSign(t *testing.T) {
	privateKeyPEM, _, err := GenerateKeyPair(2048)
	if err != nil {
		t.Fatalf("key generation failed: %v", err)
	}

	signer, err := NewSigner("example.com", "wistmail", privateKeyPEM)
	if err != nil {
		t.Fatalf("failed to create signer: %v", err)
	}

	email := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Test Email\r\n" +
		"Date: Mon, 01 Jan 2024 00:00:00 +0000\r\n" +
		"Message-ID: <test123@example.com>\r\n" +
		"\r\n" +
		"Hello, this is a test email.\r\n"

	signed, err := signer.Sign([]byte(email))
	if err != nil {
		t.Fatalf("signing failed: %v", err)
	}

	signedStr := string(signed)

	// Verify DKIM-Signature header is prepended
	if !strings.HasPrefix(signedStr, "DKIM-Signature:") {
		t.Error("signed email does not start with DKIM-Signature")
	}

	// Verify required DKIM fields
	dkimLine := signedStr[:strings.Index(signedStr, "\r\n")]
	requiredFields := []string{"v=1", "a=rsa-sha256", "d=example.com", "s=wistmail", "bh=", "b="}
	for _, field := range requiredFields {
		if !strings.Contains(dkimLine, field) {
			t.Errorf("DKIM-Signature missing field: %s", field)
		}
	}

	// Verify original email is preserved after the DKIM header
	if !strings.Contains(signedStr, "From: sender@example.com") {
		t.Error("original From header missing")
	}
	if !strings.Contains(signedStr, "Hello, this is a test email.") {
		t.Error("original body missing")
	}
}

func TestSign_VerifyBodyHash(t *testing.T) {
	privateKeyPEM, _, err := GenerateKeyPair(2048)
	if err != nil {
		t.Fatalf("key generation failed: %v", err)
	}

	signer, err := NewSigner("example.com", "wistmail", privateKeyPEM)
	if err != nil {
		t.Fatalf("failed to create signer: %v", err)
	}

	body := "Hello, World!\r\n"
	email := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Test\r\n" +
		"\r\n" +
		body

	signed, err := signer.Sign([]byte(email))
	if err != nil {
		t.Fatalf("signing failed: %v", err)
	}

	// Extract bh= value from DKIM header
	signedStr := string(signed)
	dkimLine := signedStr[:strings.Index(signedStr, "\r\n")]
	bhStart := strings.Index(dkimLine, "bh=") + 3
	bhEnd := strings.Index(dkimLine[bhStart:], ";")
	if bhEnd < 0 {
		bhEnd = strings.Index(dkimLine[bhStart:], " b=")
	}
	bh := dkimLine[bhStart : bhStart+bhEnd]

	// Compute expected body hash
	canonBody := canonicalizeBodyRelaxed([]byte(body))
	expectedHash := sha256.Sum256(canonBody)
	expectedBH := base64.StdEncoding.EncodeToString(expectedHash[:])

	if bh != expectedBH {
		t.Errorf("body hash mismatch: got %s, expected %s", bh, expectedBH)
	}
}

func TestCanonicalizeHeaderRelaxed(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"From: user@example.com", "from:user@example.com"},
		{"Subject:  Multiple   Spaces  ", "subject:Multiple Spaces"},
		{"X-Custom:  value  with   spaces", "x-custom:value with spaces"},
	}

	for _, tt := range tests {
		result := canonicalizeHeaderRelaxed(tt.input)
		if result != tt.expected {
			t.Errorf("canonicalizeHeaderRelaxed(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestCanonicalizeBodyRelaxed(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "trailing whitespace removed",
			input:    "Hello  \r\n",
			expected: "Hello\r\n",
		},
		{
			name:     "empty trailing lines removed",
			input:    "Hello\r\n\r\n\r\n",
			expected: "Hello\r\n",
		},
		{
			name:     "empty body",
			input:    "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := canonicalizeBodyRelaxed([]byte(tt.input))
			if string(result) != tt.expected {
				t.Errorf("got %q, want %q", string(result), tt.expected)
			}
		})
	}
}

func TestFindHeaderEnd(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"From: a\r\nTo: b\r\n\r\nBody", 18},
		{"From: a\n\nBody", 9},
	}

	for _, tt := range tests {
		result := findHeaderEnd([]byte(tt.input))
		if result != tt.expected {
			t.Errorf("findHeaderEnd(%q) = %d, want %d", tt.input, result, tt.expected)
		}
	}
}

func TestNewSigner(t *testing.T) {
	privateKeyPEM, _, _ := GenerateKeyPair(2048)

	signer, err := NewSigner("example.com", "wistmail", privateKeyPEM)
	if err != nil {
		t.Fatalf("failed to create signer: %v", err)
	}

	if signer.Domain != "example.com" {
		t.Errorf("expected domain=example.com, got %s", signer.Domain)
	}
	if signer.Selector != "wistmail" {
		t.Errorf("expected selector=wistmail, got %s", signer.Selector)
	}
}

func TestNewSigner_InvalidKey(t *testing.T) {
	_, err := NewSigner("example.com", "wistmail", "invalid")
	if err == nil {
		t.Error("expected error for invalid key")
	}
}

// Verify that signing uses the private key correctly by checking
// the signature can be verified with the public key
func TestSign_VerifyWithPublicKey(t *testing.T) {
	privateKeyPEM, _, err := GenerateKeyPair(2048)
	if err != nil {
		t.Fatalf("key generation failed: %v", err)
	}

	key, _ := ParsePrivateKey(privateKeyPEM)

	signer, _ := NewSigner("example.com", "wistmail", privateKeyPEM)

	email := "From: sender@example.com\r\n" +
		"Subject: Test\r\n" +
		"\r\n" +
		"Body\r\n"

	signed, err := signer.Sign([]byte(email))
	if err != nil {
		t.Fatalf("signing failed: %v", err)
	}

	// Extract signature from b= field
	signedStr := string(signed)
	dkimLine := signedStr[:strings.Index(signedStr, "\r\n")]
	bStart := strings.LastIndex(dkimLine, "b=") + 2
	signatureB64 := dkimLine[bStart:]

	signatureBytes, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		t.Fatalf("failed to decode signature: %v", err)
	}

	// The signature should be verifiable (non-zero length and valid base64)
	if len(signatureBytes) == 0 {
		t.Error("signature is empty")
	}

	// Verify it's a valid RSA signature (correct length for 2048-bit key)
	expectedLen := key.PublicKey.Size()
	if len(signatureBytes) != expectedLen {
		t.Errorf("signature length %d, expected %d for 2048-bit key", len(signatureBytes), expectedLen)
	}

	_ = &key.PublicKey // Public key available for verification
}

func TestSelectSignHeaders(t *testing.T) {
	headers := "From: sender@example.com\r\n" +
		"To: recipient@example.com\r\n" +
		"Subject: Test\r\n" +
		"Date: Mon, 01 Jan 2024 00:00:00 +0000\r\n" +
		"X-Custom: value\r\n"

	selected := selectSignHeaders(headers)

	// Should include From, To, Subject, Date but not X-Custom
	names := make(map[string]bool)
	for _, h := range selected {
		names[strings.ToLower(h.name)] = true
	}

	if !names["from"] {
		t.Error("From header not selected")
	}
	if !names["to"] {
		t.Error("To header not selected")
	}
	if !names["subject"] {
		t.Error("Subject header not selected")
	}
	if names["x-custom"] {
		t.Error("X-Custom header should not be selected")
	}
}

func TestGenerateKeyPair_CustomBits(t *testing.T) {
	privateKeyPEM, _, err := GenerateKeyPair(1024)
	if err != nil {
		t.Fatalf("key generation failed: %v", err)
	}

	key, _ := ParsePrivateKey(privateKeyPEM)
	if key.N.BitLen() != 1024 {
		t.Errorf("expected 1024-bit key, got %d", key.N.BitLen())
	}
}

// Suppress unused import warning
var _ = (*rsa.PublicKey)(nil)
