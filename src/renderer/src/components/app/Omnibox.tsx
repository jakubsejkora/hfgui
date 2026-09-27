import { ArrowRight, Link2, Search, X } from 'lucide-react'
import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { parseModelRef } from '@shared/modelRef'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
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
  const inputRef = useRef<HTMLInputElement>(null)

  const ref = useMemo(() => parseModelRef(search), [search])
  const [dismissed, setDismissed] = useState<string | null>(null)
  const suggestion = ref && dismissed !== search ? ref : null

  const open = (repoId: string): void => {
    openModel(repoId)
    inputRef.current?.blur()
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    // Only hijack a paste into an empty field, and only for a real URL —
    // never interrupt someone amending a half-typed query.
    if (search) return
    const pasted = e.clipboardData.getData('text/plain')
    const parsed = parseModelRef(pasted)
    if (!parsed?.fromUrl) return
    e.preventDefault()
    open(parsed.repoId)
    toast('info', `Opened ${parsed.repoId} from the link`)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && suggestion) {
      e.preventDefault()
      open(suggestion.repoId)
    } else if (e.key === 'Escape') {
      if (suggestion) setDismissed(search)
      else if (search) setSearch('')
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        className={cn(
          'slot no-drag flex h-10 items-center rounded-full pr-1.5 pl-3.5 transition-shadow',
          'focus-within:ring-accent/35 focus-within:ring-2'
        )}
      >
        {suggestion ? (
          <Link2 className="text-accent h-4 w-4 shrink-0" />
        ) : (
          <Search className="text-faint h-4 w-4 shrink-0" />
        )}
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          placeholder="Search models, or paste a Hugging Face link…"
          aria-label="Search models or paste a link"
          autoComplete="off"
          spellCheck={false}
          data-testid="search-input"
          className="text-text placeholder:text-faint min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none"
        />
        {suggestion ? (
          <button
            onClick={() => open(suggestion.repoId)}
            data-testid="omnibox-open"
            className="bg-accent text-accent-fg hover:bg-accent-hover flex h-7 max-w-[15rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-full pr-2 pl-3 text-xs font-semibold transition-colors"
          >
            <span className="truncate">Open {suggestion.repoId}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        ) : search ? (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="text-faint hover:text-text flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {/* While the field already holds a link, the chip would just be noise. */}
      {!ref && <ClipboardChip />}
    </div>
  )
}
