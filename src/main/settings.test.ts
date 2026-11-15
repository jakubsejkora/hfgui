import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsStore } from './settings'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hfgui-settings-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SettingsStore', () => {
  it('survives overlapping writes and keeps the last one', async () => {
    const store = new SettingsStore(dir)
    // A slider dragged across steps fires these back to back.
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.set({ maxConcurrentJobs: n })))
    const saved = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
    expect(saved.maxConcurrentJobs).toBe(5)
    expect(store.get().maxConcurrentJobs).toBe(5)
  })

  it('defaults notifications on and keeps an explicit off', async () => {
    const store = new SettingsStore(dir)
    expect(store.get().notifications).toBe(true)
    await store.set({ notifications: false })
    expect(new SettingsStore(dir).get().notifications).toBe(false)
  })
})
