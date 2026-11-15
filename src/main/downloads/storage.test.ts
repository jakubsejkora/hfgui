import { mkdir, mkdtemp, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { missingVolume } from '../system'
import { isInside, pruneEmptyDirs } from './storage'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hfgui-prune-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
const exists = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)

describe('pruneEmptyDirs', () => {
  it('removes empty folders up to, but never including, the stop folder', async () => {
    const deep = join(root, 'org', 'model', 'sub')
    await mkdir(deep, { recursive: true })
    await pruneEmptyDirs(deep, root)
    expect(await exists(join(root, 'org'))).toBe(false)
    expect(await exists(root)).toBe(true)
  })

  it('stops at a folder that still holds something, and ignores a lone .DS_Store', async () => {
    await mkdir(join(root, 'org', 'model'), { recursive: true })
    await writeFile(join(root, 'org', 'model', '.DS_Store'), '')
    await writeFile(join(root, 'org', 'other-model.gguf'), 'keep')
    await pruneEmptyDirs(join(root, 'org', 'model'), root)
    expect(await exists(join(root, 'org', 'model'))).toBe(false)
    expect(await exists(join(root, 'org', 'other-model.gguf'))).toBe(true)
  })

  it('does nothing outside the stop folder', async () => {
    await pruneEmptyDirs(root, root)
    expect(await exists(root)).toBe(true)
    expect(isInside('/a/b', '/a/b')).toBe(false)
    expect(isInside('/a/bc', '/a/b')).toBe(false)
    expect(isInside('/a/b/c', '/a/b')).toBe(true)
  })
})

describe('missingVolume', () => {
  it('names an unplugged external drive', () => {
    expect(missingVolume('/Volumes/Models SSD/lmstudio/org/m', () => false)).toBe('Models SSD')
    expect(missingVolume('/Volumes/Models SSD/lmstudio/org/m', () => true)).toBeNull()
    expect(missingVolume('/tmp/models', () => false)).toBeNull()
  })
})
