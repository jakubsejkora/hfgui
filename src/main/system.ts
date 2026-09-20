import { stat, statfs } from 'fs/promises'
import { existsSync } from 'fs'
import { totalmem } from 'os'
import { dirname } from 'path'
import type { DiskSpace, SystemInfo } from '@shared/types'

/** Walk up to the nearest existing ancestor, so `dir` may not exist yet. */
function nearestExisting(dir: string): string {
  let probe = dir
  while (!existsSync(probe)) {
    const parent = dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  return probe
}

/** statfs against the nearest existing ancestor, so `dir` may not exist yet. */
export async function checkDiskSpace(dir: string): Promise<DiskSpace> {
  const s = await statfs(nearestExisting(dir))
  return {
    freeBytes: s.bavail * s.bsize,
    totalBytes: s.blocks * s.bsize
  }
}

/** Volume identity (st_dev) for a dir-to-be; null when it can't be determined. */
export async function volumeIdFor(dir: string): Promise<number | null> {
  try {
    return (await stat(nearestExisting(dir))).dev
  } catch {
    return null
  }
}

export function getSystemInfo(): SystemInfo {
  return {
    totalMemoryBytes: totalmem(),
    platform: process.platform,
    arch: process.arch
  }
}
