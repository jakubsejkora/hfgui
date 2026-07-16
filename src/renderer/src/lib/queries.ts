import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { getModel, getModelTree, searchModels, type SearchQuery } from './hfApi'

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
    staleTime: 30_000
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => window.hfgui.getSettings(),
    staleTime: 10_000
  })
}

export function useTokenStatus() {
  return useQuery({
    queryKey: ['token-status'],
    queryFn: () => window.hfgui.getHfTokenStatus(),
    staleTime: 10_000
  })
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (keys: string[]) => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: [key] })
  }
}
