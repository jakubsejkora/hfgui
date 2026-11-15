import { useEffect } from 'react'
import { VIEWS, useUiStore } from './uiStore'

/** Focus the omnibox; if the model sheet is open, close it first. */
export function focusSearch(): void {
  const ui = useUiStore.getState()
  const focus = (): void => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="search-input"]')
    input?.focus()
    input?.select()
  }
  if (ui.selectedModelId) {
    ui.closeModel()
    // The sheet hands focus back to where it came from as it unmounts (~200 ms);
    // take it after that.
    setTimeout(focus, 260)
  } else {
    focus()
  }
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

/**
 * ⌘K or / → search · ⌘1–5 → pages · ⌘, → Settings. (⌘B, the sidebar, is handled
 * by SidebarProvider.) "/" is ignored while typing: repo ids contain slashes.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        focusSearch()
        return
      }
      if (!mod && e.key === '/' && !isTyping(e.target)) {
        e.preventDefault()
        focusSearch()
        return
      }
      if (mod && (e.key === ',' || /^[1-5]$/.test(e.key))) {
        e.preventDefault()
        const ui = useUiStore.getState()
        if (ui.selectedModelId) ui.closeModel()
        ui.setView(e.key === ',' ? 'settings' : VIEWS[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
