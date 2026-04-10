package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/Wistfare/wistmail/packages/mail-engine/internal/config"
	smtpserver "github.com/Wistfare/wistmail/packages/mail-engine/internal/smtp"
)

func main() {
	cfg := config.Load()
	log.Printf("Wistfare Mail Engine starting on %s", cfg.MailDomain)

	// Create SMTP server
	server := smtpserver.NewServer(cfg.Hostname, cfg.SMTPPort)
	server.MaxMessageSize = cfg.SMTPMaxMessageSize
	server.MaxRecipients = cfg.SMTPMaxRecipients

	// Set up message handler — forward to API for storage
	server.OnMessage = func(env *smtpserver.Envelope) error {
		log.Printf("Received email from %s to %v (%d bytes)",
			env.From, env.To, len(env.Data))

		if err := smtpserver.NotifyAPI(env); err != nil {
			log.Printf("Error storing email via API: %v", err)
			return err
		}

		return nil
	}

	// Set up domain checker
	server.CheckDomain = func(domain string) bool {
		return domain == cfg.MailDomain
	}

	// Start SMTP server in goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil {
			log.Fatalf("SMTP server error: %v", err)
		}
	}()

	log.Printf("SMTP server listening on port %s", cfg.SMTPPort)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	server.Shutdown()
	log.Println("Wistfare Mail Engine stopped")
}
