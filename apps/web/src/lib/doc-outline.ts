/**
 * Extract a navigable outline from Markdown text.
 *
 * The DocOutline left rail in `DocsV3-Editor` (`IMtz2`) lists the doc's
 * H1 / H2 / H3 headings so the user can jump around. We walk the body
 * line-by-line, picking up `#` / `##` / `###` and emitting an `id` slug
 * usable as an anchor.
 *
 * Lines inside fenced code blocks (``` …  ```) are skipped so that a
 * commented-out heading inside a snippet doesn't pollute the outline.
 */

export interface OutlineNode {
  id: string
  level: 1 | 2 | 3
  text: string
}

/** Slugify the heading text into a stable anchor id. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled'
}

export function extractOutline(body: string): OutlineNode[] {
  if (!body) return []
  const out: OutlineNode[] = []
  let inFence = false
  const lines = body.split(/\r?\n/)
  const seen = new Map<string, number>()
  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(raw)
    if (!m) continue
    const level = m[1].length as 1 | 2 | 3
    const text = m[2].replace(/[*_`]/g, '').trim()
    if (!text) continue
    const baseId = slugify(text)
    const dupes = seen.get(baseId) ?? 0
    const id = dupes === 0 ? baseId : `${baseId}-${dupes + 1}`
    seen.set(baseId, dupes + 1)
    out.push({ id, level, text })
  }
  return out
}
