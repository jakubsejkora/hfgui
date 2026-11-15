import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
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

  it('checks for app updates by default — also for settings saved before the switch existed', async () => {
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }))
    const store = new SettingsStore(dir)
    expect(store.get().autoUpdate).toBe(true)
    await store.set({ autoUpdate: false })
    expect(new SettingsStore(dir).get().autoUpdate).toBe(false)
  })

  it('greets a fresh install, but not one set up before the welcome screen existed', async () => {
    const fresh = new SettingsStore(dir)
    expect(fresh.get().onboarded).toBe(false)
    // Changing a setting midway through the welcome doesn't finish it.
    await fresh.set({ theme: 'dark' })
    expect(new SettingsStore(dir).get().onboarded).toBe(false)

    await writeFile(join(dir, 'settings.json'), JSON.stringify({ customDir: '/Volumes/AI' }))
    expect(new SettingsStore(dir).get().onboarded).toBe(true)
  })

  it('remembers the default destination, and only a real one', async () => {
    const store = new SettingsStore(dir)
    expect(store.get().preferredDestination).toBeNull()
    await store.set({ onboarded: true, preferredDestination: 'custom' })
    expect(new SettingsStore(dir).get().preferredDestination).toBe('custom')
    await store.set({ preferredDestination: 'ftp' as never })
    expect(store.get().preferredDestination).toBeNull()
  })
})
