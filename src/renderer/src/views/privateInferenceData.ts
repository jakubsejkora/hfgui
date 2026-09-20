export interface Suggestion {
  repoId: string
  reason: string
}

export interface ToolInfo {
  name: string
  /** Icon key resolved by the view — data stays JSX-free so tests can import it. */
  icon: 'keyboard' | 'mic' | 'table'
  tagline: string
  /** What the product is, in one line. */
  about: string
  modelNeeds: string
  /** Public site; rendered as a link once the tool launches. */
  url: string | null
  suggestions: Suggestion[]
}

export const TOOLS: ToolInfo[] = [
  {
    name: 'offtype',
    icon: 'keyboard',
    tagline: 'Private dictation',
    about:
      'Local dictation everywhere you type — a Wisprflow alternative that also works from your iPhone and Apple Watch.',
    modelNeeds:
      'Pairs a fast speech-to-text model with a small instruct model that cleans up what you said — dictation is transcribed, then polished, so latency beats raw quality.',
    url: null,
    suggestions: [
      {
        repoId: 'mlx-community/parakeet-tdt-0.6b-v2',
        reason: 'The dictation engine — tiny and much faster than real-time for English speech.'
      },
      {
        repoId: 'Qwen/Qwen3-4B-GGUF',
        reason: 'Cleans up and rewrites dictated text — best quality-per-token at this size.'
      },
      {
        repoId: 'mlx-community/Qwen3-4B-4bit',
        reason: 'Same model for MLX — fastest option on Apple silicon.'
      },
      {
        repoId: 'lmstudio-community/gemma-3-4b-it-GGUF',
        reason: 'Strong multilingual writing in a compact model.'
      }
    ]
  },
  {
    name: 'offrecord',
    icon: 'mic',
    tagline: 'Private meeting recorder',
    about:
      'Records and transcribes meetings from your iPhone or Apple Watch — no extra hardware, everything stays on-device.',
    modelNeeds:
      'Needs a speech-to-text model — larger ones transcribe more accurately, turbo/distilled variants keep up with live audio — plus a small instruct model for summaries.',
    url: null,
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
        repoId: 'lmstudio-community/gemma-3-4b-it-GGUF',
        reason: 'Turns transcripts into clean summaries and action items.'
      }
    ]
  },
  {
    name: 'offtable',
    icon: 'table',
    tagline: 'Local LLM arena',
    about:
      'Runs your prompts across several local models — side by side or in sequence — and compares the answers.',
    modelNeeds:
      'Wants a diverse roster at comparable sizes — different model families answer differently, and that contrast is the point. A few 7–8Bs, plus a 14B if you have the RAM.',
    url: null,
    suggestions: [
      {
        repoId: 'Qwen/Qwen3-8B-GGUF',
        reason: 'Strong reasoning with a thinking mode — one pole of the comparison.'
      },
      {
        repoId: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
        reason: 'The Llama family’s take — different training, different answers.'
      },
      {
        repoId: 'lmstudio-community/gemma-3-12b-it-GGUF',
        reason: 'Google’s Gemma for a third voice in the panel.'
      },
      {
        repoId: 'Qwen/Qwen3-14B-GGUF',
        reason: 'A step up in accuracy when you have the RAM for a stronger contender.'
      }
    ]
  }
]
