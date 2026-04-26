import { describe, expect, it } from 'vitest'
import { extractDisplayName } from './backfill-from-name'

describe('extractDisplayName', () => {
  it('parses a quoted display name', () => {
    expect(extractDisplayName('"Sarah Kim" <sarah@example.com>')).toBe('Sarah Kim')
  })

  it('parses an unquoted atom display name', () => {
    expect(extractDisplayName('Sarah Kim <sarah@example.com>')).toBe('Sarah Kim')
  })

  it('returns null when there is no display name', () => {
    expect(extractDisplayName('<sarah@example.com>')).toBeNull()
  })

  it('returns null when the header is just an address', () => {
    expect(extractDisplayName('sarah@example.com')).toBeNull()
  })

  it('returns null when the display name is the same as the address (echoed)', () => {
    expect(extractDisplayName('"sarah@example.com" <sarah@example.com>')).toBeNull()
  })

  it('strips whitespace and quotes around the name', () => {
    expect(extractDisplayName('   "  Sarah Kim  "   <sarah@example.com>')).toBe('Sarah Kim')
  })

  it('handles unicode display names (e.g. Vietnamese diacritics)', () => {
    expect(extractDisplayName('Nguyễn Văn A <nva@example.com>')).toBe('Nguyễn Văn A')
  })

  it('returns null on missing/empty input', () => {
    expect(extractDisplayName(null)).toBeNull()
    expect(extractDisplayName(undefined)).toBeNull()
    expect(extractDisplayName('')).toBeNull()
  })

  it('clamps very long names to 255 chars', () => {
    const long = 'A'.repeat(500)
    const r = extractDisplayName(`${long} <a@b.com>`)
    expect(r).not.toBeNull()
    expect(r!.length).toBe(255)
  })
})
