import { stat, statfs } from 'fs/promises'
import { existsSync } from 'fs'
import { cpus, homedir, totalmem } from 'os'
import { dirname, join } from 'path'
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

/**
 * The drive name when `dir` is on an external drive that isn't connected. On
 * macOS drives mount at /Volumes/<name>; once unplugged the mount point is gone
 * and nearestExisting() would walk up to "/" — reporting the boot disk's free
 * space for a drive that isn't there.
 */
export function missingVolume(dir: string, exists: (p: string) => boolean = existsSync): string | null {
  const m = /^\/Volumes\/([^/]+)/.exec(dir)
  if (!m) return null
  return exists(`/Volumes/${m[1]}`) ? null : m[1]
}

/** statfs against the nearest existing ancestor, so `dir` may not exist yet. */
export async function checkDiskSpace(dir: string): Promise<DiskSpace> {
  const drive = missingVolume(dir)
  if (drive) throw new Error(`The drive “${drive}” isn’t connected`)
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
    arch: process.arch,
    // Electron's process.getSystemVersion() gives the marketing version ("15.6.1"); os.release() is Darwin's.
    osVersion: (process as { getSystemVersion?: () => string }).getSystemVersion?.() ?? '',
    cpuModel: cpus()[0]?.model ?? '',
    defaultModelsDir: join(homedir(), 'Models')
  }
}
