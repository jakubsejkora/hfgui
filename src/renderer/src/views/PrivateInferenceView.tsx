import { ChevronRight, ExternalLink, Keyboard, Mic, RotateCcw, Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { openExternal } from '@/lib/actions'
import { HfApiError } from '@/lib/hfApi'
import { useModelSummary } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { FormatBadge } from '@/components/app/badges'
import { ModelAvatar } from '@/components/app/ModelAvatar'
import { ModelContextMenu } from '@/components/app/ModelMenus'
import { LibraryPill, SizeLabel } from '@/components/app/modelFacts'
import { Page, PageHeader } from '@/components/app/Page'
import { TOOLS, type Suggestion, type ToolInfo } from './privateInferenceData'

const TOOL_ICON: Record<ToolInfo['icon'], ReactNode> = {
  keyboard: <Keyboard className="size-4" />,
  mic: <Mic className="size-4" />,
  table: <Table2 className="size-4" />
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  const openModel = useUiStore((s) => s.openModel)
  const query = useModelSummary(suggestion.repoId)
  const model = query.data

  // A renamed or removed repo gets a slim notice instead of a dead row.
  if (query.isError && query.error instanceof HfApiError && query.error.status === 404) {
    return (
      <li className="px-4 py-3 text-xs text-muted-foreground">
        <span className="font-mono">{suggestion.repoId}</span> was removed or renamed on the Hub.
      </li>
    )
  }
  if (query.isError) {
    return (
      <li className="flex items-center gap-3 px-4 py-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">Couldn’t load {suggestion.repoId}</span>
        <Button variant="ghost" size="xs" onClick={() => void query.refetch()}>
          <RotateCcw /> Retry
        </Button>
      </li>
    )
  }
  if (!model) {
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </li>
    )
  }

  return (
    <li>
      <ModelContextMenu model={model}>
        <button
          type="button"
          onClick={() => openModel(model.id)}
          className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
        >
          <ModelAvatar repoId={model.id} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{model.name}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">{model.author}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {suggestion.reason}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <LibraryPill repoId={model.id} />
            <span className="hidden @2xl:inline">
              <SizeLabel model={model} />
            </span>
            <FormatBadge format={model.format} />
            <ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </button>
      </ModelContextMenu>
    </li>
  )
}

export function PrivateInferenceView() {
  return (
    <Page>
      <PageHeader
        title="Private inference"
        description="Model picks for offtype, offrecord and offtable — local-first apps that run everything on-device with models you download here."
      />
      <div className="flex flex-col gap-6">
        {TOOLS.map((tool) => (
          <Card key={tool.name} className="@container gap-0 overflow-hidden py-0">
            <CardHeader className="gap-1.5 border-b py-5 [.border-b]:pb-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                  {TOOL_ICON[tool.icon]}
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex items-baseline gap-2">
                    {tool.name}
                    <span className="text-sm font-normal text-muted-foreground">{tool.tagline}</span>
                  </CardTitle>
                  <CardDescription>{tool.about}</CardDescription>
                  <p className="text-xs leading-relaxed text-muted-foreground/90">{tool.modelNeeds}</p>
                </div>
              </div>
              {tool.url && (
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => openExternal(tool.url!)}>
                    Visit site <ExternalLink />
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y">
                {tool.suggestions.map((s) => (
                  <SuggestionRow key={s.repoId} suggestion={s} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  )
}
