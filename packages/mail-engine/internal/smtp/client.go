package smtp

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// SendResult holds the result of sending an email.
type SendResult struct {
	Success    bool
	Error      error
	StatusCode int
	Message    string
}

// Client sends outbound emails via SMTP.
type Client struct {
	Hostname       string
	ConnectTimeout time.Duration
	SendTimeout    time.Duration
	MaxRetries     int
}

// NewClient creates a new SMTP client for outbound sending.
func NewClient(hostname string) *Client {
	return &Client{
		Hostname:       hostname,
		ConnectTimeout: 30 * time.Second,
		SendTimeout:    5 * time.Minute,
		MaxRetries:     3,
	}
}

// Send delivers an email to the recipient's mail server.
func (c *Client) Send(ctx context.Context, from string, to []string, data []byte) (*SendResult, error) {
	// Group recipients by domain
	domainRecipients := make(map[string][]string)
	for _, addr := range to {
		domain := extractDomainFromAddr(addr)
		if domain == "" {
			return nil, fmt.Errorf("invalid recipient address: %s", addr)
		}
		domainRecipients[domain] = append(domainRecipients[domain], addr)
	}

	// Send to each domain
	for domain, recipients := range domainRecipients {
		result, err := c.sendToDomain(ctx, from, domain, recipients, data)
		if err != nil {
			return result, err
		}
		if !result.Success {
			return result, nil
		}
	}

	return &SendResult{Success: true, Message: "delivered"}, nil
}

func (c *Client) sendToDomain(ctx context.Context, from, domain string, to []string, data []byte) (*SendResult, error) {
	// Look up MX records
	mxRecords, err := LookupMX(domain)
	if err != nil {
		return &SendResult{
			Success: false,
			Error:   fmt.Errorf("MX lookup failed for %s: %w", domain, err),
		}, nil
	}

	// Try each MX host in priority order
	var lastErr error
	for _, mx := range mxRecords {
		result, err := c.sendToHost(ctx, from, mx.Host, to, data)
		if err == nil && result.Success {
			return result, nil
		}
		if err != nil {
			lastErr = err
		} else {
			lastErr = result.Error
		}
	}

	return &SendResult{
		Success: false,
		Error:   fmt.Errorf("all MX hosts failed for %s: %w", domain, lastErr),
	}, nil
}

func (c *Client) sendToHost(ctx context.Context, from, host string, to []string, data []byte) (*SendResult, error) {
	// Remove trailing dot from MX hostname
	host = strings.TrimSuffix(host, ".")

	// Connect with timeout
	addr := net.JoinHostPort(host, "25")
	dialer := &net.Dialer{Timeout: c.ConnectTimeout}

	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return &SendResult{
			Success: false,
			Error:   fmt.Errorf("connection to %s failed: %w", addr, err),
		}, nil
	}
	defer conn.Close()

	// Set overall deadline
	if deadline, ok := ctx.Deadline(); ok {
		conn.SetDeadline(deadline)
	} else {
		conn.SetDeadline(time.Now().Add(c.SendTimeout))
	}

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return &SendResult{Success: false, Error: err}, nil
	}
	defer client.Close()

	// EHLO
	if err := client.Hello(c.Hostname); err != nil {
		return &SendResult{Success: false, Error: fmt.Errorf("EHLO failed: %w", err)}, nil
	}

	// Try STARTTLS
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: false,
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			// Log but continue without TLS (opportunistic)
			_ = err
		}
	}

	// MAIL FROM
	if err := client.Mail(from); err != nil {
		return &SendResult{Success: false, Error: fmt.Errorf("MAIL FROM failed: %w", err)}, nil
	}

	// RCPT TO
	for _, addr := range to {
		if err := client.Rcpt(addr); err != nil {
			return &SendResult{Success: false, Error: fmt.Errorf("RCPT TO %s failed: %w", addr, err)}, nil
		}
	}

	// DATA
	w, err := client.Data()
	if err != nil {
		return &SendResult{Success: false, Error: fmt.Errorf("DATA failed: %w", err)}, nil
	}

	if _, err := w.Write(data); err != nil {
		return &SendResult{Success: false, Error: fmt.Errorf("write data failed: %w", err)}, nil
	}

	if err := w.Close(); err != nil {
		return &SendResult{Success: false, Error: fmt.Errorf("close data failed: %w", err)}, nil
	}

	// QUIT
	client.Quit()

	return &SendResult{Success: true, Message: "delivered to " + host}, nil
}

// MXRecord represents a DNS MX record.
type MXRecord struct {
	Host     string
	Priority uint16
}

// LookupMX retrieves MX records for a domain, sorted by priority.
func LookupMX(domain string) ([]MXRecord, error) {
	mxRecords, err := net.LookupMX(domain)
	if err != nil {
		// Fallback: try the domain itself as the mail server
		return []MXRecord{{Host: domain, Priority: 0}}, nil
	}

	if len(mxRecords) == 0 {
		return []MXRecord{{Host: domain, Priority: 0}}, nil
	}

	result := make([]MXRecord, len(mxRecords))
	for i, mx := range mxRecords {
		result[i] = MXRecord{
			Host:     mx.Host,
			Priority: mx.Pref,
		}
	}

	return result, nil
}
