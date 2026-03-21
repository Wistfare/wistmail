package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	// Clear env vars that might affect test
	envVars := []string{"SMTP_PORT", "IMAP_PORT", "MAIL_DOMAIN", "DATABASE_URL"}
	saved := make(map[string]string)
	for _, key := range envVars {
		saved[key] = os.Getenv(key)
		os.Unsetenv(key)
	}
	defer func() {
		for key, val := range saved {
			if val != "" {
				os.Setenv(key, val)
			}
		}
	}()

	cfg := Load()

	if cfg.SMTPPort != 25 {
		t.Errorf("expected SMTPPort=25, got %d", cfg.SMTPPort)
	}
	if cfg.SMTPSubmissionPort != 587 {
		t.Errorf("expected SMTPSubmissionPort=587, got %d", cfg.SMTPSubmissionPort)
	}
	if cfg.IMAPPort != 143 {
		t.Errorf("expected IMAPPort=143, got %d", cfg.IMAPPort)
	}
	if cfg.IMAPSSLPort != 993 {
		t.Errorf("expected IMAPSSLPort=993, got %d", cfg.IMAPSSLPort)
	}
	if cfg.MailDomain != "localhost" {
		t.Errorf("expected MailDomain=localhost, got %s", cfg.MailDomain)
	}
	if cfg.SMTPMaxMessageSize != 25*1024*1024 {
		t.Errorf("expected SMTPMaxMessageSize=26214400, got %d", cfg.SMTPMaxMessageSize)
	}
	if cfg.GRPCPort != 50051 {
		t.Errorf("expected GRPCPort=50051, got %d", cfg.GRPCPort)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	os.Setenv("SMTP_PORT", "2525")
	os.Setenv("MAIL_DOMAIN", "mail.example.com")
	defer func() {
		os.Unsetenv("SMTP_PORT")
		os.Unsetenv("MAIL_DOMAIN")
	}()

	cfg := Load()

	if cfg.SMTPPort != 2525 {
		t.Errorf("expected SMTPPort=2525, got %d", cfg.SMTPPort)
	}
	if cfg.MailDomain != "mail.example.com" {
		t.Errorf("expected MailDomain=mail.example.com, got %s", cfg.MailDomain)
	}
}

func TestLoad_InvalidInt(t *testing.T) {
	os.Setenv("SMTP_PORT", "not-a-number")
	defer os.Unsetenv("SMTP_PORT")

	cfg := Load()

	if cfg.SMTPPort != 25 {
		t.Errorf("expected default SMTPPort=25 for invalid env, got %d", cfg.SMTPPort)
	}
}

func TestHasTLS(t *testing.T) {
	cfg := &Config{TLSCertPath: "", TLSKeyPath: ""}
	if cfg.HasTLS() {
		t.Error("expected HasTLS=false with empty paths")
	}

	cfg.TLSCertPath = "/path/to/cert.pem"
	cfg.TLSKeyPath = "/path/to/key.pem"
	if !cfg.HasTLS() {
		t.Error("expected HasTLS=true with both paths set")
	}

	cfg.TLSKeyPath = ""
	if cfg.HasTLS() {
		t.Error("expected HasTLS=false with only cert path")
	}
}
