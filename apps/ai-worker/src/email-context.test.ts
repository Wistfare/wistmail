import { describe, expect, it } from 'vitest'
import { extractBody } from './email-context.js'

describe('extractBody', () => {
  it('prefers text body and trims it', () => {
    expect(extractBody('  hi   there  ', null)).toBe('hi there')
  })

  it('strips HTML, scripts, and entities when text is missing', () => {
    const html =
      '<style>x{color:red}</style><script>evil()</script><p>Hello&nbsp;<b>world</b>&amp;more</p>'
    expect(extractBody(null, html)).toBe('Hello world &more')
  })

  it('drops quoted history lines', () => {
    const text = 'Hi Veda\n\nLet us know.\n\n> On Mon, Sarah wrote:\n> can you sign off?'
    expect(extractBody(text, null)).toBe('Hi Veda Let us know.')
  })

  it('drops "On … wrote:" reply prefix lines', () => {
    const text = 'Sounds good.\n\nOn Mon, Apr 21, Sarah <s@x.com> wrote:\nDo it.'
    expect(extractBody(text, null)).toBe('Sounds good. Do it.')
  })

  it('caps body at 4000 chars', () => {
    const long = 'a'.repeat(5000)
    expect(extractBody(long, null).length).toBe(4000)
  })
})
