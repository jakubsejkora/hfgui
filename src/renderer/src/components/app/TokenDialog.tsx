import { CircleAlert, ExternalLink } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { openExternal } from '@/lib/actions'
import { useInvalidate, useTokenStatus } from '@/lib/queries'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'

type Check = { kind: 'idle' } | { kind: 'saving' } | { kind: 'rejected' } | { kind: 'error'; message: string }

/**
 * Ask Hugging Face who the saved token belongs to. The request carries no
 * token from here: main attaches the stored one to huggingface.co/api/*.
 */
async function whoami(): Promise<string | null> {
  const res = await fetch('https://huggingface.co/api/whoami-v2')
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new Error(`Hugging Face answered HTTP ${res.status}`)
  const body = (await res.json()) as { name?: string }
  return body.name ?? null
}

export function TokenDialog() {
  const open = useUiStore((s) => s.tokenDialogOpen)
  const setOpen = useUiStore((s) => s.setTokenDialogOpen)
  const [value, setValue] = useState('')
  const [check, setCheck] = useState<Check>({ kind: 'idle' })
  const { data: status } = useTokenStatus()
  const invalidate = useInvalidate()
  const inputId = useId()

  useEffect(() => {
    if (open) {
      setValue('')
      setCheck({ kind: 'idle' })
    }
  }, [open])

  const save = async (): Promise<void> => {
    const token = value.trim()
    if (!token) return
    setCheck({ kind: 'saving' })
    try {
      await window.hfgui.setHfToken(token)
      invalidate(['token-status', 'hf-account'])
      const name = await whoami()
      if (!name) {
        setCheck({ kind: 'rejected' })
        return
      }
      setOpen(false)
      toast('success', `Signed in to Hugging Face as @${name}`, {
        description: 'The token is stored encrypted on this Mac.'
      })
    } catch (error) {
      setCheck({ kind: 'error', message: (error as Error).message })
    }
  }

  const remove = async (): Promise<void> => {
    try {
      await window.hfgui.setHfToken(null)
      invalidate(['token-status', 'hf-account'])
      setOpen(false)
      toast('info', 'Token removed')
    } catch (error) {
      toast('error', `Couldn’t remove the token — ${(error as Error).message}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hugging Face token</DialogTitle>
          <DialogDescription>
            Needed for gated models like Llama and Gemma. Accept the model’s license on huggingface.co
            first, then paste a read token here. It is stored encrypted on this Mac.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Label htmlFor={inputId}>Access token</Label>
          <Input
            id={inputId}
            type="password"
            placeholder="hf_…"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (check.kind !== 'saving') setCheck({ kind: 'idle' })
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => openExternal('https://huggingface.co/settings/tokens')}
            className="flex cursor-pointer items-center gap-1 self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Create a token on huggingface.co <ExternalLink className="size-3" />
          </button>
          {status?.source === 'huggingface-cli' && (
            <p className="text-xs text-muted-foreground">
              Currently using the token from <span className="font-mono">~/.cache/huggingface/token</span>.
            </p>
          )}
        </form>

        {check.kind === 'rejected' && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Hugging Face rejected this token</AlertTitle>
            <AlertDescription>
              It was saved, but it can’t sign in. Check that it is a valid read token, or remove it.
            </AlertDescription>
          </Alert>
        )}
        {check.kind === 'error' && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Couldn’t save the token</AlertTitle>
            <AlertDescription>{check.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="sm:justify-between">
          {status?.source === 'app' || check.kind === 'rejected' ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()}>
              Remove saved token
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={!value.trim() || check.kind === 'saving'}>
              {check.kind === 'saving' && <Spinner />}
              Save and verify
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
