import type { EmailListItem } from './email-queries'

export interface InboxSection {
  /** Display label, e.g. "Today" / "Yesterday" / "This week" / "Earlier". */
  label: string
  items: EmailListItem[]
}

/**
 * Group emails into V3 inbox bands:
 *   Today / Yesterday / This week / Earlier
 *
 * Pencil reference: `InboxV3.sec1` / `sec2` (`TB36x`) — section headers
 * sit between rows so the user has scannable date scaffolding.
 *
 * @param emails  Already-filtered list of emails (oldest..newest doesn't
 *                matter — we read each email's `createdAt`).
 * @param now     Reference "now" — defaults to `new Date()` but injectable
 *                for deterministic tests.
 */
export function groupEmailsBySection(
  emails: EmailListItem[],
  now: Date = new Date(),
): InboxSection[] {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfDay)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeekAgo = new Date(startOfDay)
  startOfWeekAgo.setDate(startOfWeekAgo.getDate() - 7)

  const today: EmailListItem[] = []
  const yesterday: EmailListItem[] = []
  const week: EmailListItem[] = []
  const earlier: EmailListItem[] = []

  for (const e of emails) {
    const d = new Date(e.createdAt)
    if (d >= startOfDay) today.push(e)
    else if (d >= startOfYesterday) yesterday.push(e)
    else if (d >= startOfWeekAgo) week.push(e)
    else earlier.push(e)
  }

  const out: InboxSection[] = []
  if (today.length) out.push({ label: 'Today', items: today })
  if (yesterday.length) out.push({ label: 'Yesterday', items: yesterday })
  if (week.length) out.push({ label: 'This week', items: week })
  if (earlier.length) out.push({ label: 'Earlier', items: earlier })
  return out
}
