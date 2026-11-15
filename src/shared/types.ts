export type ModelFormat = 'gguf' | 'mlx' | 'other'
export type DestinationKind = 'lmstudio' | 'exo' | 'custom'
export type Theme = 'system' | 'light' | 'dark'

export interface TreeFile {
  path: string
  size: number
  /** sha256 from HF LFS metadata; null for small non-LFS files (git sha1 only). */
  sha256?: string | null
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

export type ExoRegistrationStatus = 'registered' | 'already-listed' | 'exo-offline' | 'failed'

/**
 * Outcome of registering a completed download in exo's model list. exo only
 * shows models that have a model card, so arbitrary HF repos placed in its
 * models dir stay invisible until added via its API.
 */
export interface ExoRegistration {
  status: ExoRegistrationStatus
  message: string | null
}

export type DownloadErrorCode =
  | 'auth-required'
  | 'not-found'
  | 'disk-full'
  | 'network'
  | 'size-mismatch'
  | 'checksum-mismatch'
  | 'http'
  /** The folder can't be written to (EACCES / EPERM / EROFS). */
  | 'permission'
  /** The folder vanished mid-download — deleted, or its drive disconnected. */
  | 'folder-unavailable'
  | 'unknown'

export interface FileProgress {
  path: string
  size: number
  /** sha256 from HF LFS metadata; null/absent = size-only verification. */
  sha256?: string | null
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
  /** Set after a completed exo download is (auto-)registered with exo. */
  exoRegistration: ExoRegistration | null
  /**
   * Paused by the user, as opposed to by quitting mid-download. "Resume on
   * launch" only picks up the latter. Absent in snapshots from older versions.
   */
  pausedByUser?: boolean
}

export type DownloadEvent =
  | { type: 'state'; jobId: string; snapshot: DownloadJobSnapshot }
  | { type: 'removed'; jobId: string }
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
  /** Offer to open a Hugging Face link when one is on the clipboard. */
  clipboardWatch: boolean
  /** Cap the combined speed of all downloads at speedLimitBytesPerSec. */
  speedLimitEnabled: boolean
  /** Remembered separately from the switch, so turning the cap off and on keeps it. */
  speedLimitBytesPerSec: number
  /** Native notification when a download finishes or fails while hfgui is in the background. */
  notifications: boolean
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

/** Outcome of a job action that can be refused (e.g. resume). */
export type ActionResult = { ok: true } | { ok: false; message: string }

/** Outcome of deleting a download's data from disk. */
export type DeleteResult =
  | {
      ok: true
      freedBytes: number
      /** Files left in place because another download in the list uses them too. */
      keptShared: number
    }
  | { ok: false; message: string }

/** Where hfgui's downloads are using disk space, for the cleanup UI. */
export interface StorageReport {
  /** Bytes on disk per unfinished download: partial files plus files it already finished. */
  held: Record<string, number>
  /**
   * Data from downloads that never finished and are no longer in the list —
   * dead space hfgui wrote and can safely delete. Never other apps' files.
   */
  leftovers: { files: number; bytes: number }
  /** Finished downloads whose files were moved, deleted or truncated outside hfgui. */
  missing: string[]
}
