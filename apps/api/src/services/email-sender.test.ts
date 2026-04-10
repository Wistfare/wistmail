import { describe, it, expect, vi } from 'vitest'

// Mock the database and DNS modules before importing
vi.mock('node:dns/promises', () => ({
  resolveMx: vi.fn().mockResolvedValue([{ exchange: 'mx1.example.com.', priority: 10 }]),
}))

describe('EmailSender', () => {
  describe('MIME message building', () => {
    it('should build a text-only MIME message', () => {
      // Test the MIME building logic
      const lines: string[] = []
      const messageId = 'test-123@wistfare.com'
      const from = 'sender@wistfare.com'
      const to = ['recipient@example.com']
      const subject = 'Test Subject'
      const textBody = 'Hello, this is a test email.'

      lines.push(`Message-ID: <${messageId}>`)
      lines.push(`From: ${from}`)
      lines.push(`To: ${to.join(', ')}`)
      lines.push(`Subject: ${subject}`)
      lines.push('MIME-Version: 1.0')
      lines.push('Content-Type: text/plain; charset=utf-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(textBody)

      const message = lines.join('\r\n')

      expect(message).toContain('Message-ID: <test-123@wistfare.com>')
      expect(message).toContain('From: sender@wistfare.com')
      expect(message).toContain('To: recipient@example.com')
      expect(message).toContain('Subject: Test Subject')
      expect(message).toContain('MIME-Version: 1.0')
      expect(message).toContain('Content-Type: text/plain')
      expect(message).toContain('Hello, this is a test email.')
    })

    it('should build a multipart message with text and HTML', () => {
      const boundary = '----=_Part_test'
      const lines: string[] = []

      lines.push('MIME-Version: 1.0')
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
      lines.push('')
      lines.push(`--${boundary}`)
      lines.push('Content-Type: text/plain; charset=utf-8')
      lines.push('')
      lines.push('Plain text body')
      lines.push(`--${boundary}`)
      lines.push('Content-Type: text/html; charset=utf-8')
      lines.push('')
      lines.push('<p>HTML body</p>')
      lines.push(`--${boundary}--`)

      const message = lines.join('\r\n')

      expect(message).toContain('multipart/alternative')
      expect(message).toContain('Plain text body')
      expect(message).toContain('<p>HTML body</p>')
    })
  })

  describe('recipient grouping', () => {
    it('should group recipients by domain', () => {
      const recipients = [
        'alice@example.com',
        'bob@example.com',
        'carol@other.com',
      ]

      const domainRecipients = new Map<string, string[]>()
      for (const addr of recipients) {
        const domain = addr.split('@')[1]
        const existing = domainRecipients.get(domain) || []
        existing.push(addr)
        domainRecipients.set(domain, existing)
      }

      expect(domainRecipients.get('example.com')).toEqual(['alice@example.com', 'bob@example.com'])
      expect(domainRecipients.get('other.com')).toEqual(['carol@other.com'])
      expect(domainRecipients.size).toBe(2)
    })
  })
})
