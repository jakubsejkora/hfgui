import { useEffect } from 'react'

/**
 * Mirrors prefers-color-scheme into an `html.light` class that swaps the
 * design tokens in globals.css. The main process drives the media query via
 * nativeTheme.themeSource, so the theme setting and OS changes both land here.
 */
export function useTheme(): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = (): void => {
      document.documentElement.classList.toggle('light', media.matches)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])
}
