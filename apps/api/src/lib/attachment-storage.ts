/// Filesystem-backed attachment storage. Each attachment is written
/// once on inbound MIME extraction and read back on download. The
/// storage root is configurable via `ATTACHMENT_STORAGE_ROOT` (defaults
/// to `/var/lib/wistmail/attachments` in production / `./.attachments`
/// in dev).
///
/// We don't use MinIO here even though docker-compose lists it — that
/// adds operational complexity (extra service, network round-trips,
/// IAM keys) without buying anything when a single API instance is
/// the only consumer. If the deployment ever scales horizontally we
/// can swap the implementation behind these functions for the s3
/// SDK; the call sites don't change.

import { createHash, randomBytes } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'

const STORAGE_ROOT = resolve(
  process.env.ATTACHMENT_STORAGE_ROOT ||
    (process.env.NODE_ENV === 'production'
      ? '/var/lib/wistmail/attachments'
      : './.attachments'),
)

/// Compute a deterministic on-disk path for an attachment id. We
/// shard by the first two chars of the id so a million attachments
/// don't all live in the same directory (some filesystems get sad
/// past ~10k entries per dir).
export function pathForAttachment(id: string): string {
  // Defensive: refuse anything that could escape the root via `..`
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid attachment id: ${id}`)
  }
  const shard = id.slice(0, 2).padEnd(2, '_')
  return join(STORAGE_ROOT, shard, id)
}

/// Persist attachment bytes. Idempotent — re-writing the same id is a
/// no-op (we never re-key). Returns the storage_key string the caller
/// should store in the `attachments.storage_key` column.
export async function putAttachment(
  id: string,
  bytes: Buffer | Uint8Array,
): Promise<string> {
  const file = pathForAttachment(id)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, bytes, { flag: 'w' })
  return file
}

/// Open the on-disk file for streaming. Throws if the file is missing
/// — caller should map that to a 404.
export async function openAttachmentStream(id: string): Promise<{
  stream: Readable
  sizeBytes: number
}> {
  const file = pathForAttachment(id)
  const info = await stat(file)
  return {
    stream: createReadStream(file),
    sizeBytes: info.size,
  }
}

/// Generate a fresh attachment id. We use 16 random bytes hex, which
/// gives 128 bits of entropy — plenty to avoid collision over the
/// lifetime of any deployment, and short enough that the storage
/// shard prefix is meaningful.
export function newAttachmentId(): string {
  return `att_${randomBytes(16).toString('hex')}`
}

/// SHA-256 of the bytes — useful for dedup. Not used for security; we
/// rely on storage permissions for that.
export function checksumBytes(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
