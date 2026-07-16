import { safeStorage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { mkdir, rename, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { Settings, TokenStatus } from '@shared/types'

const DEFAULTS: Settings = {
  lmstudioDir: null,
  exoDir: null,
  customDir: null,
  maxConcurrentJobs: 2,
  autoResume: false
}

async function writeAtomic(file: string, data: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, data, 'utf8')
  await rename(tmp, file)
}

export class SettingsStore {
  private file: string
  private tokenFile: string
  private cache: Settings

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'settings.json')
    this.tokenFile = join(userDataDir, 'hf-token.json')
    this.cache = this.loadSync()
  }

  private loadSync(): Settings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      return { ...DEFAULTS, ...raw }
    } catch {
      return { ...DEFAULTS }
    }
  }

  get(): Settings {
    return { ...this.cache }
  }

  async set(patch: Partial<Settings>): Promise<Settings> {
    this.cache = { ...this.cache, ...patch }
    this.cache.maxConcurrentJobs = Math.min(5, Math.max(1, this.cache.maxConcurrentJobs | 0))
    await writeAtomic(this.file, JSON.stringify(this.cache, null, 2))
    return this.get()
  }

  async setToken(token: string | null): Promise<void> {
    if (!token) {
      await unlink(this.tokenFile).catch(() => {})
      return
    }
    let payload: { enc: boolean; data: string }
    if (safeStorage.isEncryptionAvailable()) {
      payload = { enc: true, data: safeStorage.encryptString(token).toString('base64') }
    } else {
      payload = { enc: false, data: Buffer.from(token, 'utf8').toString('base64') }
    }
    await writeAtomic(this.tokenFile, JSON.stringify(payload))
  }

  private readAppToken(): string | null {
    try {
      const payload = JSON.parse(readFileSync(this.tokenFile, 'utf8'))
      const buf = Buffer.from(payload.data, 'base64')
      return payload.enc ? safeStorage.decryptString(buf) : buf.toString('utf8')
    } catch {
      return null
    }
  }

  /** Token from ~/.cache/huggingface/token (shared with huggingface-cli and exo). */
  private readHfCliToken(): string | null {
    try {
      const hfHome = process.env.HF_HOME ?? join(homedir(), '.cache', 'huggingface')
      const token = readFileSync(join(hfHome, 'token'), 'utf8').trim()
      return token || null
    } catch {
      return null
    }
  }

  getToken(): string | null {
    return this.readAppToken() ?? this.readHfCliToken()
  }

  async getTokenStatus(): Promise<TokenStatus> {
    const app = this.readAppToken()
    if (app) {
      return { isSet: true, masked: `hf_…${app.slice(-4)}`, source: 'app' }
    }
    const cli = this.readHfCliToken()
    if (cli) {
      return { isSet: true, masked: `hf_…${cli.slice(-4)}`, source: 'huggingface-cli' }
    }
    return { isSet: false, masked: null, source: null }
  }

  hasAppToken(): boolean {
    return existsSync(this.tokenFile)
  }
}
