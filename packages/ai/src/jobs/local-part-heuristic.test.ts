import { describe, expect, it } from 'vitest'
import { deriveLocalPartName } from './local-part-heuristic'

describe('deriveLocalPartName', () => {
  describe('high-confidence happy paths', () => {
    it('handles dot-separated name', () => {
      const r = deriveLocalPartName('john.doe')
      expect(r.name).toBe('John Doe')
      expect(r.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('handles underscore-separated name', () => {
      expect(deriveLocalPartName('alex_chen').name).toBe('Alex Chen')
    })

    it('handles dash-separated name', () => {
      expect(deriveLocalPartName('maria-rodriguez').name).toBe('Maria Rodriguez')
    })

    it('strips +tag suffix (Gmail plus-addressing)', () => {
      expect(deriveLocalPartName('john.doe+newsletter').name).toBe('John Doe')
    })

    it('keeps order across multiple tokens', () => {
      expect(deriveLocalPartName('jose.maria.garcia').name).toBe('Jose Maria Garcia')
    })
  })

  describe('role + system addresses (high confidence, empty name)', () => {
    it.each([
      'support', 'noreply', 'no-reply', 'do-not-reply', 'mailer-daemon',
      'admin', 'info', 'sales', 'billing', 'notifications', 'postmaster',
    ])('rejects role address %s', (addr) => {
      const r = deriveLocalPartName(addr)
      expect(r.name).toBe('')
      expect(r.confidence).toBeGreaterThanOrEqual(0.7)
    })
  })

  describe('low-confidence single-token cases', () => {
    it('returns moderate confidence for fused token (likely needs AI)', () => {
      const r = deriveLocalPartName('nsengimanavedadom')
      expect(r.confidence).toBeLessThan(0.7)
      expect(r.confidence).toBeGreaterThan(0)
    })

    it('returns empty for very-short opaque tokens (initials)', () => {
      expect(deriveLocalPartName('jd').name).toBe('')
    })
  })

  describe('garbage / opaque', () => {
    it('rejects pure-numeric local-parts', () => {
      const r = deriveLocalPartName('8217492')
      expect(r.name).toBe('')
      expect(r.confidence).toBeGreaterThanOrEqual(0.9)
    })

    it('handles empty input', () => {
      const r = deriveLocalPartName('')
      expect(r.name).toBe('')
    })
  })
})
