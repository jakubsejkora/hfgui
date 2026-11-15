import { ArrowDownToLine, ExternalLink, KeyRound, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { comfortableModelBytes } from '@shared/fit'
import { formatBytes } from '@shared/format'
import type { DestinationKind } from '@shared/types'
import { openExternal } from '@/lib/actions'
import { useDestinations, useHfAccount, useSettings, useSystemInfo, useTokenStatus } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn, displayPath } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dot, StatusPill } from '@/components/app/badges'
import { Page, PageHeader } from '@/components/app/Page'

/*
 * The basics of running open models on a Mac, for people new to it. Written to
 * work without LM Studio or exo: they're two options among several, and only
 * marked when they're actually on this Mac.
 *
 * Copy rule shared with the rest of the app: no absolute paths as text (home is
 * shown as ~), and never the words the e2e drivers match on.
 */

/**
 * Bits per weight from llama.cpp's quantize reference (Llama 3 8B), rounded.
 * The example column is computed for a 30B model so the sizes feel real.
 */
const LADDER: Array<{ name: string; bits: number; quality: string; recommended?: boolean }> = [
  { name: 'Q8_0', bits: 8.5, quality: 'Practically the original' },
  { name: 'Q6_K', bits: 6.6, quality: 'Very hard to tell apart' },
  { name: 'Q5_K_M', bits: 5.7, quality: 'Very close' },
  { name: 'Q4_K_M', bits: 4.9, quality: 'The usual sweet spot', recommended: true },
  { name: 'Q3_K_M', bits: 4.0, quality: 'Noticeably weaker' },
  { name: 'Q2_K', bits: 3.2, quality: 'Only when nothing else fits' }
]
const EXAMPLE_PARAMS = 30e9

interface Runner {
  name: string
  kind?: DestinationKind
  about: string
  how: ReactNode
  url: string
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="selectable rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] whitespace-nowrap text-foreground">
    {children}
  </code>
)

const RUNNERS: Runner[] = [
  {
    name: 'LM Studio',
    kind: 'lmstudio',
    about: 'A chat app and local server for GGUF and MLX models.',
    how: 'Download to LM Studio in hfgui and the model shows up in its library after a relaunch.',
    url: 'https://lmstudio.ai'
  },
  {
    name: 'Ollama',
    about: 'Runs GGUF models from its app or the command line.',
    how: (
      <>
        Put <Code>FROM ./model.gguf</Code> in a file named Modelfile next to the model, then run{' '}
        <Code>ollama create my-model -f Modelfile</Code>.
      </>
    ),
    url: 'https://ollama.com'
  },
  {
    name: 'llama.cpp',
    about: 'The engine many of these apps are built on.',
    how: (
      <>
        <Code>llama-server -m model.gguf</Code> starts a local server that speaks the OpenAI API.
      </>
    ),
    url: 'https://github.com/ggml-org/llama.cpp'
  },
  {
    name: 'mlx-lm',
    about: 'Apple’s MLX framework, from Python.',
    how: (
      <>
        <Code>mlx_lm.chat --model &lt;model folder&gt;</Code> chats with an MLX model.
      </>
    ),
    url: 'https://github.com/ml-explore/mlx-lm'
  },
  {
    name: 'exo',
    kind: 'exo',
    about: 'Runs MLX models across several Macs as one.',
    how: 'Download to exo in hfgui and it loads the model once all of it has arrived.',
    url: 'https://github.com/exo-explore/exo'
  }
]

function GuideSection({
  id,
  title,
  description,
  children,
  className
}: {
  id: string
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card id={`guide-${id}`} className={cn('scroll-mt-6 gap-0 py-0 shadow-xs', className)}>
      <CardHeader className="border-b py-4 [.border-b]:pb-4">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="leading-relaxed">{description}</CardDescription>}
      </CardHeader>
      {children}
    </Card>
  )
}

function OnThisMac() {
  return <StatusPill tone="success">On this Mac</StatusPill>
}

function HowItWorks() {
  // A real sequence, so it is numbered.
  const steps = [
    {
      icon: Search,
      title: 'Find a model',
      body: 'Browse what’s popular, search, or paste a Hugging Face link anywhere in hfgui.'
    },
    {
      icon: SlidersHorizontal,
      title: 'Pick a size',
      body: 'Most models come in several sizes. hfgui marks the one that fits this Mac’s memory.'
    },
    {
      icon: ArrowDownToLine,
      title: 'Download',
      body: 'Files go where you run them. Big downloads pick up where they stopped.'
    }
  ]
  return (
    <GuideSection id="how" title="From the Hub to your Mac">
      <ol className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {steps.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-2 px-5 py-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              {step.title}
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </GuideSection>
  )
}

function Formats() {
  return (
    <GuideSection
      id="formats"
      title="GGUF or MLX?"
      description="The same model is usually published in both. Not sure? GGUF works almost everywhere."
    >
      <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="space-y-1.5 px-5 py-4">
          <div className="text-sm font-medium">GGUF</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Usually one file per size. Runs in llama.cpp and the apps built on it, like LM Studio, Ollama and Jan,
            on any Mac.
          </p>
        </div>
        <div className="space-y-1.5 px-5 py-4">
          <div className="text-sm font-medium">MLX</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A folder of weights for Apple’s MLX framework. Often the fastest choice on Apple silicon; runs in
            mlx-lm, LM Studio and exo.
          </p>
        </div>
      </div>
    </GuideSection>
  )
}

function Sizes() {
  const { data: system } = useSystemInfo()
  return (
    <GuideSection
      id="sizes"
      title="Which size fits?"
      description="Sizes are named after how many bits store each weight. Fewer bits make a smaller file and cost some quality."
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Size</TableHead>
            <TableHead className="text-right">Bits per weight</TableHead>
            <TableHead className="text-right">A 30B model</TableHead>
            <TableHead className="pr-5">Quality</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {LADDER.map((q) => (
            <TableRow key={q.name} className={cn(q.recommended && 'bg-muted/40 hover:bg-muted/60')}>
              <TableCell className="pl-5 font-mono text-[13px] font-semibold">{q.name}</TableCell>
              <TableCell className="text-right tabular-nums">{q.bits.toFixed(1)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBytes((EXAMPLE_PARAMS * q.bits) / 8)}
              </TableCell>
              <TableCell className="pr-5">
                <span className="flex items-center gap-2">
                  {q.recommended && <Dot tone="live" />}
                  {q.quality}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <CardContent className="space-y-2 border-t px-5 py-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          A model needs about its file size in memory, plus room for the conversation.
          {system && (
            <>
              {' '}
              This Mac has <span className="font-medium text-foreground">{formatBytes(system.totalMemoryBytes)}</span>
              , so models up to about{' '}
              <span className="font-medium text-foreground">
                {formatBytes(comfortableModelBytes(system.totalMemoryBytes))}
              </span>{' '}
              fit comfortably.
            </>
          )}
        </p>
        <p>MLX sizes follow the bits too: a 4-bit MLX model is about the size of Q4_K_M.</p>
      </CardContent>
    </GuideSection>
  )
}

function Location() {
  const { data: destinations } = useDestinations()
  const { data: settings } = useSettings()
  const { data: system } = useSystemInfo()
  const setView = useUiStore((s) => s.setView)
  const folder = settings?.customDir ?? system?.defaultModelsDir ?? null
  const apps = (destinations ?? []).filter((d) => d.kind !== 'custom' && d.path)

  return (
    <GuideSection
      id="location"
      title="Where your models go"
      description="Each download can go somewhere else; your default is in Settings."
    >
      <ul className="divide-y">
        <li className="flex flex-col gap-1 px-5 py-4">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            Your models folder
            {folder && <span className="font-mono text-xs font-normal text-muted-foreground">{displayPath(folder)}</span>}
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A plain folder with one subfolder per model, named publisher/model. Any app that opens model files can
            use it, and you can move them freely.
          </p>
        </li>
        {apps.map((app) => (
          <li key={app.kind} className="flex flex-col gap-1 px-5 py-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              {app.label} <OnThisMac />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {app.kind === 'lmstudio'
                ? 'hfgui can save straight into LM Studio’s library, laid out the way LM Studio expects.'
                : 'hfgui can save MLX models straight into exo, which loads them once complete.'}
            </p>
          </li>
        ))}
      </ul>
      <div className="border-t px-5 py-3">
        <Button variant="outline" size="sm" onClick={() => setView('settings')}>
          Change in Settings
        </Button>
      </div>
    </GuideSection>
  )
}

function Running() {
  const { data: destinations } = useDestinations()
  const installed = (kind?: DestinationKind): boolean =>
    !!kind && !!destinations?.some((d) => d.kind === kind && d.path)
  return (
    <GuideSection
      id="running"
      title="Running a model"
      description="hfgui downloads; another app runs the model. Any of these will do, and they’re all free."
    >
      <ul className="divide-y">
        {RUNNERS.map((r) => (
          <li key={r.name} className="flex items-start gap-4 px-5 py-4">
            <div className="min-w-0 flex-1 space-y-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {r.name} {installed(r.kind) && <OnThisMac />}
              </span>
              <p className="text-sm text-muted-foreground">{r.about}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{r.how}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground"
              aria-label={`${r.name} website`}
              onClick={() => openExternal(r.url)}
            >
              Website <ExternalLink />
            </Button>
          </li>
        ))}
      </ul>
    </GuideSection>
  )
}

function Gated() {
  const { data: tokenStatus } = useTokenStatus()
  const { data: account } = useHfAccount()
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)
  return (
    <GuideSection
      id="gated"
      title="Models that ask for a license"
      description="Some publishers, like Meta and Google, ask you to accept their license before you download."
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Accept it on the model’s page on huggingface.co, then add a free read token so hfgui can download for
          you. Everything else works without an account.
        </p>
        {tokenStatus?.isSet ? (
          <span className="text-sm text-muted-foreground">
            {account ? (
              <>
                Signed in as <span className="font-medium text-foreground">{account.name}</span>
              </>
            ) : (
              'Token added'
            )}
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={() => openTokenDialog(true)}>
            <KeyRound /> Add a token
          </Button>
        )}
      </CardContent>
    </GuideSection>
  )
}

function Space() {
  const setView = useUiStore((s) => s.setView)
  return (
    <GuideSection id="space" title="Disk space" description="Models are big; hfgui keeps track of what they take.">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          An unfinished download keeps what it has fetched so it can resume, and Downloads shows how much that is.
          Discard it to free the space. Settings → Storage finds data left behind by downloads you removed.
        </p>
        <Button variant="outline" size="sm" onClick={() => setView('downloads')}>
          Open Downloads
        </Button>
      </CardContent>
    </GuideSection>
  )
}

export function GuideView() {
  const section = useUiStore((s) => s.guideSection)

  // Arriving from a link to one topic (Overview, Settings): start there.
  useEffect(() => {
    if (!section) return
    document.getElementById(`guide-${section}`)?.scrollIntoView({ block: 'start' })
    useUiStore.setState({ guideSection: null })
  }, [section])

  return (
    <Page className="max-w-4xl">
      <PageHeader title="Guide" description="The basics of running open models on this Mac." />
      <HowItWorks />
      <Formats />
      <Sizes />
      <Location />
      <Running />
      <Gated />
      <Space />
    </Page>
  )
}
