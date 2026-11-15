export interface Suggestion {
  repoId: string
  reason: string
}

/**
 * A job that should stay on the Mac, and the models for it. The page talks
 * about the job; an app made for it is named only once it's out (`url` set) —
 * until then it would be a product nobody can get.
 */
export interface UseCase {
  id: 'dictation' | 'meetings' | 'arena'
  title: string
  /** Icon key resolved by the view — data stays JSX-free so tests can import it. */
  icon: 'keyboard' | 'mic' | 'table'
  /** The job itself, with no particular app in mind. */
  about: string
  modelNeeds: string
  suggestions: Suggestion[]
  app: {
    name: string
    tagline: string
    /** What the product is, in one line. */
    about: string
    /** Public site. While null, the app stays unnamed on the page. */
    url: string | null
  }
}

/** The app made for a use case, once it has launched. */
export function launchedApp(useCase: UseCase): UseCase['app'] | null {
  return useCase.app.url ? useCase.app : null
}

export const USE_CASES: UseCase[] = [
  {
    id: 'dictation',
    title: 'Private dictation',
    icon: 'keyboard',
    about:
      'Talk instead of typing, anywhere — with the transcription and the clean-up both running on this Mac, so nothing you say leaves it.',
    app: {
      name: 'offtype',
      tagline: 'Private dictation',
      about:
        'Local dictation everywhere you type — a Wisprflow alternative that also works from your iPhone and Apple Watch.',
      url: null
    },
    modelNeeds:
      'Pairs a fast speech-to-text model with a small instruct model that cleans up what you said — dictation is transcribed, then polished, so latency beats raw quality.',
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
    id: 'meetings',
    title: 'Meeting notes',
    icon: 'mic',
    about: 'Record meetings and get transcripts and summaries, without sending the audio to anyone’s servers.',
    app: {
      name: 'offrecord',
      tagline: 'Private meeting recorder',
      about:
        'Records and transcribes meetings from your iPhone or Apple Watch — no extra hardware, everything stays on-device.',
      url: null
    },
    modelNeeds:
      'Needs a speech-to-text model — larger ones transcribe more accurately, turbo/distilled variants keep up with live audio — plus a small instruct model for summaries.',
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
    id: 'arena',
    title: 'Model arena',
    icon: 'table',
    about: 'Ask several local models the same thing and compare their answers side by side.',
    app: {
      name: 'offtable',
      tagline: 'Local LLM arena',
      about:
        'Runs your prompts across several local models — side by side or in sequence — and compares the answers.',
      url: null
    },
    modelNeeds:
      'Wants a diverse roster at comparable sizes — different model families answer differently, and that contrast is the point. A few 7–8Bs, plus a 14B if you have the RAM.',
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
