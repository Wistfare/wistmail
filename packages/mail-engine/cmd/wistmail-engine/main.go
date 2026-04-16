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

// domainInfo holds cached per-domain data including DKIM signing keys.
type domainInfo struct {
	DkimPrivateKey string
	DkimSelector   string
}

// domainCache caches registered domains and their DKIM keys from the API.
type domainCache struct {
	mu        sync.RWMutex
	domains   map[string]*domainInfo
	lastFetch time.Time
}

var cache = &domainCache{domains: make(map[string]*domainInfo)}

func (c *domainCache) isValid(domain string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, exists := c.domains[strings.ToLower(domain)]
	return exists
}

func (c *domainCache) getDkimInfo(domain string) (privateKeyPEM, selector string) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	info := c.domains[strings.ToLower(domain)]
	if info == nil {
		return "", ""
	}
	return info.DkimPrivateKey, info.DkimSelector
}

func (c *domainCache) refresh() {
	apiURL := os.Getenv("API_INTERNAL_URL")
	if apiURL == "" {
		apiURL = "http://api:3001"
	}

	inboundSecret := os.Getenv("INBOUND_SECRET")

	req, err := http.NewRequest("GET", apiURL+"/api/v1/domains/registered", nil)
	if err != nil {
		log.Printf("Failed to build domains request: %v", err)
		return
	}
	req.Header.Set("X-Inbound-Secret", inboundSecret)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to fetch domains from API: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Domains API returned status %d", resp.StatusCode)
		return
	}

	var result struct {
		Domains []struct {
			Name           string `json:"name"`
			DkimPrivateKey string `json:"dkimPrivateKey"`
			DkimSelector   string `json:"dkimSelector"`
		} `json:"domains"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("Failed to parse domains response: %v", err)
		return
	}

	c.mu.Lock()
	c.domains = make(map[string]*domainInfo, len(result.Domains))
	dkimCount := 0
	for _, d := range result.Domains {
		info := &domainInfo{
			DkimPrivateKey: d.DkimPrivateKey,
			DkimSelector:   d.DkimSelector,
		}
		c.domains[strings.ToLower(d.Name)] = info
		if d.DkimPrivateKey != "" {
			dkimCount++
		}
	}
	c.lastFetch = time.Now()
	c.mu.Unlock()

	log.Printf("Domain cache refreshed: %d domains (%d with DKIM keys)", len(result.Domains), dkimCount)
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

	// Start internal send API with DKIM lookup from domain cache
	sendClient := smtpserver.NewClient(cfg.Hostname)
	go smtpserver.StartSendAPI(cfg.Hostname, 8025, sendClient, cache.getDkimInfo)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)

	server.Shutdown()
	log.Println("Wistfare Mail Engine stopped")
}
