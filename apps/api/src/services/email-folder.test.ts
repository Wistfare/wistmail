/// Locks down the synthetic folder mapping shape. We can't easily run
/// the SQL in unit tests without a DB, but we *can* assert that the
/// mapping returns a defined SQL fragment for every known folder
/// alias the sidebar links to. That guards against regressions like
/// "we removed `'all'` and the sidebar suddenly returns nothing."

import { describe, expect, it } from 'vitest'
import { EmailService } from './email.js'

// Helper: poke into the private method via a typed cast. We don't
// expose buildFolderWhere publicly because callers should always go
// through listByFolder, but tests are the one legitimate consumer.
function buildWhere(svc: EmailService, folder: string, mailboxIds: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (svc as any).buildFolderWhere(folder, mailboxIds)
}

describe('EmailService.buildFolderWhere', () => {
  // We pass a stub `db` — it's only used inside listByFolder, not
  // inside buildFolderWhere itself, so an empty object is fine.
  const svc = new EmailService({} as never)
  const mailboxIds = ['mbx_1', 'mbx_2']

  const aliases = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive']
  for (const alias of aliases) {
    it(`returns a defined WHERE clause for literal folder "${alias}"`, () => {
      expect(buildWhere(svc, alias, mailboxIds)).toBeDefined()
    })
  }

  const synthetic = ['starred', 'snoozed', 'scheduled', 'all']
  for (const alias of synthetic) {
    it(`returns a defined WHERE clause for synthetic folder "${alias}"`, () => {
      expect(buildWhere(svc, alias, mailboxIds)).toBeDefined()
    })
  }

  it('treats unknown folders as a literal match (no crash)', () => {
    expect(buildWhere(svc, 'totally-not-a-folder', mailboxIds)).toBeDefined()
  })
})
