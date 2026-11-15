import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateStatus } from '@shared/types'
import {
  AppUpdates,
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  describeUpdateError,
  type UpdaterHandlers,
  type UpdaterLike
} from './appUpdater'

/** A stand-in for electron-updater: the test decides what GitHub answers. */
class FakeUpdater implements UpdaterLike {
  h!: UpdaterHandlers
  checks = 0
  installs = 0
  answer: (h: UpdaterHandlers) => Promise<void> = async (h) => {
    h.checking()
    h.notAvailable()
  }

  subscribe(handlers: UpdaterHandlers): void {
    this.h = handlers
  }

  checkForUpdates(): Promise<void> {
    this.checks++
    return this.answer(this.h)
  }

  quitAndInstall(): void {
    this.installs++
  }
}

function setup(overrides: { enabled?: () => boolean; beforeInstall?: () => Promise<void> } = {}) {
  const updater = new FakeUpdater()
  const seen: AppUpdateStatus[] = []
  let clock = 1_000
  const updates = new AppUpdates({
    updater,
    enabled: overrides.enabled ?? (() => true),
    onChange: (s) => seen.push(s),
    beforeInstall: overrides.beforeInstall ?? (async () => {}),
    now: () => clock
  })
  return { updater, updates, seen, tick: (ms: number) => (clock += ms) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AppUpdates', () => {
  it('says why a copy that cannot update itself never checks', async () => {
    const updates = new AppUpdates({
      updater: null,
      unavailableReason: 'Development build',
      enabled: () => true,
      onChange: () => {},
      beforeInstall: async () => {}
    })
    expect(updates.get()).toEqual({ status: 'unavailable', reason: 'Development build' })
    expect(await updates.check()).toEqual({ status: 'unavailable', reason: 'Development build' })
    expect((await updates.install()).ok).toBe(false)
  })

  it('reports up to date with the time GitHub answered', async () => {
    const { updates, seen } = setup()
    expect(updates.get()).toEqual({ status: 'idle', checkedAt: null })
    expect(await updates.check()).toEqual({ status: 'idle', checkedAt: 1_000 })
    expect(seen.map((s) => s.status)).toEqual(['checking', 'idle'])
  })

  it('follows a newer version from found to downloaded, in whole percents', async () => {
    const { updater, updates, seen } = setup()
    updater.answer = async (h) => {
      h.checking()
      h.available('0.4.0')
    }
    expect(await updates.check()).toEqual({ status: 'downloading', version: '0.4.0', percent: 0, checkedAt: 1_000 })
    updater.h.progress(12.2)
    updater.h.progress(12.9) // same whole percent: no new status
    updater.h.progress(57.5)
    updater.h.downloaded('0.4.0')
    expect(updates.get()).toEqual({ status: 'ready', version: '0.4.0', checkedAt: 1_000 })
    expect(seen.map((s) => (s.status === 'downloading' ? `downloading ${s.percent}` : s.status))).toEqual([
      'checking',
      'downloading 0',
      'downloading 12',
      'downloading 57',
      'ready'
    ])
  })

  it('does not ask again while a check or download runs, or once a version is ready', async () => {
    const { updater, updates } = setup()
    let answer!: () => void
    updater.answer = (h) =>
      new Promise<void>((resolve) => {
        answer = () => {
          h.available('0.4.0')
          resolve()
        }
      })
    const first = updates.check()
    const second = updates.check()
    expect(updater.checks).toBe(1)
    answer()
    await Promise.all([first, second])
    await updates.check() // downloading
    updater.h.downloaded('0.4.0')
    await updates.check() // ready
    expect(updater.checks).toBe(1)
  })

  it('turns a failed check into plain words, and lets the next check try again', async () => {
    const { updater, updates } = setup()
    updater.answer = async (h) => {
      h.checking()
      const error = Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' })
      h.error(error)
      throw error
    }
    expect(await updates.check()).toEqual({
      status: 'error',
      message: 'Couldn’t reach GitHub — check your connection.',
      checkedAt: null
    })
    updater.answer = async (h) => h.notAvailable()
    expect((await updates.check()).status).toBe('idle')
    expect(updater.checks).toBe(2)
  })

  it('reports a rejection the updater did not announce', async () => {
    const { updater, updates } = setup()
    updater.answer = async () => {
      throw new Error('boom')
    }
    expect(await updates.check()).toEqual({ status: 'error', message: 'boom', checkedAt: null })
  })

  it('goes back to idle when the updater answers without a word', async () => {
    const { updater, updates } = setup()
    updater.answer = async () => {}
    expect(await updates.check()).toEqual({ status: 'idle', checkedAt: null })
  })

  it('a download that fails after being found is an error, not a stuck progress bar', async () => {
    const { updater, updates } = setup()
    updater.answer = async (h) => h.available('0.4.0')
    await updates.check()
    updater.h.error(new Error('sha512 checksum mismatch, expected abc, got def'))
    expect(updates.get()).toMatchObject({ status: 'error', message: expect.stringMatching(/damaged/) })
  })

  it('installs only a ready version, after saving downloads', async () => {
    const order: string[] = []
    const { updater, updates } = setup({ beforeInstall: async () => void order.push('saved') })
    expect(await updates.install()).toEqual({ ok: false, message: 'No update is ready to install yet.' })
    updater.answer = async (h) => h.available('0.4.0')
    await updates.check()
    updater.h.downloaded('0.4.0')
    const quit = updater.quitAndInstall.bind(updater)
    updater.quitAndInstall = () => {
      order.push('quit')
      quit()
    }
    expect(await updates.install()).toEqual({ ok: true })
    expect(order).toEqual(['saved', 'quit'])
    // A second click while quitting doesn't start another install.
    expect(await updates.install()).toEqual({ ok: true })
    expect(updater.installs).toBe(1)
  })

  it('recovers when the install fails after Restart, instead of ignoring every click after', async () => {
    const { updater, updates } = setup()
    updater.answer = async (h) => h.available('0.4.0')
    await updates.check()
    updater.h.downloaded('0.4.0')
    expect(await updates.install()).toEqual({ ok: true })
    // Squirrel rejects it; hfgui stays open.
    updater.h.error(new Error('Code signature at URL file:///… did not pass validation'))
    expect(updates.get().status).toBe('error')
    updater.answer = async (h) => h.notAvailable()
    expect((await updates.check()).status).toBe('idle')
    expect(updater.checks).toBe(2)
  })

  it('does not quit when saving downloads first fails', async () => {
    const { updater, updates } = setup({
      beforeInstall: async () => {
        throw new Error('disk full')
      }
    })
    updater.answer = async (h) => h.available('0.4.0')
    await updates.check()
    updater.h.downloaded('0.4.0')
    expect((await updates.install()).ok).toBe(false)
    expect(updater.installs).toBe(0)
  })

  it('checks shortly after launch and every few hours, only while the switch is on', async () => {
    vi.useFakeTimers()
    let on = true
    const { updater, updates } = setup({ enabled: () => on })
    updates.start()
    expect(updater.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS)
    expect(updater.checks).toBe(1)
    on = false
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(updater.checks).toBe(1)
    on = true
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(updater.checks).toBe(2)
    updates.stop()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)
    expect(updater.checks).toBe(2)
  })
})

describe('describeUpdateError', () => {
  const err = (message: string, code?: string): Error => Object.assign(new Error(message), code ? { code } : {})

  it.each([
    [err('Unable to find latest version on GitHub', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND'), /no release/],
    [err('Cannot find latest-mac.yml in the latest release artifacts', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'), /releases page/],
    [err('Cannot update while running on a read-only volume'), /Applications/],
    [err('Code signature at URL file:///… did not pass validation'), /isn’t signed/],
    [err('HttpError: 429 Too Many Requests'), /try again later/],
    [err('net::ERR_INTERNET_DISCONNECTED'), /connection/]
  ])('%s', (error, expected) => {
    expect(describeUpdateError(error)).toMatch(expected)
  })

  it('keeps only the first line of anything else, briefly', () => {
    expect(describeUpdateError(err(`${'x'.repeat(200)}\n    at stack`))).toHaveLength(158)
    expect(describeUpdateError(err(''))).toBe('Something went wrong.')
  })
})
