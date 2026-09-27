import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick(): void
  testid?: string
}

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
  actions?: ToastAction[]
}

export interface ToastOptions {
  actions?: ToastAction[]
  /** Overrides the default dismissal delay; 0 keeps the toast until dismissed. */
  durationMs?: number
}

interface ToastState {
  toasts: Toast[]
  push(kind: Toast['kind'], message: string, opts?: ToastOptions): number
  dismiss(id: number): void
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, opts) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, actions: opts?.actions }] }))
    // Anything with a button needs long enough to read the label and reach it.
    const duration = opts?.durationMs ?? (opts?.actions?.length ? 9000 : 4500)
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export function toast(kind: Toast['kind'], message: string, opts?: ToastOptions): number {
  return useToastStore.getState().push(kind, message, opts)
}

export function dismissToast(id: number): void {
  useToastStore.getState().dismiss(id)
}
