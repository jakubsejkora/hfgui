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

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.message.includes('aborted'))
}
