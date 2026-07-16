import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useToastStore } from '@/lib/toastStore'
import { cn } from '@/lib/utils'

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
    <div className="fixed right-4 bottom-4 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'bg-surface-2 border-border animate-pop-in flex items-start gap-2.5 rounded-xl border p-3 shadow-2xl shadow-black/50'
          )}
        >
          {icons[t.kind]}
          <span className="text-text min-w-0 flex-1 text-xs leading-relaxed">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="text-faint hover:text-text cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
