import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * A path the way people say it: the home folder as ~. Also keeps "/Users/…"
 * off screen — scripts/e2e-mlx.mjs expects the model sheet's destination line
 * to be the only absolute path rendered as text.
 */
export function displayPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')
}

/** What a destination holds, for "free space on the drive with …" lines. */
export function destinationHolding(info: { kind: string; label: string }): string {
  return info.kind === 'custom' ? 'your models folder' : `${info.label}’s models`
}
