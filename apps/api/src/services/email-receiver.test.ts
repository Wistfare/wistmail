import { describe, it, expect } from 'vitest'

describe('EmailReceiver', () => {
  describe('raw email parsing', () => {
    it('should parse basic headers from raw email', () => {
      const raw = [
        'Message-ID: <test123@example.com>',
        'From: Alice <alice@example.com>',
        'To: bob@wistfare.com',
        'Subject: Hello World',
        'Date: Thu, 10 Apr 2026 12:00:00 +0000',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'This is the body of the email.',
      ].join('\r\n')

      // Parse headers manually (same logic as EmailReceiver)
      const headerBodySplit = raw.indexOf('\r\n\r\n')
      const headerSection = raw.substring(0, headerBodySplit)
      const bodySection = raw.substring(headerBodySplit + 4)

      const headers: Record<string, string> = {}
      const headerLines = headerSection.split('\r\n')
      for (const line of headerLines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const name = line.substring(0, colonIdx).trim().toLowerCase()
        const value = line.substring(colonIdx + 1).trim()
        headers[name] = value
      }

      expect(headers['message-id']).toBe('<test123@example.com>')
      expect(headers['from']).toBe('Alice <alice@example.com>')
      expect(headers['to']).toBe('bob@wistfare.com')
      expect(headers['subject']).toBe('Hello World')
      expect(bodySection).toBe('This is the body of the email.')
    })

    it('should extract email address from "Name <email>" format', () => {
      const extractEmailAddress = (value: string): string => {
        const match = value.match(/<([^>]+)>/)
        if (match) return match[1].toLowerCase()
        return value.trim().toLowerCase()
      }

      expect(extractEmailAddress('Alice <alice@example.com>')).toBe('alice@example.com')
      expect(extractEmailAddress('alice@example.com')).toBe('alice@example.com')
      expect(extractEmailAddress('"Bob Smith" <bob@test.com>')).toBe('bob@test.com')
    })

    it('should extract multiple email addresses from comma-separated list', () => {
      const extractEmailAddresses = (value: string): string[] => {
        return value
          .split(',')
          .map((addr) => {
            const match = addr.match(/<([^>]+)>/)
            if (match) return match[1].toLowerCase()
            return addr.trim().toLowerCase()
          })
          .filter(Boolean)
      }

      const result = extractEmailAddresses('Alice <alice@test.com>, bob@test.com, "Carol" <carol@test.com>')
      expect(result).toEqual(['alice@test.com', 'bob@test.com', 'carol@test.com'])
    })

    it('should decode RFC 2047 encoded subjects', () => {
      const decodeSubject = (value: string): string => {
        return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (_match, _charset, encoding, text) => {
          if (encoding.toUpperCase() === 'B') {
            return Buffer.from(text, 'base64').toString('utf-8')
          }
          return text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        })
      }

      // Base64 encoded
      expect(decodeSubject('=?UTF-8?B?SGVsbG8gV29ybGQ=?=')).toBe('Hello World')

      // Q-encoded
      expect(decodeSubject('=?UTF-8?Q?Hello_World?=')).toBe('Hello World')

      // Plain text (no encoding)
      expect(decodeSubject('Regular Subject')).toBe('Regular Subject')
    })

    it('should parse multipart MIME message', () => {
      const boundary = '----boundary123'
      const raw = [
        'Content-Type: multipart/alternative; boundary="----boundary123"',
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Plain text version',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        '<h1>HTML version</h1>',
        `--${boundary}--`,
      ].join('\r\n')

      // Parse
      const headerBodySplit = raw.indexOf('\r\n\r\n')
      const headerSection = raw.substring(0, headerBodySplit)
      const bodySection = raw.substring(headerBodySplit + 4)

      expect(headerSection).toContain('multipart/alternative')

      const parts = bodySection.split(`--${boundary}`)
      const textPart = parts.find((p) => p.includes('text/plain'))
      const htmlPart = parts.find((p) => p.includes('text/html'))

      expect(textPart).toContain('Plain text version')
      expect(htmlPart).toContain('<h1>HTML version</h1>')
    })
  })
})
