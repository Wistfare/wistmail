package dmarc

import (
	"fmt"
	"net"
	"strings"
)

// Policy represents the DMARC policy action.
type Policy string

const (
	PolicyNone       Policy = "none"
	PolicyQuarantine Policy = "quarantine"
	PolicyReject     Policy = "reject"
)

// Record represents a parsed DMARC record.
type Record struct {
	Version          string // v=DMARC1
	Policy           Policy // p=none|quarantine|reject
	SubdomainPolicy  Policy // sp=none|quarantine|reject
	Percentage       int    // pct=0-100
	RuaAddresses     []string // rua=mailto:...
	RufAddresses     []string // ruf=mailto:...
	AlignmentDKIM    string // adkim=r|s (relaxed|strict)
	AlignmentSPF     string // aspf=r|s (relaxed|strict)
	FailureOptions   string // fo=0|1|d|s
	ReportFormat     string // rf=afrf
	ReportInterval   int    // ri=seconds
}

// CheckResult holds the DMARC evaluation result.
type CheckResult struct {
	HasRecord     bool
	Record        *Record
	Policy        Policy
	SPFAligned    bool
	DKIMAligned   bool
	Disposition   Policy
}

// Lookup retrieves and parses the DMARC record for a domain.
func Lookup(domain string) (*Record, error) {
	dmarcDomain := "_dmarc." + domain

	txtRecords, err := net.LookupTXT(dmarcDomain)
	if err != nil {
		return nil, fmt.Errorf("DNS lookup failed for %s: %w", dmarcDomain, err)
	}

	for _, txt := range txtRecords {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(txt)), "v=dmarc1") {
			return ParseRecord(txt)
		}
	}

	return nil, fmt.Errorf("no DMARC record found for %s", domain)
}

// ParseRecord parses a DMARC TXT record string.
func ParseRecord(txt string) (*Record, error) {
	record := &Record{
		Percentage:    100,
		AlignmentDKIM: "r",
		AlignmentSPF:  "r",
		ReportFormat:  "afrf",
		ReportInterval: 86400,
	}

	tags := strings.Split(txt, ";")
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}

		parts := strings.SplitN(tag, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(strings.ToLower(parts[0]))
		value := strings.TrimSpace(parts[1])

		switch key {
		case "v":
			record.Version = value
		case "p":
			record.Policy = parsePolicy(value)
		case "sp":
			record.SubdomainPolicy = parsePolicy(value)
		case "pct":
			fmt.Sscanf(value, "%d", &record.Percentage)
		case "rua":
			record.RuaAddresses = parseAddresses(value)
		case "ruf":
			record.RufAddresses = parseAddresses(value)
		case "adkim":
			record.AlignmentDKIM = strings.ToLower(value)
		case "aspf":
			record.AlignmentSPF = strings.ToLower(value)
		case "fo":
			record.FailureOptions = value
		case "rf":
			record.ReportFormat = value
		case "ri":
			fmt.Sscanf(value, "%d", &record.ReportInterval)
		}
	}

	if record.Version == "" {
		return nil, fmt.Errorf("missing DMARC version tag")
	}
	if record.Policy == "" {
		return nil, fmt.Errorf("missing DMARC policy tag")
	}

	// Default subdomain policy to main policy
	if record.SubdomainPolicy == "" {
		record.SubdomainPolicy = record.Policy
	}

	return record, nil
}

// Evaluate checks if an email passes DMARC based on SPF and DKIM results.
func Evaluate(fromDomain string, spfDomain string, spfPass bool, dkimDomain string, dkimPass bool) *CheckResult {
	result := &CheckResult{}

	record, err := Lookup(fromDomain)
	if err != nil {
		result.HasRecord = false
		result.Disposition = PolicyNone
		return result
	}

	result.HasRecord = true
	result.Record = record
	result.Policy = record.Policy

	// Check SPF alignment
	if spfPass {
		if record.AlignmentSPF == "s" {
			result.SPFAligned = strings.EqualFold(spfDomain, fromDomain)
		} else {
			result.SPFAligned = isSubdomainOf(spfDomain, fromDomain) || strings.EqualFold(spfDomain, fromDomain)
		}
	}

	// Check DKIM alignment
	if dkimPass {
		if record.AlignmentDKIM == "s" {
			result.DKIMAligned = strings.EqualFold(dkimDomain, fromDomain)
		} else {
			result.DKIMAligned = isSubdomainOf(dkimDomain, fromDomain) || strings.EqualFold(dkimDomain, fromDomain)
		}
	}

	// DMARC passes if either SPF or DKIM is aligned
	if result.SPFAligned || result.DKIMAligned {
		result.Disposition = PolicyNone
	} else {
		result.Disposition = record.Policy
	}

	return result
}

// GenerateRecord creates a DMARC TXT record value.
func GenerateRecord(policy Policy, ruaEmail string) string {
	record := fmt.Sprintf("v=DMARC1; p=%s", policy)
	if ruaEmail != "" {
		record += fmt.Sprintf("; rua=mailto:%s", ruaEmail)
	}
	return record
}

func parsePolicy(value string) Policy {
	switch strings.ToLower(value) {
	case "none":
		return PolicyNone
	case "quarantine":
		return PolicyQuarantine
	case "reject":
		return PolicyReject
	default:
		return PolicyNone
	}
}

func parseAddresses(value string) []string {
	parts := strings.Split(value, ",")
	var addresses []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.TrimPrefix(p, "mailto:")
		if p != "" {
			addresses = append(addresses, p)
		}
	}
	return addresses
}

func isSubdomainOf(subdomain, parent string) bool {
	subdomain = strings.ToLower(subdomain)
	parent = strings.ToLower(parent)
	return strings.HasSuffix(subdomain, "."+parent)
}
