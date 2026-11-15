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
  /** Optional second line, quieter than the message. */
  description?: string
  actions?: ToastAction[]
}

export interface ToastOptions {
  actions?: ToastAction[]
  description?: string
  /** Overrides the default dismissal delay; 0 keeps the toast until dismissed. */
  durationMs?: number
}

interface ToastState {
  toasts: Toast[]
  push(kind: Toast['kind'], message: string, opts?: ToastOptions): number
  dismiss(id: number): void
  /** Hovering a toast holds its timer, so an action button never vanishes mid-reach. */
  pause(id: number): void
  resume(id: number): void
}

/** More than this and the stack starts covering the window. */
const MAX_TOASTS = 3

let nextId = 1

interface Timer {
  handle: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
}
const timers = new Map<number, Timer>()

export const useToastStore = create<ToastState>((set, get) => {
  const startTimer = (id: number, ms: number): void => {
    const handle = setTimeout(() => get().dismiss(id), ms)
    timers.set(id, { handle, remaining: ms, startedAt: Date.now() })
  }

  return {
    toasts: [],
    push: (kind, message, opts) => {
      const id = nextId++
      set((s) => {
        const toasts = [
          ...s.toasts,
          { id, kind, message, description: opts?.description, actions: opts?.actions }
        ]
        for (const dropped of toasts.slice(0, Math.max(0, toasts.length - MAX_TOASTS))) {
          const t = timers.get(dropped.id)
          if (t?.handle) clearTimeout(t.handle)
          timers.delete(dropped.id)
        }
        return { toasts: toasts.slice(-MAX_TOASTS) }
      })
      // Anything with a button needs long enough to read the label and reach it.
      const duration = opts?.durationMs ?? (opts?.actions?.length ? 9000 : 4500)
      if (duration > 0) startTimer(id, duration)
      return id
    },
    dismiss: (id) => {
      const t = timers.get(id)
      if (t?.handle) clearTimeout(t.handle)
      timers.delete(id)
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
    },
    pause: (id) => {
      const t = timers.get(id)
      if (!t?.handle) return
      clearTimeout(t.handle)
      timers.set(id, { handle: null, remaining: t.remaining - (Date.now() - t.startedAt), startedAt: 0 })
    },
    resume: (id) => {
      const t = timers.get(id)
      if (!t || t.handle) return
      // A short grace after the pointer leaves, so it doesn't vanish instantly.
      startTimer(id, Math.max(t.remaining, 1500))
    }
  }
})

export function toast(kind: Toast['kind'], message: string, opts?: ToastOptions): number {
  return useToastStore.getState().push(kind, message, opts)
}

export function dismissToast(id: number): void {
  useToastStore.getState().dismiss(id)
}
