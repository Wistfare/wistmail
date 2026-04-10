package smtp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// InboundEmail represents an incoming email to be stored via the API.
type InboundEmail struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	RawData string   `json:"rawData"`
}

// NotifyAPI sends the received email to the Node.js API for processing and storage.
func NotifyAPI(env *Envelope) error {
	apiURL := os.Getenv("API_INTERNAL_URL")
	if apiURL == "" {
		apiURL = "http://api:3001"
	}

	payload := InboundEmail{
		From:    env.From,
		To:      env.To,
		RawData: string(env.Data),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal email: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(
		apiURL+"/api/v1/inbox/inbound",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return fmt.Errorf("failed to notify API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	log.Printf("Email from %s stored via API (status %d)", env.From, resp.StatusCode)
	return nil
}
