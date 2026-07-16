import { join } from 'path'
import type { PathAdapter } from './types'

export const customAdapter: PathAdapter = {
  kind: 'custom',
  label: 'Custom folder',
  async detect() {
    return null
  },
  resolveJobDir(repoId, baseDir) {
    const [author, ...rest] = repoId.split('/')
    return join(baseDir, author, rest.join('/'))
  }
}
