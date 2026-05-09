import { describe, expect, it } from 'vitest'
import { extractOutline, slugify } from './doc-outline'

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Q1 Roadmap Brief')).toBe('q1-roadmap-brief')
  })
  it('strips punctuation and collapses dashes', () => {
    expect(slugify('## Goals & priorities!')).toBe('goals-priorities')
  })
  it('falls back to "untitled" for empty input', () => {
    expect(slugify('   ')).toBe('untitled')
  })
})

describe('extractOutline', () => {
  it('returns an empty array for empty input', () => {
    expect(extractOutline('')).toEqual([])
  })

  it('picks up H1 / H2 / H3 headings', () => {
    const body = `# Top
## Section A
### Subsection A1
content
## Section B`
    const outline = extractOutline(body)
    expect(outline.map((n) => `${n.level}:${n.text}`)).toEqual([
      '1:Top',
      '2:Section A',
      '3:Subsection A1',
      '2:Section B',
    ])
  })

  it('ignores headings inside fenced code blocks', () => {
    const body = `# Real
\`\`\`
# Not a heading
## Also not
\`\`\`
## After fence`
    const outline = extractOutline(body)
    expect(outline.map((n) => n.text)).toEqual(['Real', 'After fence'])
  })

  it('disambiguates duplicate headings with a counter suffix', () => {
    const body = `## Goals
content
## Goals
more`
    const outline = extractOutline(body)
    expect(outline[0].id).toBe('goals')
    expect(outline[1].id).toBe('goals-2')
  })

  it('strips inline emphasis markers from the heading text', () => {
    const body = '## **Bold** _italic_ `code`'
    const outline = extractOutline(body)
    expect(outline[0].text).toBe('Bold italic code')
  })
})
