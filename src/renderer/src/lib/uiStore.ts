import { create } from 'zustand'

export type View = 'browse' | 'downloads' | 'settings'

interface UiState {
  view: View
  selectedModelId: string | null
  setView(view: View): void
  openModel(id: string): void
  closeModel(): void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'browse',
  selectedModelId: null,
  setView: (view) => set({ view }),
  openModel: (id) => set({ selectedModelId: id }),
  closeModel: () => set({ selectedModelId: null })
}))
