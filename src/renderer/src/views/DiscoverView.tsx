import { ArrowRight, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  ladderOf,
  macMemoryGB,
  selectPicks,
  tierFor,
  type PickFormat
} from '@shared/discover'
import { CATEGORIES, type Category, type CategoryId } from '@shared/picks'
import { usePrefs } from '@/lib/prefsStore'
import { usePopular, useSystemInfo } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MemoryLadder } from '@/components/app/MemoryLadder'
import { ModelCard, ModelCardSkeleton } from '@/components/app/ModelCard'
import { Page, PageHeader, Section } from '@/components/app/Page'
import { PickCard } from '@/components/app/PickCard'
import { Tip } from '@/components/app/Tip'

/*
 * "What should I download?" — hfgui's picks per category, for this Mac's
 * memory, and what else is popular from people worth trusting. Everything is
 * either in the app (src/shared/picks.ts) or read live from the Hub.
 */

const GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]'

function FormatSwitch() {
  const format = usePrefs((s) => s.discoverFormat)
  const setPrefs = usePrefs((s) => s.set)
  return (
    <Tip content="GGUF runs everywhere: LM Studio, llama.cpp, Ollama. MLX is made for Apple silicon: LM Studio, mlx-lm, exo.">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={format}
        onValueChange={(v) => v && setPrefs({ discoverFormat: v as PickFormat })}
        aria-label="Format"
      >
        <ToggleGroupItem value="gguf" className="px-3" data-testid="discover-gguf">
          GGUF
        </ToggleGroupItem>
        <ToggleGroupItem value="mlx" className="px-3" data-testid="discover-mlx">
          MLX
        </ToggleGroupItem>
      </ToggleGroup>
    </Tip>
  )
}

function Picks({ category, format }: { category: Category; format: PickFormat }) {
  const { data: system } = useSystemInfo()
  const memoryGB = system ? macMemoryGB(system.totalMemoryBytes) : null
  const macTier = memoryGB != null ? tierFor(category, memoryGB) : null
  // A stop on the ladder shows another Mac's pick; a new category starts at this Mac's.
  const [chosen, setChosen] = useState<number | null>(null)
  useEffect(() => setChosen(null), [category.id])
  const stops = ladderOf(category)
  const tier = chosen ?? macTier ?? stops[0].tier
  const { pick, alsoGood } = selectPicks(category, tier)
  const forThisMac = macTier !== null && tier <= macTier

  return (
    <div className="flex flex-col gap-5">
      {stops.length > 1 && memoryGB != null && macTier !== null && (
        <div className="rounded-xl border bg-card px-3 pt-3 pb-1 shadow-xs">
          <MemoryLadder
            stops={stops}
            macTier={macTier}
            macMemoryGB={memoryGB}
            selected={tier}
            onSelect={(t) => setChosen(t === macTier ? null : t)}
          />
        </div>
      )}
      {!forThisMac && memoryGB != null && (
        <p className="-mb-1 flex items-center gap-2 text-sm text-muted-foreground" data-testid="discover-bigger-mac">
          <Info className="size-4 shrink-0" />
          Picked for a Mac with {tier} GB — this one has {memoryGB} GB.
          <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setChosen(null)}>
            Back to this Mac
          </Button>
        </p>
      )}
      <div className={GRID} data-testid="discover-picks">
        <PickCard
          pick={pick}
          format={format}
          eyebrow={forThisMac ? 'Our pick for this Mac' : `Our pick for ${tier} GB`}
          className="border-foreground/35"
        />
        {alsoGood.map((p) => (
          <PickCard key={p.name} pick={p} format={format} eyebrow={p.minMemoryGB < tier ? 'Lighter and faster' : 'Also good'} />
        ))}
      </div>
      {category.note && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {category.note}
        </p>
      )}
    </div>
  )
}

function PopularNow({ category, format }: { category: Category; format: PickFormat }) {
  const openModel = useUiStore((s) => s.openModel)
  const query = usePopular(category, format)
  return (
    <Section
      title="Popular now"
      description="The most downloaded this month from model makers and the converters people trust — only what fits this Mac."
    >
      {query.isLoading ? (
        <div className={GRID}>
          {Array.from({ length: 3 }).map((_, i) => (
            <ModelCardSkeleton key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Couldn’t reach Hugging Face just now.
        </p>
      ) : query.models.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing else popular fits this Mac right now.
        </p>
      ) : (
        <div className={GRID} data-testid="discover-popular">
          {query.models.map((m) => (
            <ModelCard key={m.id} model={m} onClick={() => openModel(m.id)} />
          ))}
        </div>
      )}
    </Section>
  )
}

export function DiscoverView() {
  const tab = usePrefs((s) => s.discoverTab)
  const format = usePrefs((s) => s.discoverFormat)
  const setPrefs = usePrefs((s) => s.set)
  const setSearch = useUiStore((s) => s.setSearch)
  const setView = useUiStore((s) => s.setView)
  const category = CATEGORIES.find((c) => c.id === tab) ?? CATEGORIES[0]

  const browseMore = (): void => {
    setPrefs({ format, task: category.browse.task, sort: 'downloads' })
    setSearch(category.browse.search ?? '')
    setView('browse')
  }

  return (
    <Page className="max-w-[1400px]">
      <PageHeader
        title="Discover"
        description="Models worth downloading, picked for the memory in this Mac."
        actions={<FormatSwitch />}
      />

      <Tabs value={category.id} onValueChange={(v) => setPrefs({ discoverTab: v as CategoryId })}>
        <TabsList aria-label="Category" className="flex-wrap">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.id} value={c.id} data-testid={`discover-tab-${c.id}`}>
              {c.title}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Section
        title={category.title}
        description={category.blurb}
        actions={
          <Button variant="ghost" size="sm" onClick={browseMore}>
            Browse more <ArrowRight />
          </Button>
        }
      >
        <Picks category={category} format={format} />
      </Section>

      {category.popular && <PopularNow category={category} format={format} />}
    </Page>
  )
}
