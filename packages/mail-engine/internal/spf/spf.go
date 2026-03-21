package spf

import (
	"fmt"
	"net"
	"strings"
)

// Result represents the SPF check result.
type Result string

const (
	ResultPass      Result = "pass"
	ResultFail      Result = "fail"
	ResultSoftFail  Result = "softfail"
	ResultNeutral   Result = "neutral"
	ResultNone      Result = "none"
	ResultTempError Result = "temperror"
	ResultPermError Result = "permerror"
)

// CheckResult holds the full SPF check result.
type CheckResult struct {
	Result      Result
	Explanation string
	Domain      string
}

// Check verifies if the given IP is authorized to send for the domain.
func Check(ip net.IP, domain string) (*CheckResult, error) {
	records, err := lookupSPF(domain)
	if err != nil {
		return &CheckResult{
			Result:      ResultTempError,
			Explanation: fmt.Sprintf("DNS lookup failed: %v", err),
			Domain:      domain,
		}, nil
	}

	if len(records) == 0 {
		return &CheckResult{
			Result:      ResultNone,
			Explanation: "No SPF record found",
			Domain:      domain,
		}, nil
	}

	if len(records) > 1 {
		return &CheckResult{
			Result:      ResultPermError,
			Explanation: "Multiple SPF records found",
			Domain:      domain,
		}, nil
	}

	return evaluateSPF(ip, domain, records[0], 0)
}

// GenerateRecord creates an SPF TXT record value.
func GenerateRecord(serverIP string) string {
	return fmt.Sprintf("v=spf1 ip4:%s -all", serverIP)
}

func lookupSPF(domain string) ([]string, error) {
	txtRecords, err := net.LookupTXT(domain)
	if err != nil {
		return nil, err
	}

	var spfRecords []string
	for _, txt := range txtRecords {
		if strings.HasPrefix(strings.ToLower(txt), "v=spf1") {
			spfRecords = append(spfRecords, txt)
		}
	}

	return spfRecords, nil
}

func evaluateSPF(ip net.IP, domain, record string, depth int) (*CheckResult, error) {
	if depth > 10 {
		return &CheckResult{
			Result:      ResultPermError,
			Explanation: "Too many DNS lookups (>10)",
			Domain:      domain,
		}, nil
	}

	terms := strings.Fields(record)
	if len(terms) == 0 || !strings.HasPrefix(strings.ToLower(terms[0]), "v=spf1") {
		return &CheckResult{
			Result:      ResultPermError,
			Explanation: "Invalid SPF record",
			Domain:      domain,
		}, nil
	}

	// Process each term after "v=spf1"
	for _, term := range terms[1:] {
		term = strings.TrimSpace(term)
		if term == "" {
			continue
		}

		qualifier := '+'
		mechanism := term

		// Parse qualifier
		switch term[0] {
		case '+', '-', '~', '?':
			qualifier = rune(term[0])
			mechanism = term[1:]
		}

		matched, err := matchMechanism(ip, domain, mechanism, depth)
		if err != nil {
			return &CheckResult{
				Result:      ResultTempError,
				Explanation: fmt.Sprintf("Error evaluating mechanism %s: %v", mechanism, err),
				Domain:      domain,
			}, nil
		}

		if matched {
			result := qualifierToResult(qualifier)
			return &CheckResult{
				Result:      result,
				Explanation: fmt.Sprintf("Matched mechanism: %s%s", string(qualifier), mechanism),
				Domain:      domain,
			}, nil
		}
	}

	// Default result if no mechanism matched
	return &CheckResult{
		Result:      ResultNeutral,
		Explanation: "No mechanism matched",
		Domain:      domain,
	}, nil
}

func matchMechanism(ip net.IP, domain, mechanism string, depth int) (bool, error) {
	parts := strings.SplitN(mechanism, ":", 2)
	mechType := strings.ToLower(parts[0])
	var value string
	if len(parts) > 1 {
		value = parts[1]
	}

	switch mechType {
	case "all":
		return true, nil

	case "ip4":
		if value == "" {
			return false, nil
		}
		return matchIP4(ip, value), nil

	case "ip6":
		if value == "" {
			return false, nil
		}
		return matchIP6(ip, value), nil

	case "a":
		targetDomain := domain
		if value != "" {
			targetDomain = value
		}
		return matchA(ip, targetDomain)

	case "mx":
		targetDomain := domain
		if value != "" {
			targetDomain = value
		}
		return matchMX(ip, targetDomain)

	case "include":
		if value == "" {
			return false, nil
		}
		return matchInclude(ip, value, depth)

	default:
		// Unknown mechanism - skip
		return false, nil
	}
}

func matchIP4(ip net.IP, cidr string) bool {
	if !strings.Contains(cidr, "/") {
		cidr += "/32"
	}
	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return false
	}
	return network.Contains(ip)
}

func matchIP6(ip net.IP, cidr string) bool {
	if !strings.Contains(cidr, "/") {
		cidr += "/128"
	}
	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return false
	}
	return network.Contains(ip)
}

func matchA(ip net.IP, domain string) (bool, error) {
	ips, err := net.LookupHost(domain)
	if err != nil {
		return false, nil // DNS failure = no match
	}
	for _, resolved := range ips {
		if net.ParseIP(resolved).Equal(ip) {
			return true, nil
		}
	}
	return false, nil
}

func matchMX(ip net.IP, domain string) (bool, error) {
	mxRecords, err := net.LookupMX(domain)
	if err != nil {
		return false, nil
	}
	for _, mx := range mxRecords {
		host := strings.TrimSuffix(mx.Host, ".")
		match, _ := matchA(ip, host)
		if match {
			return true, nil
		}
	}
	return false, nil
}

func matchInclude(ip net.IP, domain string, depth int) (bool, error) {
	records, err := lookupSPF(domain)
	if err != nil || len(records) == 0 {
		return false, nil
	}

	result, err := evaluateSPF(ip, domain, records[0], depth+1)
	if err != nil {
		return false, err
	}

	return result.Result == ResultPass, nil
}

func qualifierToResult(qualifier rune) Result {
	switch qualifier {
	case '+':
		return ResultPass
	case '-':
		return ResultFail
	case '~':
		return ResultSoftFail
	case '?':
		return ResultNeutral
	default:
		return ResultNeutral
	}
}
