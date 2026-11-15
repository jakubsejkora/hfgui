import { ArrowRight, Link2, Search, X } from 'lucide-react'
import { useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { parseModelRef } from '@shared/modelRef'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Kbd } from '@/components/ui/kbd'
import { ClipboardChip } from './ClipboardChip'

/**
 * Search and "paste a link" in one field. A Hugging Face URL or a bare
 * `owner/model` is recognised as you type and offered as a direct jump, so the
 * most common way people arrive at a model — with its link already copied —
 * stops being a dead end.
 */
export function Omnibox() {
  const search = useUiStore((s) => s.search)
  const setSearch = useUiStore((s) => s.setSearch)
  const openModel = useUiStore((s) => s.openModel)
  const [focused, setFocused] = useState(false)

  const ref = useMemo(() => parseModelRef(search), [search])
  const [dismissed, setDismissed] = useState<string | null>(null)
  const suggestion = ref && dismissed !== search ? ref : null

  const open = (repoId: string, input?: HTMLInputElement | null): void => {
    openModel(repoId)
    input?.blur()
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    // Only hijack a paste into an empty field, and only for a real URL —
    // never interrupt someone amending a half-typed query.
    if (search) return
    const pasted = e.clipboardData.getData('text/plain')
    const parsed = parseModelRef(pasted)
    if (!parsed?.fromUrl) return
    e.preventDefault()
    open(parsed.repoId, e.currentTarget)
    toast('info', `Opened ${parsed.repoId} from the link`)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && suggestion) {
      e.preventDefault()
      open(suggestion.repoId, e.currentTarget)
    } else if (e.key === 'Escape') {
      if (suggestion) setDismissed(search)
      else if (search) setSearch('')
      else e.currentTarget.blur()
    }
  }

  return (
    <div className="relative min-w-0" data-no-drag>
      <div
        className={cn(
          'flex h-9 items-center rounded-lg border border-transparent bg-muted/70 pr-1.5 pl-3 transition-[background-color,border-color,box-shadow]',
          'hover:bg-muted focus-within:border-ring focus-within:bg-background focus-within:ring-[3px] focus-within:ring-ring/25'
        )}
      >
        {suggestion ? (
          <Link2 className="size-4 shrink-0 text-foreground" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search models, or paste a Hugging Face link…"
          aria-label="Search models or paste a link"
          autoComplete="off"
          spellCheck={false}
          data-testid="search-input"
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground/80"
        />
        {suggestion ? (
          <button
            type="button"
            onClick={(e) => open(suggestion.repoId, e.currentTarget.parentElement?.querySelector('input'))}
            data-testid="omnibox-open"
            className="flex h-6 max-w-[16rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-primary pr-1.5 pl-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="truncate">Open {suggestion.repoId}</span>
            <ArrowRight className="size-3.5 shrink-0" />
          </button>
        ) : search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          !focused && <Kbd className="mr-0.5 bg-background/80 shadow-xs dark:bg-background/40">⌘K</Kbd>
        )}
      </div>
      {/* While the field already holds a link, the chip would just be noise. */}
      {!ref && <ClipboardChip />}
    </div>
  )
}
