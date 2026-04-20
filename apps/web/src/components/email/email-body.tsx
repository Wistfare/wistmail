'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { ImageOff } from 'lucide-react'

interface EmailBodyProps {
  htmlBody: string | null
  textBody: string | null
  /// Inline attachments (used to resolve `cid:` references). Each
  /// is exposed by the backend at /api/v1/inbox/attachments/:id.
  attachments?: Array<{ id: string; filename: string; contentType: string }>
}

/// Sandboxed iframe email renderer.
///
/// Why an iframe instead of <div dangerouslySetInnerHTML>:
/// - Email CSS can't reach out and override the app's styles.
/// - The iframe runs in a fresh document with `sandbox="allow-same-
///   origin"` only — no script execution, no top-navigation, no
///   form submission.
/// - We can intercept the document before it loads to swap remote
///   image src→placeholder behind a "Load images" toggle.
/// - We resize the iframe to its content height after each load so
///   the email body flows naturally inline.
///
/// Falls back to a styled-text rendering if the email is plain-text
/// only (Gmail-style quote-collapse, monospace).
export function EmailBody({
  htmlBody,
  textBody,
  attachments = [],
}: EmailBodyProps) {
  const [loadRemote, setLoadRemote] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(120)

  // Sanitize + post-process the HTML once per `htmlBody` /
  // `loadRemote` flip. We:
  //   1. Run DOMPurify with strict tag/attr lists.
  //   2. Walk every <img> and:
  //      - resolve cid: → /api/v1/inbox/attachments/:id
  //      - strip remote src (and stash it on data-remote-src) when
  //        the user hasn't opted in. The placeholder shown in the
  //        iframe gets the original alt text.
  //   3. Wrap the result in a minimal HTML document with a base
  //      stylesheet so unstyled emails still read in our typography.
  const renderedDoc = useMemo(() => {
    if (!htmlBody) return null
    return buildSandboxDoc(htmlBody, attachments, loadRemote)
  }, [htmlBody, attachments, loadRemote])

  // Resize the iframe to match its content. Listen for load events
  // (initial render + when the user clicks "Load images" and the doc
  // re-loads with new src attributes).
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !renderedDoc) return
    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument
        if (!doc) return
        // Use scrollHeight so we capture inline images that load late.
        const measure = () => {
          const h = doc.documentElement.scrollHeight
          if (h > 0) setIframeHeight(h)
        }
        measure()
        // Images settle after the initial load — re-measure once they
        // do. ResizeObserver covers font/image reflow without setInterval.
        const ro = new ResizeObserver(measure)
        ro.observe(doc.documentElement)
        return () => ro.disconnect()
      } catch {
        // Cross-origin throw (shouldn't happen — srcdoc is same-origin)
      }
    }
    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [renderedDoc])

  // Hooks must run unconditionally — derive these before any early
  // return so React's hooks order stays stable across renders.
  const hasRemoteImages = useMemo(() => {
    if (!htmlBody) return false
    return /<img[^>]+src=["']https?:/.test(htmlBody)
  }, [htmlBody])

  if (!htmlBody) {
    return <TextBodyRenderer text={textBody ?? ''} />
  }

  return (
    <div className="email-body">
      {hasRemoteImages && !loadRemote && (
        <div className="mb-3 flex items-center gap-2 border-l-2 border-wm-accent bg-wm-accent/10 px-3 py-2">
          <ImageOff className="h-3.5 w-3.5 shrink-0 text-wm-accent" />
          <span className="flex-1 font-mono text-xs text-wm-text-secondary">
            Remote images blocked. Sender can track when you load them.
          </span>
          <button
            type="button"
            onClick={() => setLoadRemote(true)}
            className="cursor-pointer font-mono text-xs font-semibold text-wm-accent hover:underline"
          >
            Load images
          </button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        title="Email body"
        sandbox="allow-same-origin allow-popups"
        srcDoc={renderedDoc ?? ''}
        style={{ width: '100%', height: iframeHeight, border: 'none' }}
      />
    </div>
  )
}

/// Plain-text fallback. Splits quoted lines into a styled blockquote
/// for parity with what desktop clients render.
function TextBodyRenderer({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <p className="font-mono text-xs text-wm-text-muted">No content.</p>
    )
  }
  const lines = text.split('\n')
  const blocks: Array<{ quoted: boolean; text: string }> = []
  let currentQuoted = false
  let buffer: string[] = []
  const flush = () => {
    if (buffer.length === 0) return
    blocks.push({ quoted: currentQuoted, text: buffer.join('\n') })
    buffer = []
  }
  for (const line of lines) {
    const isQuoted = line.startsWith('>')
    if (isQuoted !== currentQuoted) {
      flush()
      currentQuoted = isQuoted
    }
    buffer.push(isQuoted ? line.replace(/^>+\s?/, '') : line)
  }
  flush()
  return (
    <div className="text-sm leading-relaxed text-wm-text-secondary">
      {blocks.map((b, i) =>
        b.quoted ? (
          <blockquote
            key={i}
            className="my-2 border-l-2 border-wm-text-muted/30 pl-3 text-wm-text-muted"
          >
            <pre className="whitespace-pre-wrap font-mono text-xs">{b.text}</pre>
          </blockquote>
        ) : (
          <pre key={i} className="whitespace-pre-wrap font-mono text-sm">
            {b.text}
          </pre>
        ),
      )}
    </div>
  )
}

/// Build the srcdoc string the iframe will load. Keep it pure so
/// React's useMemo can cache it across re-renders that don't change
/// the inputs.
function buildSandboxDoc(
  rawHtml: string,
  attachments: Array<{ id: string; filename: string; contentType: string }>,
  loadRemote: boolean,
): string {
  // 1. Sanitize.
  const sanitized = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'meta', 'link'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
    ALLOW_DATA_ATTR: false,
  })

  // 2. Walk for image src rewrites. We do this string-side rather
  // than via DOM parsing because:
  //   - Server-side rendering doesn't have a DOMParser
  //   - The transformations are simple regex substitutions
  let processed = sanitized

  // Resolve cid: → /api/v1/inbox/attachments/:id (matched by id OR
  // filename, which is what most senders reference).
  processed = processed.replace(
    /(<img[^>]*\bsrc=)["']cid:([^"']+)["']/gi,
    (_match, prefix, cidRaw) => {
      const cid = cidRaw.trim()
      const att = attachments.find(
        (a) => a.id === cid || a.filename.toLowerCase() === cid.toLowerCase(),
      )
      if (!att) return `${prefix}""`
      return `${prefix}"/api/v1/inbox/attachments/${att.id}"`
    },
  )

  if (!loadRemote) {
    // Strip remote src; preserve original on a data-attr so a re-render
    // with loadRemote=true can swap it back in.
    processed = processed.replace(
      /(<img[^>]*\b)src=(["'])(https?:[^"']+)\2/gi,
      '$1data-remote-src=$2$3$2 src=""',
    )
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base target="_parent">
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 0;
    font-family: ui-sans-serif, -apple-system, "Inter", sans-serif;
    font-size: 14px;
    line-height: 1.55;
    color: #d4d4d8;
    background: transparent;
    word-wrap: break-word;
  }
  a { color: #a3e635; text-decoration: underline; }
  blockquote {
    border-left: 2px solid #525252;
    padding-left: 12px;
    margin: 8px 0;
    color: #a1a1aa;
  }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; max-width: 100%; }
  td, th { padding: 4px 8px; }
  pre, code {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 12px;
    background: #1f1f1f;
    padding: 2px 4px;
  }
  pre { padding: 12px; overflow-x: auto; }
  hr { border: none; border-top: 1px solid #2a2a2a; margin: 12px 0; }
</style>
</head>
<body>
${processed}
</body>
</html>`
}
