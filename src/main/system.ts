import { statfs } from 'fs/promises'
import { existsSync } from 'fs'
import { totalmem } from 'os'
import { dirname } from 'path'
import type { DiskSpace, SystemInfo } from '@shared/types'

/** statfs against the nearest existing ancestor, so `dir` may not exist yet. */
export async function checkDiskSpace(dir: string): Promise<DiskSpace> {
  let probe = dir
  while (!existsSync(probe)) {
    const parent = dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  const s = await statfs(probe)
  return {
    freeBytes: s.bavail * s.bsize,
    totalBytes: s.blocks * s.bsize
  }
}

export function getSystemInfo(): SystemInfo {
  return {
    totalMemoryBytes: totalmem(),
    platform: process.platform,
    arch: process.arch
  }
}
