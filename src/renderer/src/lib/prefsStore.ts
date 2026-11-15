import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FormatFilter, SortKey } from './hfApi'

export type BrowseLayout = 'grid' | 'table'
export type DownloadsTab = 'all' | 'in-progress' | 'finished' | 'failed'

/**
 * Preferences that survive navigation and restarts. Kept apart from uiStore on
 * purpose: persisting the view, the open model or the search text would reopen
 * the sheet or change the landing page on launch.
 *
 * Defaults must match the app's long-standing behaviour — fresh e2e profiles
 * rely on GGUF + Trending + grid.
 */
interface Prefs {
  format: FormatFilter
  task: string
  sort: SortKey
  layout: BrowseLayout
  sidebarOpen: boolean
  guideCardDismissed: boolean
  downloadsTab: DownloadsTab
}

interface PrefsState extends Prefs {
  set(patch: Partial<Prefs>): void
}

export const DEFAULT_PREFS: Prefs = {
  format: 'gguf',
  task: 'all',
  sort: 'trendingScore',
  layout: 'grid',
  sidebarOpen: true,
  guideCardDismissed: false,
  downloadsTab: 'all'
}

const SORTS: SortKey[] = ['trendingScore', 'downloads', 'likes', 'lastModified']
const FORMATS: FormatFilter[] = ['gguf', 'mlx', null]
const TABS: DownloadsTab[] = ['all', 'in-progress', 'finished', 'failed']

/** Anything stored by an older (or newer) build is checked before it is trusted. */
export function sanitizePrefs(stored: unknown): Prefs {
  const s = (stored ?? {}) as Partial<Record<keyof Prefs, unknown>>
  return {
    format: FORMATS.includes(s.format as FormatFilter) ? (s.format as FormatFilter) : DEFAULT_PREFS.format,
    task: typeof s.task === 'string' && s.task ? s.task : DEFAULT_PREFS.task,
    sort: SORTS.includes(s.sort as SortKey) ? (s.sort as SortKey) : DEFAULT_PREFS.sort,
    layout: s.layout === 'table' ? 'table' : 'grid',
    sidebarOpen: s.sidebarOpen !== false,
    guideCardDismissed: s.guideCardDismissed === true,
    downloadsTab: TABS.includes(s.downloadsTab as DownloadsTab)
      ? (s.downloadsTab as DownloadsTab)
      : DEFAULT_PREFS.downloadsTab
  }
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      set: (patch) => set(patch)
    }),
    {
      name: 'hfgui-prefs',
      version: 1,
      partialize: ({ set: _set, ...prefs }) => prefs,
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted) })
    }
  )
)
