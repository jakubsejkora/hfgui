import { useEffect } from 'react'

/**
 * Mirrors prefers-color-scheme onto <html>: `.dark` drives the shadcn tokens in
 * globals.css, and `.light` is kept alongside it because the Playwright drivers
 * wait on it. The main process drives the media query via
 * nativeTheme.themeSource, so the theme setting and OS changes both land here.
 */
export function applyThemeClass(): void {
  const light = window.matchMedia('(prefers-color-scheme: light)').matches
  document.documentElement.classList.toggle('light', light)
  document.documentElement.classList.toggle('dark', !light)
}

export function useTheme(): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    applyThemeClass()
    media.addEventListener('change', applyThemeClass)
    return () => media.removeEventListener('change', applyThemeClass)
  }, [])
}
