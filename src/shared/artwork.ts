import { hashHue } from './format'

/**
 * Deterministic "cover art" for a model repo: a three-stop radial-gradient mesh
 * derived from the repo id, so the same model always wears the same colours and
 * two models never look alike by accident.
 *
 * The base hue comes from the *author*, with a small per-model jitter, so a page
 * of `unsloth/…` results reads as a family rather than a fruit salad.
 *
 * Saturation and lightness come from CSS custom properties rather than being
 * baked in, so one generated string renders correctly in both themes — see the
 * `--art-*` tokens in globals.css.
 */
export interface Artwork {
  /** Ready to assign to `style.background`. */
  background: string
  hues: [number, number, number]
}

function hash(s: string, seed: number): number {
  let h = seed
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Spread in 0..span derived from the id, so it stays stable across renders. */
function jitter(id: string, seed: number, span: number): number {
  return hash(id, seed) % span
}

/**
 * Hues are not equally bright: a 60° yellow at L=58% glares where a 250° blue
 * reads as sludge. Nudge lightness against the perceived-luma curve (peak near
 * yellow, trough near blue) so every model gets comparable presence.
 */
function lumaOffset(hue: number): number {
  return Math.round(-7 * Math.cos(((hue - 75) * Math.PI) / 180))
}

export function modelArtwork(repoId: string): Artwork {
  const author = repoId.split('/')[0] || repoId
  const h1 = (hashHue(author) + (jitter(repoId, 101, 25) - 12) + 360) % 360
  // Analogous neighbours: enough separation to read as a mesh, never muddy.
  const h2 = (h1 + 32) % 360
  const h3 = (h1 + 328) % 360

  const x1 = 6 + jitter(repoId, 3, 22)
  const y1 = 72 + jitter(repoId, 5, 24)
  const x2 = 70 + jitter(repoId, 11, 26)
  const y2 = 4 + jitter(repoId, 17, 26)
  const x3 = 34 + jitter(repoId, 23, 34)
  const y3 = 34 + jitter(repoId, 29, 34)

  const light = (h: number): string => `calc(var(--art-light) + ${lumaOffset(h)}%)`

  const stop = (h: number, x: number, y: number, size: number): string =>
    `radial-gradient(circle at ${x}% ${y}%, hsl(${h} var(--art-sat) ${light(h)}) 0%, transparent ${size}%)`

  const background = [
    stop(h1, x1, y1, 64),
    stop(h2, x2, y2, 60),
    stop(h3, x3, y3, 52),
    `hsl(${h1} var(--art-base-sat) calc(var(--art-base-light) + ${lumaOffset(h1)}%))`
  ].join(', ')

  return { background, hues: [h1, h2, h3] }
}
