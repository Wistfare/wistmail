package config

import (
	"os"
	"strconv"
)

// Config holds the mail engine configuration.
type Config struct {
	// SMTP
	SMTPPort           int
	SMTPSubmissionPort int
	SMTPSSLPort        int
	SMTPMaxMessageSize int
	SMTPMaxRecipients  int
	SMTPTimeout        int
	SMTPMaxConnections int
	SMTPMaxAuthAttempts int

	// IMAP
	IMAPPort    int
	IMAPSSLPort int

	// Domain
	MailDomain string
	Hostname   string

	// TLS
	TLSCertPath string
	TLSKeyPath  string
	ACMEEmail   string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// S3/MinIO
	S3Endpoint  string
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	S3Region    string

	// gRPC
	GRPCPort int
}

// Load creates a Config from environment variables.
func Load() *Config {
	return &Config{
		SMTPPort:           getEnvInt("SMTP_PORT", 25),
		SMTPSubmissionPort: getEnvInt("SMTP_SUBMISSION_PORT", 587),
		SMTPSSLPort:        getEnvInt("SMTP_SSL_PORT", 465),
		SMTPMaxMessageSize: getEnvInt("SMTP_MAX_MESSAGE_SIZE", 25*1024*1024),
		SMTPMaxRecipients:  getEnvInt("SMTP_MAX_RECIPIENTS", 100),
		SMTPTimeout:        getEnvInt("SMTP_TIMEOUT", 300),
		SMTPMaxConnections: getEnvInt("SMTP_MAX_CONNECTIONS", 100),
		SMTPMaxAuthAttempts: getEnvInt("SMTP_MAX_AUTH_ATTEMPTS", 3),

		IMAPPort:    getEnvInt("IMAP_PORT", 143),
		IMAPSSLPort: getEnvInt("IMAP_SSL_PORT", 993),

		MailDomain: getEnv("MAIL_DOMAIN", "localhost"),
		Hostname:   getEnv("HOSTNAME", "localhost"),

		TLSCertPath: getEnv("TLS_CERT_PATH", ""),
		TLSKeyPath:  getEnv("TLS_KEY_PATH", ""),
		ACMEEmail:   getEnv("ACME_EMAIL", ""),

		DatabaseURL: getEnv("DATABASE_URL", "postgresql://wistmail:wistmail@localhost:5432/wistmail"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),

		S3Endpoint:  getEnv("S3_ENDPOINT", "http://localhost:9000"),
		S3AccessKey: getEnv("S3_ACCESS_KEY", "wistmail"),
		S3SecretKey: getEnv("S3_SECRET_KEY", "wistmail-secret"),
		S3Bucket:    getEnv("S3_BUCKET", "wistmail-attachments"),
		S3Region:    getEnv("S3_REGION", "us-east-1"),

		GRPCPort: getEnvInt("GRPC_PORT", 50051),
	}
}

// HasTLS returns true if TLS certificate paths are configured.
func (c *Config) HasTLS() bool {
	return c.TLSCertPath != "" && c.TLSKeyPath != ""
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
