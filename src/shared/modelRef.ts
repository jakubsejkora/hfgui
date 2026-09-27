/**
 * Parsing Hugging Face model references that a user can paste: full Hub URLs,
 * scheme-less URLs, and bare `namespace/name` repo ids.
 *
 * Pure and dependency-free so both processes can use it — `main/pathSafety.ts`
 * re-exports `isValidRepoId` from here so the charset has exactly one definition.
 */

/** Matches HF's namespace/name charset; excludes `.`/`..`, empty, and leading dots. */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** HF repo ids are exactly "namespace/name". */
export function isValidRepoId(repoId: string): boolean {
  const segments = repoId.split('/')
  return segments.length === 2 && segments.every((s) => SEGMENT_RE.test(s))
}

export interface ModelRef {
  repoId: string
  /** Branch/tag/sha from a /tree/, /blob/ or /resolve/ URL, else null. */
  revision: string | null
  /** Repo-relative file path from a /blob/ or /resolve/ URL, else null. */
  filePath: string | null
  /** True when the input was a Hub URL rather than a bare repo id. */
  fromUrl: boolean
}

const HOSTS = new Set(['huggingface.co', 'www.huggingface.co', 'hf.co', 'www.hf.co'])

/**
 * First path segments that are Hub routes rather than a model namespace.
 * `models` is handled separately — it is a valid prefix for a model URL.
 */
const NON_MODEL_ROUTES = new Set([
  'datasets',
  'spaces',
  'collections',
  'organizations',
  'settings',
  'docs',
  'blog',
  'posts',
  'papers',
  'pricing',
  'join',
  'login',
  'logout',
  'notifications',
  'new',
  'search',
  'chat',
  'learn',
  'tasks'
])

/** Subroutes that carry a revision, and whether a file path follows it. */
const REVISION_ROUTES: Record<string, { hasFile: boolean }> = {
  tree: { hasFile: false },
  blob: { hasFile: true },
  resolve: { hasFile: true },
  raw: { hasFile: true }
}

function stripQueryAndHash(s: string): string {
  const cut = s.search(/[?#]/)
  return cut === -1 ? s : s.slice(0, cut)
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Parse anything a user might paste into a model reference, or null when the
 * input is not a Hub model (a search phrase, a dataset URL, another host…).
 */
export function parseModelRef(input: string): ModelRef | null {
  const trimmed = input.trim()
  // Long inputs are prose, not links; also bounds the work done on every keystroke.
  if (!trimmed || trimmed.length > 300) return null

  let rest = stripQueryAndHash(trimmed)
  let fromUrl = false

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest)
  if (schemeMatch) {
    // Only http(s) — a file:// or javascript: URL is never a model reference.
    if (!/^https?$/i.test(schemeMatch[1])) return null
    rest = rest.slice(schemeMatch[0].length)
    const slash = rest.indexOf('/')
    const host = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase()
    if (!HOSTS.has(host)) return null
    rest = slash === -1 ? '' : rest.slice(slash + 1)
    fromUrl = true
  } else {
    // Scheme-less URLs like "huggingface.co/org/model" or "hf.co/org/model".
    const slash = rest.indexOf('/')
    const first = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase()
    if (HOSTS.has(first)) {
      rest = slash === -1 ? '' : rest.slice(slash + 1)
      fromUrl = true
    }
  }

  const segments = rest.split('/').filter(Boolean)
  if (segments.length === 0) return null

  // huggingface.co/models/org/model is the same page as huggingface.co/org/model.
  if (fromUrl && segments[0].toLowerCase() === 'models') segments.shift()

  if (NON_MODEL_ROUTES.has(segments[0].toLowerCase())) return null
  if (segments.length < 2) return null

  const repoId = `${segments[0]}/${segments[1]}`
  if (!isValidRepoId(repoId)) return null

  // A bare id must be exactly "namespace/name" — "a/b/c" typed by hand is not a ref.
  if (!fromUrl) {
    return segments.length === 2 ? { repoId, revision: null, filePath: null, fromUrl } : null
  }

  const route = segments[2]?.toLowerCase()
  const spec = route ? REVISION_ROUTES[route] : undefined
  if (!spec) return { repoId, revision: null, filePath: null, fromUrl }

  const revision = segments[3] ? decode(segments[3]) : null
  const tail = segments.slice(4).map(decode).join('/')
  return {
    repoId,
    revision,
    filePath: spec.hasFile && tail ? tail : null,
    fromUrl
  }
}

/**
 * `text/uri-list` payloads (RFC 2483): CRLF-separated, `#` lines are comments.
 * Returns the first line that parses as a model reference.
 */
export function parseUriList(text: string): ModelRef | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const ref = parseModelRef(trimmed)
    if (ref) return ref
  }
  return null
}
