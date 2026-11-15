import { create } from 'zustand'

export type View = 'overview' | 'browse' | 'downloads' | 'private-inference' | 'guide' | 'settings'

/** Sidebar order, which ⌘1–6 follow. */
export const VIEWS: View[] = ['overview', 'browse', 'downloads', 'private-inference', 'guide', 'settings']

/** Session-only UI state — see prefsStore for what survives a restart. */
interface UiState {
  view: View
  selectedModelId: string | null
  /** The omnibox text. Lives here because the header owns the field but
   *  BrowseView runs the query, and the 404 panel can rewrite it. */
  search: string
  dockExpanded: boolean
  tokenDialogOpen: boolean
  /** A Guide section to scroll to once the Guide opens. */
  guideSection: string | null
  setView(view: View): void
  openGuide(section?: string): void
  setSearch(search: string): void
  openModel(id: string): void
  closeModel(): void
  setDockExpanded(expanded: boolean): void
  setTokenDialogOpen(open: boolean): void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'overview',
  selectedModelId: null,
  search: '',
  dockExpanded: false,
  tokenDialogOpen: false,
  guideSection: null,
  setView: (view) => set({ view }),
  openGuide: (section) => set({ view: 'guide', guideSection: section ?? null, selectedModelId: null }),
  // Typing in the omnibox is always a request to browse.
  setSearch: (search) => set((s) => ({ search, view: search ? 'browse' : s.view })),
  openModel: (id) => set({ selectedModelId: id }),
  closeModel: () => set({ selectedModelId: null }),
  setDockExpanded: (dockExpanded) => set({ dockExpanded }),
  setTokenDialogOpen: (tokenDialogOpen) => set({ tokenDialogOpen })
}))
