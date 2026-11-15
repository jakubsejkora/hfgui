import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

/*
 * "Restart to update" quits mid-download on the user's behalf, and downloads
 * that quitting interrupts only resume on launch when "Resume on launch" is on.
 * So the restart notes which downloads were busy, and the launch right after
 * it resumes exactly those — not ones an earlier quit interrupted. A note older
 * than a few minutes is ignored: a restart that never happened mustn't resume
 * downloads at some later, ordinary launch.
 */

const FILE = 'resume-after-update.json'
export const RESUME_MARKER_MAX_AGE_MS = 10 * 60_000

interface Note {
  at?: unknown
  jobIds?: unknown
}

export function writeResumeMarker(userDataDir: string, jobIds: readonly string[], now = Date.now()): void {
  writeFileSync(join(userDataDir, FILE), JSON.stringify({ at: now, jobIds }))
}

/** The downloads to resume when the previous run restarted for an update moments ago. Consumes the note. */
export function takeResumeMarker(userDataDir: string, now = Date.now()): string[] {
  const file = join(userDataDir, FILE)
  let note: Note | null = null
  try {
    note = JSON.parse(readFileSync(file, 'utf8')) as Note | null
  } catch {
    // No note (the usual case), or an unreadable one.
  }
  rmSync(file, { force: true })
  const at = note?.at
  if (typeof at !== 'number' || now < at || now - at > RESUME_MARKER_MAX_AGE_MS) return []
  const ids: unknown = note?.jobIds
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}
