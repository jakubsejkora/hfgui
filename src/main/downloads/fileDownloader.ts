import { createWriteStream } from 'fs'
import { mkdir, open, rename, stat, unlink } from 'fs/promises'
import { dirname } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { DownloadError, isAbortError } from './resolve'

export interface FileDownloadOptions {
  url: string
  /** Final absolute path; data streams to `<destPath>.partial` first. */
  destPath: string
  expectedSize: number
  token: string | null
  signal: AbortSignal
  /** Absolute bytes written for this file (including pre-existing partial bytes). */
  onProgress: (bytesDone: number) => void
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
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

function classify(e: unknown): DownloadError {
  if (e instanceof DownloadError) return e
  if (e instanceof Error) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOSPC') return new DownloadError('disk-full', 'Not enough disk space', false)
    return new DownloadError('network', e.message, true)
  }
  return new DownloadError('unknown', String(e), false)
}

/**
 * Download a single file with Range-based resume and atomic rename.
 * Throws DownloadError; AbortError passes through untouched (pause/cancel).
 */
export async function downloadFile(opts: FileDownloadOptions): Promise<void> {
  const { url, destPath, expectedSize, token, signal, onProgress } = opts
  const partialPath = `${destPath}.partial`

  // Already fully downloaded in a previous run?
  const finalSize = await sizeOf(destPath)
  if (finalSize === expectedSize) {
    onProgress(expectedSize)
    return
  }

  await mkdir(dirname(destPath), { recursive: true })

  let startAt = (await sizeOf(partialPath)) ?? 0
  if (startAt > expectedSize) {
    await unlink(partialPath).catch(() => {})
    startAt = 0
  }
  if (startAt === expectedSize) {
    await finalize(partialPath, destPath)
    onProgress(expectedSize)
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
    throw classify(e)
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

  let bytesDone = startAt
  onProgress(bytesDone)
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytesDone += chunk.length
      onProgress(bytesDone)
      cb(null, chunk)
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
    throw classify(e)
  }

  const written = await sizeOf(partialPath)
  if (written !== expectedSize) {
    throw new DownloadError(
      'size-mismatch',
      `Downloaded ${written ?? 0} bytes, expected ${expectedSize}`,
      true
    )
  }
  await finalize(partialPath, destPath)
}
