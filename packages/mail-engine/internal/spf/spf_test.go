package spf

import (
	"net"
	"testing"
)

func TestMatchIP4(t *testing.T) {
	tests := []struct {
		ip       string
		cidr     string
		expected bool
	}{
		{"192.168.1.1", "192.168.1.0/24", true},
		{"192.168.1.1", "192.168.1.1", true},
		{"192.168.2.1", "192.168.1.0/24", false},
		{"10.0.0.1", "10.0.0.0/8", true},
		{"10.0.0.1", "192.168.0.0/16", false},
	}

	for _, tt := range tests {
		ip := net.ParseIP(tt.ip)
		result := matchIP4(ip, tt.cidr)
		if result != tt.expected {
			t.Errorf("matchIP4(%s, %s) = %v, want %v", tt.ip, tt.cidr, result, tt.expected)
		}
	}
}

func TestMatchIP6(t *testing.T) {
	tests := []struct {
		ip       string
		cidr     string
		expected bool
	}{
		{"2001:db8::1", "2001:db8::/32", true},
		{"2001:db8::1", "2001:db8::1", true},
		{"2001:db9::1", "2001:db8::/32", false},
	}

	for _, tt := range tests {
		ip := net.ParseIP(tt.ip)
		result := matchIP6(ip, tt.cidr)
		if result != tt.expected {
			t.Errorf("matchIP6(%s, %s) = %v, want %v", tt.ip, tt.cidr, result, tt.expected)
		}
	}
}

func TestQualifierToResult(t *testing.T) {
	tests := []struct {
		qualifier rune
		expected  Result
	}{
		{'+', ResultPass},
		{'-', ResultFail},
		{'~', ResultSoftFail},
		{'?', ResultNeutral},
	}

	for _, tt := range tests {
		result := qualifierToResult(tt.qualifier)
		if result != tt.expected {
			t.Errorf("qualifierToResult(%c) = %s, want %s", tt.qualifier, result, tt.expected)
		}
	}
}

func TestGenerateRecord(t *testing.T) {
	record := GenerateRecord("203.0.113.5")
	expected := "v=spf1 ip4:203.0.113.5 -all"
	if record != expected {
		t.Errorf("GenerateRecord = %q, want %q", record, expected)
	}
}

func TestEvaluateSPF_All(t *testing.T) {
	ip := net.ParseIP("1.2.3.4")

	// +all should pass
	result, err := evaluateSPF(ip, "example.com", "v=spf1 +all", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultPass {
		t.Errorf("expected pass, got %s", result.Result)
	}

	// -all should fail
	result, err = evaluateSPF(ip, "example.com", "v=spf1 -all", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultFail {
		t.Errorf("expected fail, got %s", result.Result)
	}

	// ~all should softfail
	result, err = evaluateSPF(ip, "example.com", "v=spf1 ~all", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultSoftFail {
		t.Errorf("expected softfail, got %s", result.Result)
	}
}

func TestEvaluateSPF_IP4Match(t *testing.T) {
	ip := net.ParseIP("203.0.113.5")

	result, err := evaluateSPF(ip, "example.com", "v=spf1 ip4:203.0.113.0/24 -all", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultPass {
		t.Errorf("expected pass for matching IP4, got %s", result.Result)
	}
}

func TestEvaluateSPF_IP4NoMatch(t *testing.T) {
	ip := net.ParseIP("10.0.0.1")

	result, err := evaluateSPF(ip, "example.com", "v=spf1 ip4:203.0.113.0/24 -all", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultFail {
		t.Errorf("expected fail for non-matching IP4, got %s", result.Result)
	}
}

func TestEvaluateSPF_DepthLimit(t *testing.T) {
	ip := net.ParseIP("1.2.3.4")

	result, err := evaluateSPF(ip, "example.com", "v=spf1 +all", 11)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultPermError {
		t.Errorf("expected permerror at depth > 10, got %s", result.Result)
	}
}

func TestEvaluateSPF_InvalidRecord(t *testing.T) {
	ip := net.ParseIP("1.2.3.4")

	result, err := evaluateSPF(ip, "example.com", "invalid record", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultPermError {
		t.Errorf("expected permerror for invalid record, got %s", result.Result)
	}
}

func TestEvaluateSPF_NoMatch(t *testing.T) {
	ip := net.ParseIP("1.2.3.4")

	result, err := evaluateSPF(ip, "example.com", "v=spf1 ip4:10.0.0.0/8", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultNeutral {
		t.Errorf("expected neutral when no mechanism matches, got %s", result.Result)
	}
}

func TestEvaluateSPF_MultipleIP4(t *testing.T) {
	ip := net.ParseIP("10.0.0.5")

	result, err := evaluateSPF(ip, "example.com", "v=spf1 ip4:192.168.0.0/16 ip4:10.0.0.0/8 -all", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != ResultPass {
		t.Errorf("expected pass for second IP4 match, got %s", result.Result)
	}
}
