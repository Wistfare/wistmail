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
	log.Printf("WistMail Engine starting on %s", cfg.MailDomain)

	// Create SMTP server
	server := smtpserver.NewServer(cfg.Hostname, cfg.SMTPPort)
	server.MaxMessageSize = cfg.SMTPMaxMessageSize
	server.MaxRecipients = cfg.SMTPMaxRecipients

	// Set up message handler
	server.OnMessage = func(env *smtpserver.Envelope) error {
		log.Printf("Received email from %s to %v (%d bytes)",
			env.From, env.To, len(env.Data))
		// TODO: Parse, store, and process email
		return nil
	}

	// Set up domain checker
	server.CheckDomain = func(domain string) bool {
		// TODO: Check against database
		return domain == cfg.MailDomain
	}

	// Start SMTP server in goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil {
			log.Fatalf("SMTP server error: %v", err)
		}
	}()

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	server.Shutdown()
	log.Println("WistMail Engine stopped")
}
