import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useToastStore } from '@/lib/toastStore'

const icons = {
  success: <CheckCircle2 className="text-success h-4 w-4 shrink-0" />,
  error: <AlertTriangle className="text-danger h-4 w-4 shrink-0" />,
  info: <Info className="text-mlx h-4 w-4 shrink-0" />
}

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (!toasts.length) return null
  return (
    <div
      className="fixed right-4 z-[70] flex w-84 flex-col gap-2"
      // Float above the downloads dock, which publishes its height on :root.
      style={{ bottom: 'calc(var(--dock-h, 0px) + 1rem)' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="sleeve animate-pop-in flex flex-col gap-2 p-3.5 shadow-[var(--shadow-float)]"
        >
          <div className="flex items-start gap-2.5">
            {icons[t.kind]}
            <span className="text-text min-w-0 flex-1 text-xs leading-relaxed">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-faint hover:text-text shrink-0 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {t.actions && t.actions.length > 0 && (
            <div className="flex items-center justify-end gap-1.5">
              {t.actions.map((action) => (
                <button
                  key={action.label}
                  data-testid={action.testid}
                  onClick={() => {
                    action.onClick()
                    dismiss(t.id)
                  }}
                  className="text-muted hover:text-text hover:bg-surface-3 h-7 cursor-pointer rounded-full px-3 text-[11px] font-medium transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
