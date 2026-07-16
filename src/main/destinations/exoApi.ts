import type { ExoRegistration } from '@shared/types'

/** Every exo node serves its API and dashboard on this fixed port. */
const EXO_API_BASE = 'http://localhost:52415'
const LIST_TIMEOUT_MS = 3000
// POST /models/add makes exo fetch model metadata from Hugging Face, so allow more time.
const ADD_TIMEOUT_MS = 15000

interface ExoModelList {
  data?: Array<{ id?: string }>
}

/**
 * Make a completed download visible in exo. exo lists models from its card
 * registry (built-in + custom cards), not by scanning the models folder — an
 * arbitrary HF repo only appears after POST /models/add creates a card for it.
 * exo then finds the already-downloaded files and marks the model downloaded.
 */
export async function registerModelWithExo(repoId: string): Promise<ExoRegistration> {
  let listed: boolean
  try {
    const res = await fetch(`${EXO_API_BASE}/models`, {
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`GET /models -> ${res.status}`)
    const body = (await res.json()) as ExoModelList
    listed = (body.data ?? []).some((m) => m.id?.toLowerCase() === repoId.toLowerCase())
  } catch {
    return { status: 'exo-offline', message: null }
  }
  if (listed) return { status: 'already-listed', message: null }

  try {
    const res = await fetch(`${EXO_API_BASE}/models/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: repoId }),
      signal: AbortSignal.timeout(ADD_TIMEOUT_MS)
    })
    if (res.ok) return { status: 'registered', message: null }
    const detail = await res
      .json()
      .then((b) => (b as { detail?: string }).detail ?? null)
      .catch(() => null)
    return { status: 'failed', message: detail ?? `exo returned HTTP ${res.status}` }
  } catch {
    return { status: 'exo-offline', message: null }
  }
}
