import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LINK_MIN_BYTES, gitBlobOid, isCosmetic, planUpdate, relinkCopy, removeEmptyTree, shareFile, versionedName, type LatestVersion } from './updates'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hfgui-updates-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('gitBlobOid', () => {
  it('matches git hash-object', async () => {
    await writeFile(join(dir, 'f'), 'hello\n')
    expect(await gitBlobOid(join(dir, 'f'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
    expect(await gitBlobOid(join(dir, 'missing'))).toBeNull()
  })
})

describe('isCosmetic', () => {
  it('ignores docs, licences, images and hidden files', () => {
    for (const p of ['README.md', 'LICENSE', 'license.txt', 'USAGE_POLICY.md', 'assets/chart.png', '.gitattributes', '.eval_results/gpqa.yaml']) {
      expect(isCosmetic(p), p).toBe(true)
    }
    for (const p of ['chat_template.jinja', 'tokenizer_config.json', 'config.json', 'model-00001-of-00002.safetensors', 'm.gguf']) {
      expect(isCosmetic(p), p).toBe(false)
    }
  })
})

const W = 'a'.repeat(64) // the weights' sha256, unchanged
const latest = (files: LatestVersion['files']): LatestVersion => ({ revision: 'b'.repeat(40), lastModified: '2026-11-07', files })

describe('planUpdate', () => {
  // What Qwen3.8-27B's 7 Nov update looked like: a new chat template and
  // tokenizer config (plus README), identical weights.
  const repo = {
    format: 'other' as const,
    files: [
      { path: 'model.safetensors', size: 1000, sha256: W },
      { path: 'chat_template.jinja', size: 10, sha256: null },
      { path: 'config.json', size: 20, sha256: null },
      { path: 'README.md', size: 30, sha256: null }
    ]
  }
  const localOids = new Map([
    ['chat_template.jinja', 'old-template'],
    ['config.json', 'cfg'],
    ['README.md', 'old-readme']
  ])

  it('fetches what changed and shares the rest', () => {
    const planned = planUpdate(
      repo,
      latest([
        { path: 'model.safetensors', size: 1000, oid: 'ptr', lfs: { oid: W } },
        { path: 'chat_template.jinja', size: 12, oid: 'new-template', lfs: null },
        { path: 'config.json', size: 20, oid: 'cfg', lfs: null },
        { path: 'README.md', size: 31, oid: 'new-readme', lfs: null }
      ]),
      localOids
    )
    expect(planned.kind).toBe('available')
    if (planned.kind !== 'available') return
    expect(planned.changed).toEqual(['chat_template.jinja']) // README alone wouldn't count
    expect(planned.plan.same.sort()).toEqual(['config.json', 'model.safetensors'])
    expect(planned.plan.fetch.sort()).toEqual(['README.md', 'chat_template.jinja'])
    expect(planned.fetchBytes).toBe(12 + 31)
  })

  it('calls a docs-only change current', () => {
    const planned = planUpdate(
      repo,
      latest([
        { path: 'model.safetensors', size: 1000, oid: 'ptr', lfs: { oid: W } },
        { path: 'chat_template.jinja', size: 10, oid: 'old-template', lfs: null },
        { path: 'config.json', size: 20, oid: 'cfg', lfs: null },
        { path: 'README.md', size: 99, oid: 'new-readme', lfs: null }
      ]),
      localOids
    )
    expect(planned.kind).toBe('current')
  })

  it('takes new files into a whole-repo download', () => {
    const planned = planUpdate(
      repo,
      latest([
        { path: 'model.safetensors', size: 1000, oid: 'ptr', lfs: { oid: W } },
        { path: 'chat_template.jinja', size: 10, oid: 'old-template', lfs: null },
        { path: 'config.json', size: 20, oid: 'cfg', lfs: null },
        { path: 'generation_config.json', size: 5, oid: 'gen', lfs: null }
      ]),
      localOids
    )
    expect(planned.kind === 'available' && planned.plan.fetch).toEqual(['generation_config.json'])
  })

  it('follows only its own files for a GGUF size, and gives up when one is renamed', () => {
    const gguf = { format: 'gguf' as const, files: [{ path: 'm-Q4_K_M.gguf', size: 500, sha256: W }] }
    const otherSizeAdded = latest([
      { path: 'm-Q4_K_M.gguf', size: 500, oid: 'p', lfs: { oid: W } },
      { path: 'm-Q8_0.gguf', size: 900, oid: 'q', lfs: { oid: 'c'.repeat(64) } }
    ])
    expect(planUpdate(gguf, otherSizeAdded, new Map()).kind).toBe('current')
    const requantized = latest([{ path: 'm-Q4_K_M.gguf', size: 510, oid: 'p2', lfs: { oid: 'd'.repeat(64) } }])
    const planned = planUpdate(gguf, requantized, new Map())
    expect(planned.kind === 'available' && planned.fetchBytes).toBe(510)
    const renamed = latest([{ path: 'm-Q4_K_M-v2.gguf', size: 510, oid: 'p2', lfs: { oid: 'd'.repeat(64) } }])
    expect(planUpdate(gguf, renamed, new Map()).kind).toBe('gone')
  })
})

describe('shareFile', () => {
  it('copies a small file, so editing one version never changes the other', async () => {
    await writeFile(join(dir, 'config.json'), '{"a":1}')
    expect(await shareFile(join(dir, 'config.json'), join(dir, 'v2', 'config.json'))).toBe(true)
    await writeFile(join(dir, 'v2', 'config.json'), '{"a":2}')
    expect(await readFile(join(dir, 'config.json'), 'utf8')).toBe('{"a":1}')
  })

  it('hard-links the weights: instant, and no second copy on disk', async () => {
    const weights = join(dir, 'model.safetensors')
    await writeFile(weights, Buffer.alloc(LINK_MIN_BYTES + 1, 7))
    const started = Date.now()
    expect(await shareFile(weights, join(dir, 'v2', 'model.safetensors'))).toBe(true)
    expect(Date.now() - started).toBeLessThan(500)
    expect((await stat(join(dir, 'v2', 'model.safetensors'))).ino).toBe((await stat(weights)).ino)
  })
})

describe('relinkCopy', () => {
  it('turns a separate copy of the same file into a link, keeping its content', async () => {
    const original = join(dir, 'a.bin')
    const copy = join(dir, 'b.bin')
    await writeFile(original, 'same bytes')
    await writeFile(copy, 'same bytes')
    expect(await relinkCopy(original, copy)).toBe(true)
    expect((await stat(copy)).ino).toBe((await stat(original)).ino)
    expect(await readFile(copy, 'utf8')).toBe('same bytes')
    expect(await relinkCopy(original, copy)).toBe(false) // already shared
  })

  it('leaves two files alone when their bytes differ, whatever the records say', async () => {
    await writeFile(join(dir, 'a.bin'), 'same size, A')
    await writeFile(join(dir, 'b.bin'), 'same size, B')
    expect(await relinkCopy(join(dir, 'a.bin'), join(dir, 'b.bin'))).toBe(false)
    expect(await readFile(join(dir, 'b.bin'), 'utf8')).toBe('same size, B')
  })
})

describe('removeEmptyTree', () => {
  it('removes a folder of empty folders, and nothing that holds a file', async () => {
    await mkdir(join(dir, 'staging', 'encoding', 'deep'), { recursive: true })
    await mkdir(join(dir, 'staging', 'assets'), { recursive: true })
    await writeFile(join(dir, 'staging', '.DS_Store'), '')
    expect(await removeEmptyTree(join(dir, 'staging'))).toBe(true)
    await mkdir(join(dir, 'kept', 'inner'), { recursive: true })
    await writeFile(join(dir, 'kept', 'inner', 'model.py'), 'x')
    expect(await removeEmptyTree(join(dir, 'kept'))).toBe(false)
    expect(await readFile(join(dir, 'kept', 'inner', 'model.py'), 'utf8')).toBe('x')
  })
})

describe('versionedName', () => {
  it('appends the short revision, and a counter when taken', () => {
    const taken = new Set(['/m/Qwen@1d4bf0f'])
    expect(versionedName('/m/Qwen', '3756181abcdef', (p) => taken.has(p))).toBe('/m/Qwen@3756181')
    expect(versionedName('/m/Qwen', '1d4bf0f99', (p) => taken.has(p))).toBe('/m/Qwen@1d4bf0f-2')
  })
})
