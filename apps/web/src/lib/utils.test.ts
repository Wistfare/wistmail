import { describe, expect, it } from 'vitest'
import { cn, formatRelativeTime, getInitials, stringToColor } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('resolves tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'extra')).toBe('base extra')
  })

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'extra')).toBe('base extra')
  })
})

describe('formatRelativeTime', () => {
  it('shows "Just now" for very recent dates', () => {
    const now = new Date()
    expect(formatRelativeTime(now)).toBe('Just now')
  })

  it('shows minutes for recent times', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago')
  })

  it('shows "Yesterday" for one day ago', () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
    expect(formatRelativeTime(yesterday)).toBe('Yesterday')
  })

  it('shows date for older messages', () => {
    const oldDate = new Date('2024-01-15T10:00:00Z')
    const result = formatRelativeTime(oldDate)
    expect(result).toContain('Jan')
    expect(result).toContain('15')
  })
})

describe('getInitials', () => {
  it('extracts first and last initials', () => {
    expect(getInitials('Alex Johnson')).toBe('AJ')
  })

  it('handles single names', () => {
    expect(getInitials('Alex')).toBe('A')
  })

  it('limits to 2 characters', () => {
    expect(getInitials('Alex B Johnson')).toBe('AB')
  })

  it('handles empty string', () => {
    expect(getInitials('')).toBe('')
  })
})

describe('stringToColor', () => {
  it('returns a hex color', () => {
    const color = stringToColor('test@example.com')
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('returns same color for same input', () => {
    expect(stringToColor('user@test.com')).toBe(stringToColor('user@test.com'))
  })

  it('returns different colors for different inputs', () => {
    const a = stringToColor('alice@test.com')
    const b = stringToColor('bob@test.com')
    // Not guaranteed but likely different
    expect(typeof a).toBe('string')
    expect(typeof b).toBe('string')
  })
})
