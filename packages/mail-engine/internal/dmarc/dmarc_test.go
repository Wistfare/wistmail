package dmarc

import (
	"testing"
)

func TestParseRecord(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected *Record
		wantErr  bool
	}{
		{
			name:  "basic reject policy",
			input: "v=DMARC1; p=reject",
			expected: &Record{
				Version:         "DMARC1",
				Policy:          PolicyReject,
				SubdomainPolicy: PolicyReject,
				Percentage:      100,
				AlignmentDKIM:   "r",
				AlignmentSPF:    "r",
			},
		},
		{
			name:  "full record",
			input: "v=DMARC1; p=quarantine; sp=reject; pct=50; adkim=s; aspf=s; rua=mailto:dmarc@example.com",
			expected: &Record{
				Version:         "DMARC1",
				Policy:          PolicyQuarantine,
				SubdomainPolicy: PolicyReject,
				Percentage:      50,
				AlignmentDKIM:   "s",
				AlignmentSPF:    "s",
				RuaAddresses:    []string{"dmarc@example.com"},
			},
		},
		{
			name:  "none policy",
			input: "v=DMARC1; p=none; rua=mailto:reports@example.com",
			expected: &Record{
				Version:         "DMARC1",
				Policy:          PolicyNone,
				SubdomainPolicy: PolicyNone,
				RuaAddresses:    []string{"reports@example.com"},
			},
		},
		{
			name:    "missing version",
			input:   "p=reject",
			wantErr: true,
		},
		{
			name:    "missing policy",
			input:   "v=DMARC1",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			record, err := ParseRecord(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if record.Version != tt.expected.Version {
				t.Errorf("Version = %s, want %s", record.Version, tt.expected.Version)
			}
			if record.Policy != tt.expected.Policy {
				t.Errorf("Policy = %s, want %s", record.Policy, tt.expected.Policy)
			}
			if record.SubdomainPolicy != tt.expected.SubdomainPolicy {
				t.Errorf("SubdomainPolicy = %s, want %s", record.SubdomainPolicy, tt.expected.SubdomainPolicy)
			}
			if tt.expected.Percentage != 0 && record.Percentage != tt.expected.Percentage {
				t.Errorf("Percentage = %d, want %d", record.Percentage, tt.expected.Percentage)
			}
			if tt.expected.AlignmentDKIM != "" && record.AlignmentDKIM != tt.expected.AlignmentDKIM {
				t.Errorf("AlignmentDKIM = %s, want %s", record.AlignmentDKIM, tt.expected.AlignmentDKIM)
			}
			if tt.expected.AlignmentSPF != "" && record.AlignmentSPF != tt.expected.AlignmentSPF {
				t.Errorf("AlignmentSPF = %s, want %s", record.AlignmentSPF, tt.expected.AlignmentSPF)
			}
			if len(tt.expected.RuaAddresses) > 0 {
				if len(record.RuaAddresses) != len(tt.expected.RuaAddresses) {
					t.Errorf("RuaAddresses length = %d, want %d", len(record.RuaAddresses), len(tt.expected.RuaAddresses))
				}
			}
		})
	}
}

func TestParsePolicy(t *testing.T) {
	tests := []struct {
		input    string
		expected Policy
	}{
		{"none", PolicyNone},
		{"quarantine", PolicyQuarantine},
		{"reject", PolicyReject},
		{"NONE", PolicyNone},
		{"REJECT", PolicyReject},
		{"unknown", PolicyNone},
	}

	for _, tt := range tests {
		result := parsePolicy(tt.input)
		if result != tt.expected {
			t.Errorf("parsePolicy(%q) = %s, want %s", tt.input, result, tt.expected)
		}
	}
}

func TestParseAddresses(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"mailto:dmarc@example.com", []string{"dmarc@example.com"}},
		{"mailto:a@ex.com,mailto:b@ex.com", []string{"a@ex.com", "b@ex.com"}},
		{"", nil},
	}

	for _, tt := range tests {
		result := parseAddresses(tt.input)
		if len(result) != len(tt.expected) {
			t.Errorf("parseAddresses(%q) length = %d, want %d", tt.input, len(result), len(tt.expected))
			continue
		}
		for i, v := range result {
			if v != tt.expected[i] {
				t.Errorf("parseAddresses(%q)[%d] = %s, want %s", tt.input, i, v, tt.expected[i])
			}
		}
	}
}

func TestIsSubdomainOf(t *testing.T) {
	tests := []struct {
		subdomain string
		parent    string
		expected  bool
	}{
		{"mail.example.com", "example.com", true},
		{"sub.mail.example.com", "example.com", true},
		{"example.com", "example.com", false},
		{"other.com", "example.com", false},
		{"notexample.com", "example.com", false},
	}

	for _, tt := range tests {
		result := isSubdomainOf(tt.subdomain, tt.parent)
		if result != tt.expected {
			t.Errorf("isSubdomainOf(%q, %q) = %v, want %v", tt.subdomain, tt.parent, result, tt.expected)
		}
	}
}

func TestGenerateRecord(t *testing.T) {
	tests := []struct {
		policy   Policy
		rua      string
		expected string
	}{
		{PolicyReject, "dmarc@example.com", "v=DMARC1; p=reject; rua=mailto:dmarc@example.com"},
		{PolicyNone, "", "v=DMARC1; p=none"},
		{PolicyQuarantine, "reports@example.com", "v=DMARC1; p=quarantine; rua=mailto:reports@example.com"},
	}

	for _, tt := range tests {
		result := GenerateRecord(tt.policy, tt.rua)
		if result != tt.expected {
			t.Errorf("GenerateRecord(%s, %q) = %q, want %q", tt.policy, tt.rua, result, tt.expected)
		}
	}
}
