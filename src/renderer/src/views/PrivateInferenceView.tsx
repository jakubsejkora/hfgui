import { ExternalLink, Keyboard, Mic, RotateCcw, Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { HfApiError } from '@/lib/hfApi'
import { useModelSummary } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { ModelCard } from '@/components/app/ModelCard'
import { TOOLS, type Suggestion, type ToolInfo } from './privateInferenceData'

const TOOL_ICON: Record<ToolInfo['icon'], ReactNode> = {
  keyboard: <Keyboard className="h-4 w-4" />,
  mic: <Mic className="h-4 w-4" />,
  table: <Table2 className="h-4 w-4" />
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const openModel = useUiStore((s) => s.openModel)
  const query = useModelSummary(suggestion.repoId)

  // A renamed/removed repo gets a slim notice instead of a dead card.
  if (query.isError && query.error instanceof HfApiError && query.error.status === 404) {
    return (
      <div className="text-faint px-1 text-[11px] leading-relaxed">
        <span className="font-mono">{suggestion.repoId}</span> was removed or renamed on the Hub
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {query.data ? (
        <ModelCard model={query.data} onClick={() => openModel(suggestion.repoId)} />
      ) : query.isError ? (
        <div className="border-border bg-surface text-faint flex h-[104px] flex-col items-center justify-center gap-2 rounded-xl border p-4 text-xs">
          <span>Couldn’t load {suggestion.repoId}</span>
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            <RotateCcw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[104px] rounded-xl" />
      )}
      <p className="text-faint px-1 text-[11px] leading-relaxed">{suggestion.reason}</p>
    </div>
  )
}

export function PrivateInferenceView() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-6 pt-6 pb-4">
        <h1 className="text-[15px] font-semibold">Private inference</h1>
        <p className="text-faint mt-0.5 text-xs">
          Model picks for offtype, offrecord and offtable — local-first apps that run everything
          on-device with models you download here.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-10">
          {TOOLS.map((tool) => (
            <section key={tool.name} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="bg-surface-2 border-border text-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                  {TOOL_ICON[tool.icon]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-[13px] font-semibold">{tool.name}</h2>
                    <span className="text-muted text-xs">{tool.tagline}</span>
                    {tool.url && (
                      <Tooltip content={`Visit the ${tool.name} site`}>
                        <button
                          onClick={() => void window.hfgui.openExternal(tool.url!)}
                          aria-label={`Visit the ${tool.name} site`}
                          className="text-muted hover:text-text cursor-pointer self-center"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <p className="text-muted text-[11px] leading-relaxed">{tool.about}</p>
                  <p className="text-faint text-[11px] leading-relaxed">{tool.modelNeeds}</p>
                </div>
              </div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {tool.suggestions.map((s) => (
                  <SuggestionCard key={s.repoId} suggestion={s} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
