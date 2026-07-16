import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { DownloadJobSnapshot } from '@shared/types'

export class Persistence {
  private file: string
  private timer: NodeJS.Timeout | null = null
  private getSnapshots: (() => DownloadJobSnapshot[]) | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(file: string) {
    this.file = file
  }

  async load(): Promise<DownloadJobSnapshot[]> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  bind(getSnapshots: () => DownloadJobSnapshot[]): void {
    this.getSnapshots = getSnapshots
  }

  /** Debounced save — call freely on every state change. */
  schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, 500)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.getSnapshots) return
    const data = JSON.stringify(this.getSnapshots(), null, 2)
    // serialize writes so tmp-file renames never race
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, data, 'utf8')
      await rename(tmp, this.file)
    })
    await this.writing
  }
}
