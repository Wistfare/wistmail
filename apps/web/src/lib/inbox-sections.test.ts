import { describe, expect, it } from 'vitest'
import { groupEmailsBySection } from './inbox-sections'
import type { EmailListItem } from './email-queries'

function buildEmail(overrides: Partial<EmailListItem> = {}): EmailListItem {
  return {
    id: 'e_1',
    fromAddress: 'a@b.com',
    toAddresses: [],
    cc: [],
    subject: 'Hello',
    snippet: 'Hi there',
    createdAt: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    folder: 'inbox',
    status: 'idle',
    hasAttachments: false,
    labels: [],
    ...overrides,
  } as EmailListItem
}

describe('groupEmailsBySection', () => {
  // Pin "now" to a Wednesday afternoon for deterministic boundaries.
  const NOW = new Date('2026-04-23T14:00:00')

  it('returns no sections for an empty list', () => {
    expect(groupEmailsBySection([], NOW)).toEqual([])
  })

  it('places emails from today under "Today"', () => {
    const sections = groupEmailsBySection(
      [buildEmail({ id: 'a', createdAt: '2026-04-23T09:00:00' })],
      NOW,
    )
    expect(sections.map((s) => s.label)).toEqual(['Today'])
    expect(sections[0].items).toHaveLength(1)
  })

  it('places emails from yesterday under "Yesterday"', () => {
    const sections = groupEmailsBySection(
      [buildEmail({ id: 'a', createdAt: '2026-04-22T15:30:00' })],
      NOW,
    )
    expect(sections.map((s) => s.label)).toEqual(['Yesterday'])
  })

  it('places emails from earlier this week under "This week"', () => {
    const sections = groupEmailsBySection(
      [buildEmail({ id: 'a', createdAt: '2026-04-19T11:00:00' })],
      NOW,
    )
    expect(sections.map((s) => s.label)).toEqual(['This week'])
  })

  it('places older emails under "Earlier"', () => {
    const sections = groupEmailsBySection(
      [buildEmail({ id: 'a', createdAt: '2026-03-01T10:00:00' })],
      NOW,
    )
    expect(sections.map((s) => s.label)).toEqual(['Earlier'])
  })

  it('groups a mixed list into the four bands in order', () => {
    const sections = groupEmailsBySection(
      [
        buildEmail({ id: 'today', createdAt: '2026-04-23T08:00:00' }),
        buildEmail({ id: 'yest', createdAt: '2026-04-22T20:00:00' }),
        buildEmail({ id: 'week', createdAt: '2026-04-19T10:00:00' }),
        buildEmail({ id: 'old', createdAt: '2026-03-01T10:00:00' }),
      ],
      NOW,
    )
    expect(sections.map((s) => s.label)).toEqual([
      'Today',
      'Yesterday',
      'This week',
      'Earlier',
    ])
    expect(sections[0].items[0].id).toBe('today')
    expect(sections[1].items[0].id).toBe('yest')
    expect(sections[2].items[0].id).toBe('week')
    expect(sections[3].items[0].id).toBe('old')
  })

  it('skips empty bands', () => {
    const sections = groupEmailsBySection(
      [
        buildEmail({ id: 'today', createdAt: '2026-04-23T08:00:00' }),
        buildEmail({ id: 'old', createdAt: '2026-03-01T10:00:00' }),
      ],
      NOW,
    )
    expect(sections.map((s) => s.label)).toEqual(['Today', 'Earlier'])
  })
})
