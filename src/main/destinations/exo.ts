import { stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { PathAdapter } from './types'

/**
 * exo (exo-explore/exo, current rewrite) keeps models in ~/.exo/models on macOS,
 * one flat folder per repo named "{org}--{repo}". exo picks up complete
 * pre-downloaded repos without re-downloading.
 */
export const exoAdapter: PathAdapter = {
  kind: 'exo',
  label: 'exo',
  async detect() {
    const base = join(homedir(), '.exo')
    try {
      if ((await stat(base)).isDirectory()) return join(base, 'models')
    } catch {
      /* not installed */
    }
    return null
  },
  resolveJobDir(repoId, baseDir) {
    return join(baseDir, repoId.replace('/', '--'))
  }
}
