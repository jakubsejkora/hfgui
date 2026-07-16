import { ExternalLink, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from '@/lib/toastStore'
import { useInvalidate, useTokenStatus } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export function TokenDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const [value, setValue] = useState('')
  const { data: status } = useTokenStatus()
  const invalidate = useInvalidate()

  const save = async (): Promise<void> => {
    const token = value.trim()
    if (!token) return
    await window.hfgui.setHfToken(token)
    invalidate(['token-status'])
    setValue('')
    onOpenChange(false)
    toast('success', 'Hugging Face token saved')
  }

  const clear = async (): Promise<void> => {
    await window.hfgui.setHfToken(null)
    invalidate(['token-status'])
    toast('info', 'Token removed')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="text-text mb-1 flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="text-accent h-4 w-4" />
        Hugging Face token
      </DialogTitle>
      <p className="text-muted mb-4 text-xs leading-relaxed">
        Needed for gated models (Llama, Gemma…). Accept the model&apos;s license on
        huggingface.co first, then paste a read token here. Stored encrypted on this Mac.
      </p>
      <div className="flex flex-col gap-3">
        <Input
          type="password"
          placeholder="hf_…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={!value.trim()}>
            Save token
          </Button>
          {status?.source === 'app' && (
            <Button variant="danger" size="sm" onClick={() => void clear()}>
              Remove saved token
            </Button>
          )}
          <button
            onClick={() => void window.hfgui.openExternal('https://huggingface.co/settings/tokens')}
            className="text-muted hover:text-text ml-auto flex cursor-pointer items-center gap-1 text-xs underline"
          >
            Create token <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        {status?.source === 'huggingface-cli' && (
          <p className="text-faint text-[11px]">
            Currently using the token from <span className="font-mono">~/.cache/huggingface/token</span>.
          </p>
        )}
      </div>
    </Dialog>
  )
}
