/*
 * hfgui's recommended models: Discover's "Our picks", one ladder per category,
 * from the smallest Mac to the biggest. Curated by hand and kept small.
 *
 * To suggest a change, open a pull request against this file. A good pick:
 * - comes from the model's maker or a well-known converter (lmstudio-community,
 *   ggml-org, unsloth, bartowski, mlx-community), and isn't gated;
 * - runs comfortably on a Mac with `minMemoryGB` of memory: its usual download
 *   (GGUF Q4_K_M, or MLX 4-bit) is at most 70% of that, so the system, the
 *   context and other apps still fit;
 * - comes with a `why` a newcomer understands — what it's good at, not a benchmark.
 *
 * picks.test.ts checks the shape; `HFGUI_NETWORK_TESTS=1 npm test` also checks
 * every repo on the Hub (exists, not gated, fits its tier).
 */

export type CategoryId = 'chat' | 'coding' | 'vision' | 'speech' | 'embeddings'

export interface Pick {
  /** As people say it: "Qwen3.8 27B". */
  name: string
  /** Who made the model — not who converted it. */
  maker: string
  /** The smallest Mac memory, in GB, this is the pick for. */
  minMemoryGB: number
  /** For llama.cpp, LM Studio, Ollama — runs everywhere. */
  gguf?: string
  /** For MLX on Apple silicon: LM Studio, mlx-lm, exo. */
  mlx?: string
  /** Why this one, in a sentence or two. */
  why: string
}

/** Discover's live "Popular now" list for a category. */
export interface PopularQuery {
  /** The Hub's pipeline_tag to ask for; null asks for every task. */
  pipelineTag: string | null
  /** The Hub's name search. */
  search?: string
  /** Pipelines to keep (null: repos without one, common for GGUF). */
  pipelines: Array<string | null>
  /** Keep only names matching this… */
  nameMatches?: RegExp
  /** …and drop names matching this. */
  nameExcludes?: RegExp
}

export interface Category {
  id: CategoryId
  title: string
  blurb: string
  /** Where these run, or what else to download. */
  note?: string
  /** null: picks only — the live lists for this task aren't worth showing. */
  popular: PopularQuery | null
  /** Browse's task filter, or a name search, for "Browse more". */
  browse: { task: string; search?: string }
  /** Smallest tier first; within a tier, the first is the one to show. */
  picks: Pick[]
}

const CODE_NAMES = /coder|codestral|devstral|codegemma|starcoder|[-_]code([-_.]|$)/i
const LLM_PIPELINES = ['text-generation', 'image-text-to-text', 'any-to-any', null]

export const CATEGORIES: Category[] = [
  {
    id: 'chat',
    title: 'Chat & writing',
    blurb: 'An assistant for writing, questions, summaries and ideas. The place to start.',
    popular: { pipelineTag: null, pipelines: LLM_PIPELINES, nameExcludes: CODE_NAMES },
    browse: { task: 'all' },
    picks: [
      {
        name: 'Qwen3.5 4B',
        maker: 'Qwen',
        minMemoryGB: 8,
        gguf: 'lmstudio-community/Qwen3.5-4B-GGUF',
        mlx: 'lmstudio-community/Qwen3.5-4B-MLX-4bit',
        why: 'Small and quick, and still good at writing and following instructions. Leaves room for your other apps.'
      },
      {
        name: 'Gemma 4 E2B',
        maker: 'Google',
        minMemoryGB: 8,
        gguf: 'lmstudio-community/gemma-4-E2B-it-GGUF',
        mlx: 'lmstudio-community/gemma-4-E2B-it-MLX-4bit',
        why: 'Google’s smallest Gemma 4: fast, at home in many languages, and it can look at images too.'
      },
      {
        name: 'Qwen3.5 9B',
        maker: 'Qwen',
        minMemoryGB: 16,
        gguf: 'lmstudio-community/Qwen3.5-9B-GGUF',
        mlx: 'lmstudio-community/Qwen3.5-9B-MLX-4bit',
        why: 'The sweet spot for 16 GB: clearly smarter than the small models, and still quick.'
      },
      {
        name: 'Gemma 4 12B',
        maker: 'Google',
        minMemoryGB: 16,
        gguf: 'lmstudio-community/gemma-4-12B-it-QAT-GGUF',
        mlx: 'lmstudio-community/gemma-4-12B-it-MLX-4bit',
        why: 'A second opinion from Google, trained to stay sharp when shrunk to 4-bit. Strong in many languages.'
      },
      {
        name: 'Gemma 4 26B A4B',
        maker: 'Google',
        minMemoryGB: 24,
        gguf: 'ggml-org/gemma-4-26B-A4B-it-GGUF',
        mlx: 'lmstudio-community/gemma-4-26B-A4B-it-QAT-MLX-4bit',
        why: 'Knows as much as a 26B model, but only about 4B of it works on each word — so it answers fast.'
      },
      {
        name: 'gpt-oss 20B',
        maker: 'OpenAI',
        minMemoryGB: 24,
        gguf: 'lmstudio-community/gpt-oss-20b-GGUF',
        mlx: 'mlx-community/gpt-oss-20b-MXFP4-Q8',
        why: 'OpenAI’s open model, built for reasoning step by step and for using tools.'
      },
      {
        name: 'Qwen3.8 27B',
        maker: 'Qwen',
        minMemoryGB: 32,
        gguf: 'lmstudio-community/Qwen3.8-27B-GGUF',
        mlx: 'lmstudio-community/Qwen3.8-27B-MLX-4bit',
        why: 'One of the most downloaded open models right now, and the strongest all-rounder for a 32 GB Mac. Reads images too.'
      },
      {
        name: 'Qwen3.6 35B A3B',
        maker: 'Qwen',
        minMemoryGB: 32,
        gguf: 'lmstudio-community/Qwen3.6-35B-A3B-GGUF',
        mlx: 'lmstudio-community/Qwen3.6-35B-A3B-MLX-4bit',
        why: 'Faster than the 27B on the same Mac: only about 3B of its 35B parameters work on each word.'
      },
      {
        name: 'gpt-oss 120B',
        maker: 'OpenAI',
        minMemoryGB: 96,
        gguf: 'lmstudio-community/gpt-oss-120b-GGUF',
        mlx: 'mlx-community/gpt-oss-120b-MXFP4-Q8',
        why: 'OpenAI’s large open model. It needs a big Mac, but runs fast for its size: about 5B of its 117B parameters work on each word.'
      }
    ]
  },
  {
    id: 'coding',
    title: 'Coding',
    blurb: 'Writes, explains and fixes code — in your editor, or as a coding agent.',
    popular: { pipelineTag: null, search: 'cod', pipelines: LLM_PIPELINES, nameMatches: CODE_NAMES },
    browse: { task: 'all', search: 'coder' },
    picks: [
      {
        name: 'Qwen3.5 4B',
        maker: 'Qwen',
        minMemoryGB: 8,
        gguf: 'lmstudio-community/Qwen3.5-4B-GGUF',
        mlx: 'lmstudio-community/Qwen3.5-4B-MLX-4bit',
        why: 'Good for quick questions and small fixes. Bigger coding jobs want a Mac with more memory.'
      },
      {
        name: 'Qwen3.5 9B',
        maker: 'Qwen',
        minMemoryGB: 16,
        gguf: 'lmstudio-community/Qwen3.5-9B-GGUF',
        mlx: 'lmstudio-community/Qwen3.5-9B-MLX-4bit',
        why: 'A general model that’s solid at code, and newer than any small model made only for coding.'
      },
      {
        name: 'Devstral Small 2 24B',
        maker: 'Mistral',
        minMemoryGB: 24,
        gguf: 'lmstudio-community/Devstral-Small-2-24B-Instruct-2512-GGUF',
        mlx: 'mlx-community/Devstral-Small-2-24B-Instruct-2512-4bit',
        why: 'Mistral’s model for coding agents: it explores a codebase, edits files and runs tools.'
      },
      {
        name: 'Qwen3-Coder 30B A3B',
        maker: 'Qwen',
        minMemoryGB: 32,
        gguf: 'lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-GGUF',
        mlx: 'lmstudio-community/Qwen3-Coder-30B-A3B-Instruct-MLX-4bit',
        why: 'One of the most used local coding models. Fast — about 3B of its 30B parameters work on each word — and made for agents.'
      },
      {
        name: 'Qwen3-Coder-Next',
        maker: 'Qwen',
        minMemoryGB: 96,
        gguf: 'lmstudio-community/Qwen3-Coder-Next-GGUF',
        mlx: 'lmstudio-community/Qwen3-Coder-Next-MLX-4bit',
        why: 'Qwen’s newest and strongest coding model, for Macs with plenty of memory.'
      }
    ]
  },
  {
    id: 'vision',
    title: 'Vision',
    blurb: 'Describes photos, reads screenshots and charts, and pulls the text out of documents.',
    note: 'In GGUF, seeing is a separate file: download the model and its mmproj file — both are on the model’s page.',
    popular: { pipelineTag: 'image-text-to-text', pipelines: ['image-text-to-text', 'any-to-any'] },
    browse: { task: 'image-text-to-text' },
    picks: [
      {
        name: 'Gemma 4 E2B',
        maker: 'Google',
        minMemoryGB: 8,
        gguf: 'lmstudio-community/gemma-4-E2B-it-GGUF',
        mlx: 'lmstudio-community/gemma-4-E2B-it-MLX-4bit',
        why: 'Looks at photos and screenshots and answers questions about them, even on an 8 GB Mac.'
      },
      {
        name: 'GLM-OCR',
        maker: 'Z.ai',
        minMemoryGB: 8,
        gguf: 'ggml-org/GLM-OCR-GGUF',
        mlx: 'mlx-community/GLM-OCR-bf16',
        why: 'A small specialist for reading: scans, PDFs and screenshots into clean text.'
      },
      {
        name: 'Gemma 4 E4B',
        maker: 'Google',
        minMemoryGB: 16,
        gguf: 'lmstudio-community/gemma-4-E4B-it-GGUF',
        mlx: 'lmstudio-community/gemma-4-E4B-it-MLX-4bit',
        why: 'Google’s compact multimodal Gemma: at home with photos and screenshots, and one of the most downloaded models for Macs.'
      },
      {
        name: 'Qwen3.5 9B',
        maker: 'Qwen',
        minMemoryGB: 16,
        gguf: 'lmstudio-community/Qwen3.5-9B-GGUF',
        mlx: 'lmstudio-community/Qwen3.5-9B-MLX-4bit',
        why: 'Understands photos, screenshots and charts well for its size, and talks about them clearly.'
      },
      {
        name: 'Gemma 4 26B A4B',
        maker: 'Google',
        minMemoryGB: 24,
        gguf: 'ggml-org/gemma-4-26B-A4B-it-GGUF',
        mlx: 'lmstudio-community/gemma-4-26B-A4B-it-QAT-MLX-4bit',
        why: 'Sharp with images and fast, because only about 4B of its 26B parameters work on each word.'
      },
      {
        name: 'Qwen3.8 27B',
        maker: 'Qwen',
        minMemoryGB: 32,
        gguf: 'lmstudio-community/Qwen3.8-27B-GGUF',
        mlx: 'lmstudio-community/Qwen3.8-27B-MLX-4bit',
        why: 'The strongest vision model that runs well on a 32 GB Mac.'
      }
    ]
  },
  {
    id: 'speech',
    title: 'Speech to text',
    blurb: 'Turns recordings and dictation into text, without uploading the audio anywhere.',
    note: 'These run in transcription tools: mlx-whisper and parakeet-mlx for MLX, llama.cpp for GGUF (with the model’s mmproj file).',
    popular: null,
    browse: { task: 'automatic-speech-recognition' },
    picks: [
      {
        name: 'Whisper large v3 turbo',
        maker: 'OpenAI',
        minMemoryGB: 8,
        mlx: 'mlx-community/whisper-large-v3-turbo',
        why: 'The standard: accurate in nearly 100 languages, and the turbo version is quick.'
      },
      {
        name: 'Parakeet TDT 0.6B v3',
        maker: 'NVIDIA',
        minMemoryGB: 8,
        mlx: 'mlx-community/parakeet-tdt-0.6b-v3',
        why: 'Much faster than Whisper, with punctuation and timestamps, in 25 European languages.'
      },
      {
        name: 'Qwen3-ASR 1.7B',
        maker: 'Qwen',
        minMemoryGB: 8,
        gguf: 'ggml-org/Qwen3-ASR-1.7B-GGUF',
        mlx: 'mlx-community/Qwen3-ASR-1.7B-8bit',
        why: 'Qwen’s speech recognizer: a newer alternative to Whisper, and the one here that also comes as GGUF.'
      }
    ]
  },
  {
    id: 'embeddings',
    title: 'Embeddings',
    blurb: 'Turn text into numbers that capture meaning, so local search and RAG find the right notes and documents.',
    note: 'LM Studio and llama.cpp can serve these alongside a chat model.',
    popular: null,
    browse: { task: 'feature-extraction' },
    picks: [
      {
        name: 'EmbeddingGemma 2',
        maker: 'Google',
        minMemoryGB: 8,
        gguf: 'ggml-org/embeddinggemma-2-GGUF',
        mlx: 'mlx-community/embeddinggemma-2-8bit',
        why: 'Small, fast and multilingual: a good default for searching your own documents.'
      },
      {
        name: 'Qwen3 Embedding 0.6B',
        maker: 'Qwen',
        minMemoryGB: 8,
        gguf: 'Qwen/Qwen3-Embedding-0.6B-GGUF',
        mlx: 'mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ',
        why: 'Tiny and widely supported, and strong for its size in over 100 languages.'
      },
      {
        name: 'Qwen3 Embedding 8B',
        maker: 'Qwen',
        minMemoryGB: 16,
        gguf: 'Qwen/Qwen3-Embedding-8B-GGUF',
        mlx: 'mlx-community/Qwen3-Embedding-8B-4bit-DWQ',
        why: 'Among the best at finding the right passage, when accuracy matters more than speed.'
      }
    ]
  }
]
