import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useToastStore, type Toast } from '@/lib/toastStore'
import { cn } from '@/lib/utils'

const ICON: Record<Toast['kind'], React.ReactNode> = {
  success: <CircleCheck className="size-4 shrink-0 text-success" />,
  error: <CircleAlert className="size-4 shrink-0 text-destructive" />,
  info: <Info className="size-4 shrink-0 text-muted-foreground" />
}

/**
 * Sonner-style stack, bottom-right, floating above the downloads dock (which
 * publishes its height as --dock-h). Announced to screen readers; hovering a
 * toast holds its timer so its buttons never vanish mid-reach.
 *
 * pointer-events-auto: while a Radix modal (the sheet) is open, <body> gets
 * pointer-events:none — toasts must stay clickable above it. The sheet ignores
 * clicks inside [data-slot="toaster"] so a toast action never closes it.
 */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  const pause = useToastStore((s) => s.pause)
  const resume = useToastStore((s) => s.resume)

  return (
    <div
      data-slot="toaster"
      role="region"
      aria-label="Notifications"
      className="pointer-events-auto fixed right-4 z-[70] flex w-[22rem] flex-col gap-2"
      style={{ bottom: 'calc(var(--dock-h, 0px) + 1rem)' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
          onMouseEnter={() => pause(t.id)}
          onMouseLeave={() => resume(t.id)}
          onFocus={() => pause(t.id)}
          onBlur={() => resume(t.id)}
          className="flex animate-in flex-col gap-2.5 rounded-xl border bg-popover p-3.5 text-popover-foreground shadow-lg duration-200 fade-in-0 slide-in-from-bottom-2"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-px">{ICON[t.kind]}</span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm leading-snug font-medium">{t.message}</p>
              {t.description && (
                <p className="text-xs leading-relaxed text-muted-foreground">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mt-0.5 -mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {t.actions && t.actions.length > 0 && (
            <div className="flex items-center justify-end gap-1.5">
              {t.actions.map((action, i) => (
                <button
                  type="button"
                  key={action.label}
                  data-testid={action.testid}
                  onClick={() => {
                    action.onClick()
                    dismiss(t.id)
                  }}
                  className={cn(
                    'h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    i === t.actions!.length - 1
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border bg-background hover:bg-accent'
                  )}
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
