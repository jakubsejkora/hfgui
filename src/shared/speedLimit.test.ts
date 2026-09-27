import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEED_LIMIT,
  MAX_SPEED_LIMIT,
  MIN_SPEED_LIMIT,
  SPEED_STEPS,
  capOnEnable,
  clampSpeedLimit,
  effectiveSpeedLimit,
  formatCap,
  formatMbit,
  formatSpeedInCapUnit,
  nearestStep
} from './speedLimit'

const MiB = 1024 * 1024

describe('clampSpeedLimit', () => {
  it('keeps sane values and clamps extremes', () => {
    expect(clampSpeedLimit(5 * MiB)).toBe(5 * MiB)
    expect(clampSpeedLimit(1)).toBe(MIN_SPEED_LIMIT)
    expect(clampSpeedLimit(10 ** 12)).toBe(MAX_SPEED_LIMIT)
  })

  it('falls back to the default for anything that is not a finite number', () => {
    for (const bad of [NaN, Infinity, '5', null, undefined, {}]) {
      expect(clampSpeedLimit(bad)).toBe(DEFAULT_SPEED_LIMIT)
    }
  })
})

describe('effectiveSpeedLimit', () => {
  it('is null while switched off, whatever the stored cap', () => {
    expect(effectiveSpeedLimit({ speedLimitEnabled: false, speedLimitBytesPerSec: MiB })).toBeNull()
  })

  it('is the clamped cap while switched on', () => {
    expect(effectiveSpeedLimit({ speedLimitEnabled: true, speedLimitBytesPerSec: 2 * MiB })).toBe(
      2 * MiB
    )
    expect(effectiveSpeedLimit({ speedLimitEnabled: true, speedLimitBytesPerSec: 3 })).toBe(
      MIN_SPEED_LIMIT
    )
  })
})

describe('nearestStep', () => {
  it('finds exact steps', () => {
    SPEED_STEPS.forEach((step, i) => expect(nearestStep(step)).toBe(i))
  })

  it('snaps by ratio and clamps to the ends', () => {
    expect(SPEED_STEPS[nearestStep(9 * MiB)]).toBe(10 * MiB)
    expect(SPEED_STEPS[nearestStep(4 * MiB)]).toBe(5 * MiB) // closer to 5 than 3 by ratio
    expect(nearestStep(1)).toBe(0)
    expect(nearestStep(10 ** 12)).toBe(SPEED_STEPS.length - 1)
  })
})

describe('formatting', () => {
  it('prints caps without trailing zeros', () => {
    expect(formatCap(10 * MiB)).toBe('10 MB/s')
    expect(formatCap(0.5 * MiB)).toBe('0.5 MB/s')
    expect(formatCap(256 * 1024)).toBe('0.25 MB/s')
  })

  it('prints a speed in the cap unit', () => {
    expect(formatSpeedInCapUnit(9.84 * MiB)).toBe('9.8')
  })

  it('converts to the megabits ISPs advertise', () => {
    expect(formatMbit(10 * MiB)).toBe('≈ 84 Mbit/s')
    expect(formatMbit(0.5 * MiB)).toBe('≈ 4.2 Mbit/s')
  })
})

describe('capOnEnable', () => {
  it('keeps the stored cap when nothing is downloading', () => {
    expect(capOnEnable(10 * MiB, 0)).toBe(10 * MiB)
  })

  it('keeps the stored cap when it already slows the current downloads', () => {
    expect(capOnEnable(10 * MiB, 40 * MiB)).toBe(10 * MiB)
  })

  it('halves the current speed when the stored cap would do nothing', () => {
    // A 10 MB/s cap on a line doing 6 MB/s: switching on must visibly help.
    expect(capOnEnable(10 * MiB, 6 * MiB)).toBe(3 * MiB)
  })

  it('rounds down, so at least half the connection stays free', () => {
    // Half of 12.9 is 6.45: the nearest step would be 8 (62 % of the speed); take 5.
    expect(capOnEnable(100 * MiB, 12.9 * MiB)).toBe(5 * MiB)
  })

  it('never suggests less than the smallest step', () => {
    expect(capOnEnable(10 * MiB, 0.4 * MiB)).toBe(SPEED_STEPS[0])
  })
})
