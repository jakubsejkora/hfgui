import { create } from 'zustand'

export type View = 'overview' | 'browse' | 'downloads' | 'private-inference' | 'settings'

export const VIEWS: View[] = ['overview', 'browse', 'downloads', 'private-inference', 'settings']

/** Session-only UI state — see prefsStore for what survives a restart. */
interface UiState {
  view: View
  selectedModelId: string | null
  /** The omnibox text. Lives here because the header owns the field but
   *  BrowseView runs the query, and the 404 panel can rewrite it. */
  search: string
  dockExpanded: boolean
  tokenDialogOpen: boolean
  setView(view: View): void
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
  setView: (view) => set({ view }),
  // Typing in the omnibox is always a request to browse.
  setSearch: (search) => set((s) => ({ search, view: search ? 'browse' : s.view })),
  openModel: (id) => set({ selectedModelId: id }),
  closeModel: () => set({ selectedModelId: null }),
  setDockExpanded: (dockExpanded) => set({ dockExpanded }),
  setTokenDialogOpen: (tokenDialogOpen) => set({ tokenDialogOpen })
}))
