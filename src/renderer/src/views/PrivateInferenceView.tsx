import { Keyboard, Mic, Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useModelSummary } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { Skeleton } from '@/components/ui/skeleton'
import { ModelCard } from '@/components/app/ModelCard'

interface Suggestion {
  repoId: string
  reason: string
}

interface Tool {
  name: string
  icon: ReactNode
  tagline: string
  modelNeeds: string
  suggestions: Suggestion[]
}

const TOOLS: Tool[] = [
  {
    name: 'offtype',
    icon: <Keyboard className="h-4 w-4" />,
    tagline: 'Private writing assistant',
    modelNeeds:
      'Needs a small instruct model that answers fast — completions and rewrites happen on every keystroke, so latency beats raw quality here.',
    suggestions: [
      {
        repoId: 'Qwen/Qwen3-4B-GGUF',
        reason: 'Best quality-per-token at this size — the default pick.'
      },
      {
        repoId: 'mlx-community/Qwen3-4B-4bit',
        reason: 'Same model for MLX — fastest option on Apple silicon.'
      },
      {
        repoId: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
        reason: 'Slightly smaller and quicker; great for short rewrites.'
      },
      {
        repoId: 'lmstudio-community/gemma-3-4b-it-GGUF',
        reason: 'Strong multilingual writing in a compact model.'
      }
    ]
  },
  {
    name: 'offrecord',
    icon: <Mic className="h-4 w-4" />,
    tagline: 'Private meeting recorder & transcription',
    modelNeeds:
      'Needs a speech-to-text model. Larger ones transcribe more accurately; turbo/distilled variants keep up with live audio.',
    suggestions: [
      {
        repoId: 'mlx-community/whisper-large-v3-turbo',
        reason: 'Whisper turbo on MLX — accurate and fast enough for live capture.'
      },
      {
        repoId: 'ggerganov/whisper.cpp',
        reason: 'Official whisper.cpp models in every size, from tiny to large.'
      },
      {
        repoId: 'distil-whisper/distil-large-v3.5-ggml',
        reason: 'Distilled Whisper — near large-v3 accuracy at a fraction of the compute.'
      },
      {
        repoId: 'mlx-community/parakeet-tdt-0.6b-v2',
        reason: 'Tiny and extremely fast English transcription.'
      }
    ]
  },
  {
    name: 'offtable',
    icon: <Table2 className="h-4 w-4" />,
    tagline: 'Private spreadsheet & data analysis',
    modelNeeds:
      'Needs a model that reasons over tables, formulas, and queries — worth spending more RAM on than the typing models above.',
    suggestions: [
      {
        repoId: 'Qwen/Qwen3-8B-GGUF',
        reason: 'Strong reasoning over structured data; thinking mode helps hard queries.'
      },
      {
        repoId: 'mlx-community/Qwen3-8B-4bit',
        reason: 'Same model for MLX on Apple silicon.'
      },
      {
        repoId: 'Qwen/Qwen2.5-14B-Instruct-GGUF',
        reason: 'A step up in accuracy if you have the RAM for it.'
      },
      {
        repoId: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
        reason: 'Dependable all-rounder with solid SQL and formula skills.'
      }
    ]
  }
]

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const openModel = useUiStore((s) => s.openModel)
  const query = useModelSummary(suggestion.repoId)

  return (
    <div className="flex flex-col gap-1.5">
      {query.data ? (
        <ModelCard model={query.data} onClick={() => openModel(suggestion.repoId)} />
      ) : query.isError ? (
        <div className="border-border bg-surface text-faint flex h-[104px] items-center justify-center rounded-xl border p-4 text-xs">
          Couldn’t load {suggestion.repoId}
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
          Suggested models for privacy-first tools — everything runs locally, nothing leaves your
          machine.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-10">
          {TOOLS.map((tool) => (
            <section key={tool.name} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="bg-surface-2 border-border text-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                  {tool.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-[13px] font-semibold">{tool.name}</h2>
                    <span className="text-muted text-xs">{tool.tagline}</span>
                  </div>
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
