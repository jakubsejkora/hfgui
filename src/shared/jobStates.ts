import type { DownloadErrorCode, DownloadJobSnapshot, JobState } from './types'

/*
 * One vocabulary for download states, shared by the engine and every view.
 * "Active" used to mean four different things in four places, so the sidebar
 * count disagreed with the Downloads page and queued jobs inflated the speed.
 */

/** Moving or checking bytes right now; counts against the concurrency limit. */
export const RUNNING_STATES: ReadonlySet<JobState> = new Set<JobState>(['downloading', 'verifying'])

/** Will make progress without the user doing anything: running or waiting for a slot. */
export const BUSY_STATES: ReadonlySet<JobState> = new Set<JobState>([
  'queued',
  'downloading',
  'verifying'
])

/** Not finished and not failed: busy, or paused by the user. */
export const IN_PROGRESS_STATES: ReadonlySet<JobState> = new Set<JobState>([
  'queued',
  'downloading',
  'verifying',
  'paused'
])

/** Stopped without finishing — the user can retry or start over. */
export const FAILED_STATES: ReadonlySet<JobState> = new Set<JobState>(['error', 'cancelled'])

/** States `resume` accepts. */
export const RESUMABLE_STATES: ReadonlySet<JobState> = new Set<JobState>([
  'paused',
  'error',
  'cancelled'
])

export const isRunning = (state: JobState): boolean => RUNNING_STATES.has(state)
export const isBusy = (state: JobState): boolean => BUSY_STATES.has(state)
export const isInProgress = (state: JobState): boolean => IN_PROGRESS_STATES.has(state)
export const isFailed = (state: JobState): boolean => FAILED_STATES.has(state)

/** Typed, so a new state is a compile error until it has a label. */
export const JOB_STATE_LABEL: Record<JobState, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  verifying: 'Verifying',
  completed: 'Completed',
  paused: 'Paused',
  cancelled: 'Stopped',
  error: 'Failed'
}

/** The Downloads page tab a job belongs to. */
export type JobGroup = 'in-progress' | 'completed' | 'failed'

export function jobGroup(state: JobState): JobGroup {
  if (state === 'completed') return 'completed'
  if (FAILED_STATES.has(state)) return 'failed'
  return 'in-progress'
}

const PRIORITY: Record<JobState, number> = {
  downloading: 0,
  verifying: 1,
  queued: 2,
  paused: 3,
  error: 4,
  cancelled: 5,
  completed: 6
}

/**
 * "What matters now" order: running first, then waiting, paused and failed,
 * then finished — newest first within each. The dock headline and the
 * Overview's recent list both read from this.
 */
export function compareJobs(
  a: Pick<DownloadJobSnapshot, 'state' | 'createdAt'>,
  b: Pick<DownloadJobSnapshot, 'state' | 'createdAt'>
): number {
  return PRIORITY[a.state] - PRIORITY[b.state] || b.createdAt - a.createdAt
}

/** User-facing explanation per failure, so rows can say more than the raw error. */
export const ERROR_COPY: Record<DownloadErrorCode, { title: string; hint: string }> = {
  'auth-required': {
    title: 'Needs a Hugging Face token',
    hint: 'Accept the model’s license on huggingface.co, add a token, then retry.'
  },
  'not-found': {
    title: 'No longer on Hugging Face',
    hint: 'The repo changed after this download started. Check it on Hugging Face.'
  },
  'disk-full': {
    title: 'Not enough disk space',
    hint: 'Free up space where this model is saved, then retry.'
  },
  network: {
    title: 'Network problem',
    hint: 'Check your connection, then retry — it picks up where it stopped.'
  },
  'size-mismatch': {
    title: 'Download was incomplete',
    hint: 'Retry to fetch the missing part.'
  },
  'checksum-mismatch': {
    title: 'File failed verification',
    hint: 'The damaged part was discarded. Retry to download it again.'
  },
  http: {
    title: 'Hugging Face returned an error',
    hint: 'Retry in a moment.'
  },
  permission: {
    title: 'Can’t write to the folder',
    hint: 'Check the folder’s permissions in Finder, or choose another folder, then retry.'
  },
  'folder-unavailable': {
    title: 'The folder is gone',
    hint: 'It was moved or deleted, or its drive was disconnected. Reconnect it, then retry.'
  },
  unknown: {
    title: 'Something went wrong',
    hint: 'Retry. If it keeps failing, the details below say why.'
  }
}

/**
 * The copy for a job's error. Snapshots come from disk, and a download list
 * written by another build (or edited by hand) can carry a code this build has
 * never heard of — looking it up blindly crashed the whole Downloads page. An
 * unknown code falls back to the error's own message, which says what it meant.
 */
export function errorCopy(
  error: { code: string; message: string } | null | undefined
): { title: string; hint: string } {
  if (!error) return ERROR_COPY.unknown
  const known = (ERROR_COPY as Record<string, { title: string; hint: string } | undefined>)[error.code]
  if (known) return known
  return { title: 'Didn’t finish', hint: error.message || ERROR_COPY.unknown.hint }
}
