/**
 * Loads the email + its mailbox + user + label catalog from Postgres in
 * a single read. The model only sees what we put in this struct — we
 * deliberately strip HTML, headers, and quoted history before passing
 * to the prompt to keep wall time and cost predictable.
 */

import { and, eq } from 'drizzle-orm'
import { emails, mailboxes, labels, users, type Database } from '@wistmail/db'

export interface EmailContext {
  email: {
    id: string
    subject: string
    fromAddress: string
    body: string
  }
  mailboxId: string
  userId: string
  userDisplayName: string
  availableLabels: Array<{ id: string; name: string }>
}

/**
 * Returns null if the email no longer exists (deleted while queued).
 */
export async function loadEmailContext(
  db: Database,
  emailId: string,
): Promise<EmailContext | null> {
  const rows = await db
    .select({
      id: emails.id,
      subject: emails.subject,
      fromAddress: emails.fromAddress,
      textBody: emails.textBody,
      htmlBody: emails.htmlBody,
      mailboxId: emails.mailboxId,
      userId: mailboxes.userId,
      displayName: users.name,
    })
    .from(emails)
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .innerJoin(users, eq(users.id, mailboxes.userId))
    .where(eq(emails.id, emailId))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  const labelRows = await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(eq(labels.mailboxId, row.mailboxId))

  return {
    email: {
      id: row.id,
      subject: row.subject ?? '',
      fromAddress: row.fromAddress,
      body: extractBody(row.textBody, row.htmlBody),
    },
    mailboxId: row.mailboxId,
    userId: row.userId,
    userDisplayName: row.displayName ?? row.userId,
    availableLabels: labelRows,
  }
}

/**
 * Strip HTML, collapse whitespace, drop quoted history (lines starting
 * with `>`), cap at 4000 chars (~1k tokens). Cheap heuristic — good
 * enough that the model sees the live message, not the whole thread.
 */
export function extractBody(text: string | null, html: string | null): string {
  let body = text ?? ''
  if (!body && html) {
    body = html.replace(/<style[\s\S]*?<\/style>/gi, '')
    body = body.replace(/<script[\s\S]*?<\/script>/gi, '')
    body = body.replace(/<[^>]+>/g, ' ')
    body = body.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  }
  const lines = body
    .split(/\r?\n/)
    .filter((l) => !/^\s*>/.test(l))
    .filter((l) => !/^On .{1,80}wrote:\s*$/i.test(l))
  return lines.join('\n').replace(/\s+/g, ' ').trim().slice(0, 4000)
}

// Suppress unused param warning when `and` is only used by callers.
void and
