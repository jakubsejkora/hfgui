import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { defaultDestination } from '@shared/destinationRules'
import type { DestinationInfo, ModelFormat, Settings } from '@shared/types'
import { selectBusyCount, useDownloadsStore } from './downloadsStore'
import { getModel, getModelSummary, getModelTree, searchModels, type SearchQuery } from './hfApi'
import { usePrefs } from './prefsStore'
import { toast } from './toastStore'

export function useModelSearch(query: SearchQuery) {
  return useInfiniteQuery({
    queryKey: ['models', query],
    queryFn: ({ pageParam }) => searchModels(query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextUrl,
    placeholderData: keepPreviousData,
    staleTime: 60_000
  })
}

/** Browse's default listing, shared with the Overview so both read one cache entry. */
export function useBrowseQuery(search = '') {
  const { sort, format, task } = usePrefs()
  return useModelSearch({
    search,
    sort,
    format,
    pipelineTag: task === 'all' ? null : task
  })
}

export function useModelSummary(repoId: string) {
  return useQuery({
    queryKey: ['model-summary', repoId],
    queryFn: () => getModelSummary(repoId),
    staleTime: 5 * 60_000
  })
}

export function useModel(repoId: string | null) {
  return useQuery({
    queryKey: ['model', repoId],
    queryFn: () => getModel(repoId!),
    enabled: !!repoId,
    staleTime: 5 * 60_000
  })
}

export function useModelTree(repoId: string | null, revision: string | null) {
  return useQuery({
    queryKey: ['tree', repoId, revision],
    queryFn: () => getModelTree(repoId!, revision!),
    enabled: !!repoId && !!revision,
    staleTime: 5 * 60_000
  })
}

export function useSystemInfo() {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: () => window.hfgui.getSystemInfo(),
    staleTime: Infinity
  })
}

export function useDestinations() {
  return useQuery({
    queryKey: ['destinations'],
    queryFn: () => window.hfgui.getDestinations(),
    // Re-detect when the user returns after installing LM Studio/exo,
    // so the "Not installed" option lights up without a restart.
    refetchOnWindowFocus: true,
    staleTime: 10_000
  })
}

/**
 * Free space where downloads land. Refreshes every 15 s while anything is
 * downloading — the figure used to be read once per session and stayed put
 * through a 40 GB download.
 */
/** Where a download of this format goes unless the user picks: their default, then hfgui's order. */
export function useDefaultDestination(format: ModelFormat): DestinationInfo | null {
  const { data: destinations } = useDestinations()
  const { data: settings } = useSettings()
  if (!destinations || !settings) return null
  return defaultDestination(format, destinations, settings.preferredDestination)
}

/** Newer versions of finished downloads, by job id. Main asks the Hub; an 'updates' event refreshes this. */
export function useUpdates() {
  return useQuery({
    queryKey: ['updates'],
    queryFn: () => window.hfgui.getUpdates(),
    staleTime: Infinity
  })
}

export function useDiskSpace(path: string | null | undefined) {
  const busy = useDownloadsStore((s) => selectBusyCount(s) > 0)
  return useQuery({
    queryKey: ['disk-space', path],
    queryFn: () => window.hfgui.checkDiskSpace(path!),
    enabled: !!path,
    staleTime: 10_000,
    refetchInterval: busy ? 15_000 : false,
    refetchOnWindowFocus: true,
    retry: false
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => window.hfgui.getSettings(),
    staleTime: 10_000
  })
}

/**
 * Settings writes, applied optimistically so switches and selects respond on
 * the click, then reconciled with what main actually saved (it normalizes).
 * A failed write rolls back and says so instead of failing silently.
 */
export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => window.hfgui.setSettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['settings'] })
      const previous = qc.getQueryData<Settings>(['settings'])
      if (previous) qc.setQueryData<Settings>(['settings'], { ...previous, ...patch })
      return { previous }
    },
    onError: (error, _patch, context) => {
      if (context?.previous) qc.setQueryData(['settings'], context.previous)
      toast('error', `Couldn’t save that setting — ${(error as Error).message}`)
    },
    onSuccess: (saved, patch) => {
      qc.setQueryData(['settings'], saved)
      // Folder overrides change where downloads land.
      if ('lmstudioDir' in patch || 'exoDir' in patch || 'customDir' in patch) {
        void qc.invalidateQueries({ queryKey: ['destinations'] })
      }
    }
  })
}

/**
 * Where downloads use disk space: what unfinished downloads hold, leftovers to
 * clean up, and finished models whose files went missing. App.tsx refreshes it
 * whenever a download changes state.
 */
export function useStorageReport() {
  return useQuery({
    queryKey: ['storage-report'],
    queryFn: () => window.hfgui.getStorageReport(),
    staleTime: 5_000,
    refetchOnWindowFocus: true
  })
}

export function useTokenStatus() {
  return useQuery({
    queryKey: ['token-status'],
    queryFn: () => window.hfgui.getHfTokenStatus(),
    staleTime: 10_000
  })
}

export interface HfAccount {
  name: string
  fullname: string | null
  avatarUrl: string | null
}

/**
 * Who the stored token belongs to. The renderer never sees the token: main
 * attaches it to huggingface.co/api/* at the network layer (see
 * patchHuggingFaceSession in src/main/index.ts). Null when no token is set or
 * the Hub rejects it.
 */
export function useHfAccount() {
  const { data: tokenStatus } = useTokenStatus()
  return useQuery({
    queryKey: ['hf-account', tokenStatus?.masked ?? null],
    enabled: !!tokenStatus?.isSet,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<HfAccount | null> => {
      const res = await fetch('https://huggingface.co/api/whoami-v2')
      if (res.status === 401 || res.status === 403) return null
      if (!res.ok) throw new Error(`Hugging Face answered HTTP ${res.status}`)
      const body = (await res.json()) as { name?: string; fullname?: string; avatarUrl?: string }
      if (!body.name) return null
      const avatar = body.avatarUrl ?? null
      return {
        name: body.name,
        fullname: body.fullname ?? null,
        avatarUrl: avatar && avatar.startsWith('/') ? `https://huggingface.co${avatar}` : avatar
      }
    }
  })
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (keys: string[]) => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: [key] })
  }
}
