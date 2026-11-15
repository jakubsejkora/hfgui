import { createHash } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, open, rename, stat, unlink, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { DownloadError, classifyError, isAbortError } from './resolve'

export interface FileDownloadOptions {
  url: string
  /** Final absolute path; data streams to `<destPath>.partial` first. */
  destPath: string
  expectedSize: number
  /** Expected sha256 (HF LFS oid); null = size-only verification. */
  sha256: string | null
  token: string | null
  signal: AbortSignal
  /** Absolute bytes written for this file (including pre-existing partial bytes). */
  onProgress: (bytesDone: number) => void
  /**
   * Bytes of this file that were already on disk — a finished file, or a partial
   * being resumed — and so never crossed the network. Called just before the
   * matching onProgress, so callers can keep them out of throughput figures.
   */
  onDiskBytes?: (bytes: number) => void
  /**
   * Called with each network chunk before it is passed on; returns null to let it
   * through now, or a promise that holds it back (see BandwidthLimiter).
   */
  throttle?: (bytes: number, signal: AbortSignal) => Promise<void> | null
  /**
   * Progress of the checksum pass over a resumed file once all of it is on disk:
   * bytes checked so far, of `total`. A file fetched from its first byte is
   * hashed as it streams and never calls this.
   */
  onVerify?: (checked: number, total: number) => void
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

/**
 * Read size for checksum passes. Electron hashed 64 KiB stream reads (the
 * default) at 0.38 GB/s and 16 MiB reads at 1.9 GB/s: two minutes versus
 * twenty seconds for a 40 GB shard.
 */
const HASH_READ_BYTES = 16 * 1024 * 1024

/** sha256 of a file on disk, reporting the bytes checked as it goes. */
async function hashFile(
  path: string,
  signal: AbortSignal,
  onChecked: (bytes: number) => void
): Promise<string> {
  const hash = createHash('sha256')
  let checked = 0
  for await (const chunk of createReadStream(path, { signal, highWaterMark: HASH_READ_BYTES })) {
    hash.update(chunk as Buffer)
    checked += (chunk as Buffer).length
    onChecked(checked)
  }
  return hash.digest('hex')
}

/** Check a complete .partial against its expected hash; a mismatch deletes it. */
async function verifyOnDisk(
  partialPath: string,
  size: number,
  sha256: string,
  signal: AbortSignal,
  onVerify: FileDownloadOptions['onVerify']
): Promise<void> {
  const digest = await hashFile(partialPath, signal, (checked) => onVerify?.(checked, size))
  await checksumGuard(partialPath, digest, sha256)
}

async function checksumGuard(
  partialPath: string,
  digest: string,
  expected: string
): Promise<void> {
  if (digest === expected) return
  // Partial is corrupt; delete it so the retry restarts from zero.
  await unlink(partialPath).catch(() => {})
  throw new DownloadError(
    'checksum-mismatch',
    `Checksum mismatch (expected ${expected.slice(0, 12)}…, got ${digest.slice(0, 12)}…)`,
    true
  )
}

async function finalize(partialPath: string, destPath: string): Promise<void> {
  try {
    const fh = await open(partialPath, 'r+')
    await fh.datasync().catch(() => {})
    await fh.close()
  } catch {
    /* fsync is best-effort */
  }
  await rename(partialPath, destPath)
}

/**
 * Download a single file with Range-based resume and atomic rename.
 * Throws DownloadError; AbortError passes through untouched (pause/cancel).
 */
export async function downloadFile(opts: FileDownloadOptions): Promise<void> {
  const { url, destPath, expectedSize, sha256, token, signal, onProgress, onDiskBytes, throttle, onVerify } =
    opts
  const partialPath = `${destPath}.partial`

  // Already fully downloaded in a previous run? Size-only on purpose: the file
  // was hash-verified before its rename, or pre-existed from another tool —
  // re-hashing 40 GB models on every resume would be pathological.
  const finalSize = await sizeOf(destPath)
  if (finalSize === expectedSize) {
    onDiskBytes?.(expectedSize)
    onProgress(expectedSize)
    return
  }

  await mkdir(dirname(destPath), { recursive: true })

  // An empty file has nothing to fetch, and the finalize branch below assumes a
  // .partial exists — without this, one empty file failed the whole job.
  if (expectedSize === 0) {
    await writeFile(destPath, '')
    await unlink(partialPath).catch(() => {})
    onProgress(0)
    return
  }

  let startAt = (await sizeOf(partialPath)) ?? 0
  if (startAt > expectedSize) {
    await unlink(partialPath).catch(() => {})
    startAt = 0
  }
  if (startAt === expectedSize) {
    // Fully written but never moved into place: stopped during its checksum
    // pass, or a crash before the rename. Nothing left to fetch.
    onDiskBytes?.(expectedSize)
    onProgress(expectedSize)
    if (sha256) await verifyOnDisk(partialPath, expectedSize, sha256, signal, onVerify)
    await finalize(partialPath, destPath)
    return
  }

  const headers: Record<string, string> = {}
  // Sent to huggingface.co only — undici strips Authorization on the
  // cross-origin redirect to the CDN, which is exactly what we want.
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (startAt > 0) headers['Range'] = `bytes=${startAt}-`

  let res: Response
  try {
    res = await fetch(url, { headers, signal, redirect: 'follow' })
  } catch (e) {
    if (isAbortError(e)) throw e
    throw classifyError(e)
  }

  if (res.status === 401 || res.status === 403) {
    throw new DownloadError('auth-required', `HTTP ${res.status} — this model requires a Hugging Face token (and an accepted license)`, false)
  }
  if (res.status === 404) {
    throw new DownloadError('not-found', 'File not found on Hugging Face', false)
  }
  if (res.status === 416) {
    // Range not satisfiable — partial is corrupt relative to the remote; restart.
    await unlink(partialPath).catch(() => {})
    throw new DownloadError('http', 'Range not satisfiable, restarting file', true)
  }
  if (res.status === 429 || res.status >= 500) {
    throw new DownloadError('http', `HTTP ${res.status} from Hugging Face`, true)
  }
  if (!res.ok && res.status !== 206) {
    throw new DownloadError('http', `HTTP ${res.status}`, false)
  }
  if (!res.body) {
    throw new DownloadError('network', 'Empty response body', true)
  }

  // Server ignored our Range request → start over from zero.
  let append = startAt > 0
  if (append && res.status !== 206) {
    append = false
    startAt = 0
  }

  // A file fetched from its first byte is hashed as it streams. A resumed one is
  // checked from disk in a single pass once complete. Hashing its existing part
  // first left this response unread for minutes (0.4 GB/s over a 39 GB partial);
  // the CDN dropped the idle connection, and each retry re-hashed it all to move
  // a few MB, while the UI could only say "Waiting for data".
  const hash = sha256 && !append ? createHash('sha256') : null

  let bytesDone = startAt
  onDiskBytes?.(startAt)
  onProgress(bytesDone)
  // Holding a chunk here backs the whole pipeline up to the socket, which is
  // what makes a speed cap slow the connection rather than just the disk.
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const pass = (): void => {
        hash?.update(chunk)
        bytesDone += chunk.length
        onProgress(bytesDone)
        cb(null, chunk)
      }
      const wait = throttle?.(chunk.length, signal)
      // .catch rather than a second .then argument: a throw inside pass() must
      // fail the stream too, not become an unhandled rejection that stalls it.
      if (wait) wait.then(pass).catch(cb)
      else pass()
    }
  })

  try {
    await pipeline(
      Readable.fromWeb(res.body as import('stream/web').ReadableStream),
      counter,
      createWriteStream(partialPath, { flags: append ? 'a' : 'w' }),
      { signal }
    )
  } catch (e) {
    if (isAbortError(e)) throw e
    throw classifyError(e)
  }

  const written = await sizeOf(partialPath)
  if (written !== expectedSize) {
    throw new DownloadError(
      'size-mismatch',
      `Downloaded ${written ?? 0} bytes, expected ${expectedSize}`,
      true
    )
  }
  if (sha256) {
    if (hash) await checksumGuard(partialPath, hash.digest('hex'), sha256)
    else await verifyOnDisk(partialPath, expectedSize, sha256, signal, onVerify)
  }
  await finalize(partialPath, destPath)
}
