package smtp

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"time"
)

// MessageHandler is called when a complete email message is received.
type MessageHandler func(envelope *Envelope) error

// DomainChecker verifies if a domain is handled by this server.
type DomainChecker func(domain string) bool

// AuthHandler verifies credentials for SMTP submission.
type AuthHandler func(username, password string) (bool, error)

// Envelope holds the SMTP transaction state.
type Envelope struct {
	RemoteAddr net.Addr
	From       string
	To         []string
	Data       []byte
	TLS        bool
	AuthUser   string
}

// Server is an SMTP server that receives inbound email.
type Server struct {
	Hostname       string
	Port           int
	MaxMessageSize int
	MaxRecipients  int
	ReadTimeout    time.Duration
	WriteTimeout   time.Duration
	MaxConnections int

	TLSConfig *tls.Config

	OnMessage    MessageHandler
	CheckDomain  DomainChecker
	AuthHandler  AuthHandler

	listener   net.Listener
	wg         sync.WaitGroup
	quit       chan struct{}
	connCount  int
	connMu     sync.Mutex
}

// NewServer creates a new SMTP server.
func NewServer(hostname string, port int) *Server {
	return &Server{
		Hostname:       hostname,
		Port:           port,
		MaxMessageSize: 25 * 1024 * 1024, // 25 MB
		MaxRecipients:  100,
		ReadTimeout:    5 * time.Minute,
		WriteTimeout:   5 * time.Minute,
		MaxConnections: 100,
		quit:           make(chan struct{}),
	}
}

// ListenAndServe starts the SMTP server.
func (s *Server) ListenAndServe() error {
	addr := fmt.Sprintf(":%d", s.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}
	s.listener = listener
	log.Printf("SMTP server listening on %s", addr)

	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-s.quit:
				return nil
			default:
				log.Printf("accept error: %v", err)
				continue
			}
		}

		s.connMu.Lock()
		if s.connCount >= s.MaxConnections {
			s.connMu.Unlock()
			conn.Close()
			continue
		}
		s.connCount++
		s.connMu.Unlock()

		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer func() {
				s.connMu.Lock()
				s.connCount--
				s.connMu.Unlock()
			}()
			s.handleConnection(conn)
		}()
	}
}

// Shutdown gracefully stops the server.
func (s *Server) Shutdown() {
	close(s.quit)
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
}

func (s *Server) handleConnection(conn net.Conn) {
	defer conn.Close()

	session := &session{
		server: s,
		conn:   conn,
		reader: bufio.NewReader(conn),
		writer: bufio.NewWriter(conn),
		envelope: &Envelope{
			RemoteAddr: conn.RemoteAddr(),
		},
	}

	session.writeLine(fmt.Sprintf("220 %s ESMTP Wistfare", s.Hostname))

	for {
		if s.ReadTimeout > 0 {
			conn.SetReadDeadline(time.Now().Add(s.ReadTimeout))
		}

		line, err := session.readLine()
		if err != nil {
			if err != io.EOF {
				log.Printf("read error from %s: %v", conn.RemoteAddr(), err)
			}
			return
		}

		if !session.handleCommand(line) {
			return
		}
	}
}

type session struct {
	server    *Server
	conn      net.Conn
	reader    *bufio.Reader
	writer    *bufio.Writer
	envelope  *Envelope
	ehloSent  bool
	mailFrom  bool
	tls       bool
}

func (s *session) readLine() (string, error) {
	line, err := s.reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func (s *session) writeLine(line string) {
	s.writer.WriteString(line + "\r\n")
	s.writer.Flush()
}

func (s *session) handleCommand(line string) bool {
	parts := strings.SplitN(line, " ", 2)
	cmd := strings.ToUpper(parts[0])
	var arg string
	if len(parts) > 1 {
		arg = parts[1]
	}

	switch cmd {
	case "EHLO", "HELO":
		s.handleEHLO(arg)
	case "MAIL":
		s.handleMAIL(arg)
	case "RCPT":
		s.handleRCPT(arg)
	case "DATA":
		s.handleDATA()
	case "STARTTLS":
		s.handleSTARTTLS()
	case "AUTH":
		s.handleAUTH(arg)
	case "RSET":
		s.handleRSET()
	case "NOOP":
		s.writeLine("250 OK")
	case "QUIT":
		s.writeLine("221 Bye")
		return false
	default:
		s.writeLine("502 Command not implemented")
	}
	return true
}

func (s *session) handleEHLO(domain string) {
	s.ehloSent = true
	s.resetEnvelope()

	s.writeLine(fmt.Sprintf("250-%s Hello %s", s.server.Hostname, domain))
	s.writeLine(fmt.Sprintf("250-SIZE %d", s.server.MaxMessageSize))
	s.writeLine("250-8BITMIME")
	s.writeLine("250-PIPELINING")
	s.writeLine("250-ENHANCEDSTATUSCODES")

	if s.server.TLSConfig != nil && !s.tls {
		s.writeLine("250-STARTTLS")
	}
	if s.server.AuthHandler != nil {
		s.writeLine("250-AUTH PLAIN LOGIN")
	}
	s.writeLine("250 SMTPUTF8")
}

func (s *session) handleMAIL(arg string) {
	if !s.ehloSent {
		s.writeLine("503 Error: send EHLO first")
		return
	}

	from := extractAddress(arg, "FROM:")
	if from == "" {
		s.writeLine("501 Syntax error in MAIL FROM")
		return
	}

	s.envelope.From = from
	s.mailFrom = true
	s.writeLine("250 OK")
}

func (s *session) handleRCPT(arg string) {
	if !s.mailFrom {
		s.writeLine("503 Error: need MAIL command first")
		return
	}

	to := extractAddress(arg, "TO:")
	if to == "" {
		s.writeLine("501 Syntax error in RCPT TO")
		return
	}

	if len(s.envelope.To) >= s.server.MaxRecipients {
		s.writeLine("452 Too many recipients")
		return
	}

	// Check if we handle this domain (for inbound mail)
	if s.server.CheckDomain != nil && s.envelope.AuthUser == "" {
		domain := extractDomainFromAddr(to)
		if !s.server.CheckDomain(domain) {
			s.writeLine("550 Relay not permitted")
			return
		}
	}

	s.envelope.To = append(s.envelope.To, to)
	s.writeLine("250 OK")
}

func (s *session) handleDATA() {
	if len(s.envelope.To) == 0 {
		s.writeLine("503 Error: need RCPT command first")
		return
	}

	s.writeLine("354 Start mail input; end with <CRLF>.<CRLF>")

	var data []byte
	for {
		line, err := s.reader.ReadBytes('\n')
		if err != nil {
			return
		}
		// Check for end of data marker
		trimmed := strings.TrimRight(string(line), "\r\n")
		if trimmed == "." {
			break
		}
		// Dot-stuffing: remove leading dot if line starts with ".."
		if strings.HasPrefix(trimmed, "..") {
			line = line[1:]
		}

		if len(data)+len(line) > s.server.MaxMessageSize {
			s.writeLine("552 Message size exceeds maximum")
			return
		}
		data = append(data, line...)
	}

	s.envelope.Data = data
	s.envelope.TLS = s.tls

	if s.server.OnMessage != nil {
		if err := s.server.OnMessage(s.envelope); err != nil {
			log.Printf("message handler error: %v", err)
			s.writeLine("451 Internal server error")
			return
		}
	}

	s.writeLine("250 OK: message queued")
	s.resetEnvelope()
}

func (s *session) handleSTARTTLS() {
	if s.server.TLSConfig == nil {
		s.writeLine("454 TLS not available")
		return
	}
	if s.tls {
		s.writeLine("503 Already in TLS mode")
		return
	}

	s.writeLine("220 Ready to start TLS")

	tlsConn := tls.Server(s.conn, s.server.TLSConfig)
	if err := tlsConn.Handshake(); err != nil {
		log.Printf("TLS handshake error: %v", err)
		return
	}

	s.conn = tlsConn
	s.reader = bufio.NewReader(tlsConn)
	s.writer = bufio.NewWriter(tlsConn)
	s.tls = true
	s.ehloSent = false
	s.resetEnvelope()
}

func (s *session) handleAUTH(arg string) {
	if s.server.AuthHandler == nil {
		s.writeLine("503 AUTH not supported")
		return
	}

	parts := strings.SplitN(arg, " ", 2)
	mechanism := strings.ToUpper(parts[0])

	switch mechanism {
	case "PLAIN":
		s.handleAUTHPlain(parts)
	default:
		s.writeLine("504 Unrecognized authentication mechanism")
	}
}

func (s *session) handleAUTHPlain(parts []string) {
	var encoded string
	if len(parts) > 1 {
		encoded = parts[1]
	} else {
		s.writeLine("334 ")
		line, err := s.readLine()
		if err != nil {
			return
		}
		encoded = line
	}

	// Decode base64 PLAIN auth: \0username\0password
	decoded, err := decodeBase64(encoded)
	if err != nil {
		s.writeLine("535 Authentication failed")
		return
	}

	// Split by null bytes
	authParts := strings.SplitN(string(decoded), "\x00", 3)
	if len(authParts) != 3 {
		s.writeLine("535 Authentication failed")
		return
	}

	username := authParts[1]
	password := authParts[2]

	ok, err := s.server.AuthHandler(username, password)
	if err != nil || !ok {
		s.writeLine("535 Authentication failed")
		return
	}

	s.envelope.AuthUser = username
	s.writeLine("235 Authentication successful")
}

func (s *session) handleRSET() {
	s.resetEnvelope()
	s.writeLine("250 OK")
}

func (s *session) resetEnvelope() {
	s.envelope = &Envelope{
		RemoteAddr: s.conn.RemoteAddr(),
		AuthUser:   s.envelope.AuthUser,
	}
	s.mailFrom = false
}

// extractAddress extracts email address from MAIL FROM:<addr> or RCPT TO:<addr>
func extractAddress(arg, prefix string) string {
	arg = strings.TrimSpace(arg)
	upper := strings.ToUpper(arg)

	if !strings.HasPrefix(upper, prefix) {
		return ""
	}

	addr := arg[len(prefix):]
	addr = strings.TrimSpace(addr)
	addr = strings.TrimPrefix(addr, "<")

	// Handle parameters (SIZE=xxx, etc.)
	if idx := strings.Index(addr, ">"); idx >= 0 {
		addr = addr[:idx]
	}

	return strings.TrimSpace(addr)
}

func extractDomainFromAddr(addr string) string {
	parts := strings.Split(addr, "@")
	if len(parts) < 2 {
		return ""
	}
	return strings.ToLower(parts[len(parts)-1])
}

func decodeBase64(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}
