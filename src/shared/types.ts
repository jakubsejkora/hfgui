export type ModelFormat = 'gguf' | 'mlx' | 'other'
export type DestinationKind = 'lmstudio' | 'exo' | 'custom'
export type Theme = 'system' | 'light' | 'dark'

export interface TreeFile {
  path: string
  size: number
}

export interface DownloadDestination {
  kind: DestinationKind
  baseDir: string
}

export interface DownloadRequest {
  repoId: string
  /** Commit sha pinned at job creation (falls back to 'main' if unknown). */
  revision: string
  displayName: string
  format: ModelFormat
  files: TreeFile[]
  destination: DownloadDestination
}

export type JobState =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'error'

export type DownloadErrorCode =
  | 'auth-required'
  | 'not-found'
  | 'disk-full'
  | 'network'
  | 'size-mismatch'
  | 'http'
  | 'unknown'

export interface FileProgress {
  path: string
  size: number
  bytesDone: number
  state: 'pending' | 'active' | 'done'
}

export interface DownloadJobSnapshot {
  jobId: string
  repoId: string
  revision: string
  displayName: string
  format: ModelFormat
  destination: DownloadDestination
  /** Resolved absolute directory the files land in. */
  jobDir: string
  files: FileProgress[]
  state: JobState
  bytesDone: number
  totalBytes: number
  error: { code: DownloadErrorCode; message: string } | null
  createdAt: number
  completedAt: number | null
}

export type DownloadEvent =
  | { type: 'state'; jobId: string; snapshot: DownloadJobSnapshot }
  | {
      type: 'progress'
      jobId: string
      bytesDone: number
      totalBytes: number
      bytesPerSec: number
      etaSec: number | null
      currentFile: string | null
    }

export interface Settings {
  /** null = auto-detect */
  lmstudioDir: string | null
  exoDir: string | null
  /** Last used custom folder. */
  customDir: string | null
  maxConcurrentJobs: number
  autoResume: boolean
  theme: Theme
}

export interface DestinationInfo {
  kind: DestinationKind
  label: string
  /** Resolved models base dir (override or detected), null if unavailable. */
  path: string | null
  /** True when the target app looks installed on this machine. */
  detected: boolean
  source: 'override' | 'detected' | 'none'
}

export interface SystemInfo {
  totalMemoryBytes: number
  platform: string
  arch: string
}

export interface DiskSpace {
  freeBytes: number
  totalBytes: number
}

export interface TokenStatus {
  isSet: boolean
  masked: string | null
  source: 'app' | 'huggingface-cli' | null
}

export type StartDownloadResult =
  | { ok: true; jobId: string }
  | { ok: false; code: 'duplicate' | 'disk-full' | 'invalid'; message: string }
