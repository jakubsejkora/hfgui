import type { DownloadErrorCode } from '@shared/types'

export class DownloadError extends Error {
  code: DownloadErrorCode
  retryable: boolean

  constructor(code: DownloadErrorCode, message: string, retryable = false) {
    super(message)
    this.name = 'DownloadError'
    this.code = code
    this.retryable = retryable
  }
}

/**
 * huggingface.co resolve URL. The response is a 302 to a signed CDN URL that
 * expires within the hour — always build and fetch fresh, never persist it.
 */
export function resolveUrl(repoId: string, revision: string, filePath: string): string {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
  return `https://huggingface.co/${repoId}/resolve/${encodeURIComponent(revision)}/${encodedPath}`
}

/**
 * Turn anything thrown during a download into a DownloadError with an honest
 * code. File-system failures used to be called "network" (and retried for half
 * a minute) or "unknown" with raw errno text; now a full disk, a folder you
 * can't write to and a folder that vanished each say so — and aren't retried,
 * since waiting won't fix them.
 */
export function classifyError(e: unknown): DownloadError {
  if (e instanceof DownloadError) return e
  if (!(e instanceof Error)) return new DownloadError('unknown', String(e))
  const err = e as NodeJS.ErrnoException
  // Errors from fs carry the failing syscall; network errors from fetch don't.
  const fromFs = typeof err.syscall === 'string'
  switch (err.code) {
    case 'ENOSPC':
    case 'EDQUOT':
      return new DownloadError('disk-full', 'Not enough disk space', false)
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      if (fromFs) return new DownloadError('permission', 'Permission denied writing the model files', false)
      break
    case 'ENOENT':
    case 'ENOTDIR':
    case 'EIO':
    case 'ENXIO':
      if (fromFs) return new DownloadError('folder-unavailable', 'The download folder is no longer there', false)
      break
  }
  if (fromFs) return new DownloadError('unknown', err.message, false)
  return new DownloadError('network', err.message, true)
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.message.includes('aborted'))
}
