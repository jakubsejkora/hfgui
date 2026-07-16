import type { HfguiApi } from '@shared/ipc'

declare global {
  interface Window {
    hfgui: HfguiApi
  }
}

export {}
