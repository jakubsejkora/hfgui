import { create } from 'zustand'

export type View = 'browse' | 'downloads' | 'private-inference' | 'settings'

interface UiState {
  view: View
  selectedModelId: string | null
  /** The omnibox text. Lives here because the top bar owns the field but
   *  BrowseView runs the query, and the 404 panel can rewrite it. */
  search: string
  dockExpanded: boolean
  setView(view: View): void
  setSearch(search: string): void
  openModel(id: string): void
  closeModel(): void
  setDockExpanded(expanded: boolean): void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'browse',
  selectedModelId: null,
  search: '',
  dockExpanded: false,
  setView: (view) => set({ view }),
  // Typing in the omnibox is always a request to browse.
  setSearch: (search) => set((s) => ({ search, view: search ? 'browse' : s.view })),
  openModel: (id) => set({ selectedModelId: id }),
  closeModel: () => set({ selectedModelId: null }),
  setDockExpanded: (dockExpanded) => set({ dockExpanded })
}))
