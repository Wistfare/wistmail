package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/Wistfare/wistmail/packages/mail-engine/internal/config"
	smtpserver "github.com/Wistfare/wistmail/packages/mail-engine/internal/smtp"
)

// domainCache caches registered domains from the API to avoid calling it on every email.
type domainCache struct {
	mu      sync.RWMutex
	domains map[string]bool
	lastFetch time.Time
}

var cache = &domainCache{domains: make(map[string]bool)}

func (c *domainCache) isValid(domain string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.domains[strings.ToLower(domain)]
}

func (c *domainCache) refresh() {
	apiURL := os.Getenv("API_INTERNAL_URL")
	if apiURL == "" {
		apiURL = "http://api:3001"
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(apiURL + "/api/v1/domains/registered")
	if err != nil {
		log.Printf("Failed to fetch domains from API: %v", err)
		return
	}
	defer resp.Body.Close()

	var result struct {
		Domains []string `json:"domains"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("Failed to parse domains response: %v", err)
		return
	}

	c.mu.Lock()
	c.domains = make(map[string]bool)
	for _, d := range result.Domains {
		c.domains[strings.ToLower(d)] = true
	}
	c.lastFetch = time.Now()
	c.mu.Unlock()

	log.Printf("Domain cache refreshed: %d domains", len(result.Domains))
}

func main() {
	cfg := config.Load()
	log.Printf("Wistfare Mail Engine starting on %s", cfg.MailDomain)

	// Initial domain cache load
	cache.refresh()

	// Refresh domain cache every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cache.refresh()
		}
	}()

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

	// Set up domain checker — accept emails for all registered domains
	server.CheckDomain = func(domain string) bool {
		// Always accept the primary domain
		if strings.EqualFold(domain, cfg.MailDomain) {
			return true
		}
		// Check cached registered domains
		if cache.isValid(domain) {
			return true
		}
		// Try refreshing cache if domain not found (might be newly registered)
		if time.Since(cache.lastFetch) > 30*time.Second {
			cache.refresh()
			return cache.isValid(domain)
		}
		return false
	}

	// Start SMTP server in goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil {
			log.Fatalf("SMTP server error: %v", err)
		}
	}()

	log.Printf("SMTP server listening on port %s", cfg.SMTPPort)
	fmt.Printf("Accepting emails for %s and all registered domains\n", cfg.MailDomain)

	// Start internal send API (used by the API service to trigger outbound delivery)
	sendClient := smtpserver.NewClient(cfg.Hostname)
	go smtpserver.StartSendAPI(cfg.Hostname, 8025, sendClient)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	server.Shutdown()
	log.Println("Wistfare Mail Engine stopped")
}
