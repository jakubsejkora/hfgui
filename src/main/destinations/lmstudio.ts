import { readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { PathAdapter } from './types'

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

/**
 * LM Studio home resolution, mirroring lmstudio-js findLMStudioHome():
 * 1. ~/.lmstudio-home-pointer (plain-text absolute path)
 * 2. ~/.cache/lm-studio (legacy)
 * 3. ~/.lmstudio
 */
async function findHome(): Promise<string | null> {
  try {
    const pointer = (await readFile(join(homedir(), '.lmstudio-home-pointer'), 'utf8')).trim()
    if (pointer && (await dirExists(pointer))) return pointer
  } catch {
    /* no pointer file */
  }
  const legacy = join(homedir(), '.cache', 'lm-studio')
  if (await dirExists(legacy)) return legacy
  const modern = join(homedir(), '.lmstudio')
  if (await dirExists(modern)) return modern
  return null
}

/** Custom models dir lives in <home>/settings.json under "downloadsFolder". */
async function modelsDirFor(home: string): Promise<string> {
  try {
    const settings = JSON.parse(await readFile(join(home, 'settings.json'), 'utf8'))
    if (typeof settings.downloadsFolder === 'string' && settings.downloadsFolder) {
      return settings.downloadsFolder
    }
  } catch {
    /* fall through to default */
  }
  return join(home, 'models')
}

export const lmstudioAdapter: PathAdapter = {
  kind: 'lmstudio',
  label: 'LM Studio',
  async detect() {
    const home = await findHome()
    return home ? modelsDirFor(home) : null
  },
  // LM Studio requires exactly {models}/{publisher}/{repo}/{files}
  resolveJobDir(repoId, baseDir) {
    const [author, ...rest] = repoId.split('/')
    return join(baseDir, author, rest.join('/'))
  }
}
