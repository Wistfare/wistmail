package smtp

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

func startTestServer(t *testing.T, handler MessageHandler, domainChecker DomainChecker) (string, func()) {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start test listener: %v", err)
	}

	server := &Server{
		Hostname:       "test.local",
		MaxMessageSize: 1024 * 1024,
		MaxRecipients:  10,
		ReadTimeout:    5 * time.Second,
		WriteTimeout:   5 * time.Second,
		MaxConnections: 10,
		OnMessage:      handler,
		CheckDomain:    domainChecker,
		quit:           make(chan struct{}),
	}
	server.listener = listener

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-server.quit:
					return
				default:
					continue
				}
			}
			server.wg.Add(1)
			go func() {
				defer server.wg.Done()
				server.handleConnection(conn)
			}()
		}
	}()

	return listener.Addr().String(), func() {
		server.Shutdown()
	}
}

func dialSMTP(t *testing.T, addr string) (net.Conn, *bufio.Reader) {
	t.Helper()
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	reader := bufio.NewReader(conn)
	// Read greeting
	line, _ := reader.ReadString('\n')
	if !strings.HasPrefix(line, "220") {
		t.Fatalf("expected 220 greeting, got: %s", line)
	}
	return conn, reader
}

func sendCmd(conn net.Conn, reader *bufio.Reader, cmd string) string {
	fmt.Fprintf(conn, "%s\r\n", cmd)
	line, _ := reader.ReadString('\n')
	return strings.TrimSpace(line)
}

func TestServer_Greeting(t *testing.T) {
	addr, cleanup := startTestServer(t, nil, nil)
	defer cleanup()

	conn, _ := dialSMTP(t, addr)
	defer conn.Close()
}

func TestServer_EHLO(t *testing.T) {
	addr, cleanup := startTestServer(t, nil, nil)
	defer cleanup()

	conn, reader := dialSMTP(t, addr)
	defer conn.Close()

	fmt.Fprintf(conn, "EHLO client.local\r\n")

	// Read all EHLO response lines
	var lines []string
	for {
		line, _ := reader.ReadString('\n')
		line = strings.TrimSpace(line)
		lines = append(lines, line)
		if strings.HasPrefix(line, "250 ") { // Last line has "250 " (space, not dash)
			break
		}
	}

	if len(lines) < 2 {
		t.Errorf("expected multiple EHLO lines, got %d", len(lines))
	}

	foundSize := false
	for _, l := range lines {
		if strings.Contains(l, "SIZE") {
			foundSize = true
		}
	}
	if !foundSize {
		t.Error("EHLO response missing SIZE extension")
	}
}

func TestServer_FullTransaction(t *testing.T) {
	var received *Envelope
	handler := func(env *Envelope) error {
		received = env
		return nil
	}
	checker := func(domain string) bool {
		return domain == "example.com"
	}

	addr, cleanup := startTestServer(t, handler, checker)
	defer cleanup()

	conn, reader := dialSMTP(t, addr)
	defer conn.Close()

	// EHLO
	fmt.Fprintf(conn, "EHLO client.local\r\n")
	for {
		line, _ := reader.ReadString('\n')
		if strings.HasPrefix(strings.TrimSpace(line), "250 ") {
			break
		}
	}

	// MAIL FROM
	resp := sendCmd(conn, reader, "MAIL FROM:<sender@sender.com>")
	if !strings.HasPrefix(resp, "250") {
		t.Errorf("MAIL FROM failed: %s", resp)
	}

	// RCPT TO
	resp = sendCmd(conn, reader, "RCPT TO:<user@example.com>")
	if !strings.HasPrefix(resp, "250") {
		t.Errorf("RCPT TO failed: %s", resp)
	}

	// DATA
	resp = sendCmd(conn, reader, "DATA")
	if !strings.HasPrefix(resp, "354") {
		t.Errorf("DATA failed: %s", resp)
	}

	// Send message data
	fmt.Fprintf(conn, "From: sender@sender.com\r\n")
	fmt.Fprintf(conn, "To: user@example.com\r\n")
	fmt.Fprintf(conn, "Subject: Test\r\n")
	fmt.Fprintf(conn, "\r\n")
	fmt.Fprintf(conn, "Hello, World!\r\n")
	fmt.Fprintf(conn, ".\r\n")

	resp, _ = reader.ReadString('\n')
	resp = strings.TrimSpace(resp)
	if !strings.HasPrefix(resp, "250") {
		t.Errorf("DATA end failed: %s", resp)
	}

	// QUIT
	sendCmd(conn, reader, "QUIT")

	// Verify received envelope
	if received == nil {
		t.Fatal("no message received")
	}
	if received.From != "sender@sender.com" {
		t.Errorf("expected From=sender@sender.com, got %s", received.From)
	}
	if len(received.To) != 1 || received.To[0] != "user@example.com" {
		t.Errorf("unexpected To: %v", received.To)
	}
	if !strings.Contains(string(received.Data), "Hello, World!") {
		t.Error("message body not found in data")
	}
}

func TestServer_RelayDenied(t *testing.T) {
	checker := func(domain string) bool {
		return domain == "example.com"
	}

	addr, cleanup := startTestServer(t, nil, checker)
	defer cleanup()

	conn, reader := dialSMTP(t, addr)
	defer conn.Close()

	// EHLO
	fmt.Fprintf(conn, "EHLO client.local\r\n")
	for {
		line, _ := reader.ReadString('\n')
		if strings.HasPrefix(strings.TrimSpace(line), "250 ") {
			break
		}
	}

	sendCmd(conn, reader, "MAIL FROM:<sender@sender.com>")
	resp := sendCmd(conn, reader, "RCPT TO:<user@otherdomain.com>")

	if !strings.HasPrefix(resp, "550") {
		t.Errorf("expected relay denied (550), got: %s", resp)
	}
}

func TestServer_NoMailBeforeRcpt(t *testing.T) {
	addr, cleanup := startTestServer(t, nil, nil)
	defer cleanup()

	conn, reader := dialSMTP(t, addr)
	defer conn.Close()

	// EHLO
	fmt.Fprintf(conn, "EHLO client.local\r\n")
	for {
		line, _ := reader.ReadString('\n')
		if strings.HasPrefix(strings.TrimSpace(line), "250 ") {
			break
		}
	}

	resp := sendCmd(conn, reader, "RCPT TO:<user@example.com>")
	if !strings.HasPrefix(resp, "503") {
		t.Errorf("expected 503 error, got: %s", resp)
	}
}

func TestServer_RSET(t *testing.T) {
	addr, cleanup := startTestServer(t, nil, nil)
	defer cleanup()

	conn, reader := dialSMTP(t, addr)
	defer conn.Close()

	fmt.Fprintf(conn, "EHLO client.local\r\n")
	for {
		line, _ := reader.ReadString('\n')
		if strings.HasPrefix(strings.TrimSpace(line), "250 ") {
			break
		}
	}

	resp := sendCmd(conn, reader, "RSET")
	if !strings.HasPrefix(resp, "250") {
		t.Errorf("RSET failed: %s", resp)
	}
}

func TestServer_NOOP(t *testing.T) {
	addr, cleanup := startTestServer(t, nil, nil)
	defer cleanup()

	conn, reader := dialSMTP(t, addr)
	defer conn.Close()

	resp := sendCmd(conn, reader, "NOOP")
	if !strings.HasPrefix(resp, "250") {
		t.Errorf("NOOP failed: %s", resp)
	}
}

func TestExtractAddress(t *testing.T) {
	tests := []struct {
		input    string
		prefix   string
		expected string
	}{
		{"FROM:<user@example.com>", "FROM:", "user@example.com"},
		{"FROM: <user@example.com>", "FROM:", "user@example.com"},
		{"TO:<user@example.com>", "TO:", "user@example.com"},
		{"TO:<user@example.com> SIZE=1234", "TO:", "user@example.com"},
		{"from:<User@Example.Com>", "FROM:", "User@Example.Com"},
		{"INVALID", "FROM:", ""},
	}

	for _, tt := range tests {
		result := extractAddress(tt.input, tt.prefix)
		if result != tt.expected {
			t.Errorf("extractAddress(%q, %q) = %q, want %q", tt.input, tt.prefix, result, tt.expected)
		}
	}
}

func TestExtractDomainFromAddr(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"user@example.com", "example.com"},
		{"user@Example.COM", "example.com"},
		{"noatsign", ""},
	}

	for _, tt := range tests {
		result := extractDomainFromAddr(tt.input)
		if result != tt.expected {
			t.Errorf("extractDomainFromAddr(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}
