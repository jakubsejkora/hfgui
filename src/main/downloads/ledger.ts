import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { isInside } from './storage'

export interface LedgerEntry {
  /** A file hfgui writes for a download: a finished file or its .partial. */
  path: string
  /** The download's folder, and the destination folder above it (never pruned). */
  jobDir: string
  baseDir: string
}

/**
 * Every file hfgui has written for a download that has not finished yet.
 *
 * This is what makes leftover cleanup safe. hfgui shares folders with other
 * apps — exo's own downloader writes `*.partial` files into ~/.exo/models too —
 * so sweeping by name would destroy someone else's download. Cleanup only ever
 * deletes paths listed here, and a download's paths leave the list the moment
 * it completes (it is a model now) or its data is deleted.
 */
export class IncompleteFilesLedger {
  private entries = new Map<string, LedgerEntry>()
  private timer: NodeJS.Timeout | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(private file: string) {}

  /** Returns false when no ledger existed yet (first run of this version). */
  async load(): Promise<boolean> {
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(this.file, 'utf8'))
    } catch {
      return false
    }
    const list = (raw as { entries?: unknown })?.entries
    if (Array.isArray(list)) {
      for (const e of list) {
        const entry = e as Partial<LedgerEntry>
        if (
          typeof entry?.path === 'string' &&
          typeof entry.jobDir === 'string' &&
          typeof entry.baseDir === 'string' &&
          // A hand-edited ledger must not be able to aim cleanup outside a destination.
          isInside(entry.path, entry.baseDir)
        ) {
          this.entries.set(entry.path, entry as LedgerEntry)
        }
      }
    }
    return true
  }

  track(entries: LedgerEntry[]): void {
    let changed = false
    for (const e of entries) {
      if (!this.entries.has(e.path) && isInside(e.path, e.baseDir)) {
        this.entries.set(e.path, e)
        changed = true
      }
    }
    if (changed) this.schedule()
  }

  untrack(paths: string[]): void {
    let changed = false
    for (const p of paths) changed = this.entries.delete(p) || changed
    if (changed) this.schedule()
  }

  list(): LedgerEntry[] {
    return [...this.entries.values()]
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush().catch((e) => console.error('[hfgui] could not save the file ledger:', e))
    }, 500)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const data = JSON.stringify({ version: 1, entries: this.list() }, null, 2)
    const write = this.writing
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true })
        await writeFile(`${this.file}.tmp`, data, 'utf8')
        await rename(`${this.file}.tmp`, this.file)
      })
    this.writing = write
    await write
  }
}
