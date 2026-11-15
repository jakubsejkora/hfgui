import { QueryClient } from '@tanstack/react-query'

/** The app's one query cache — importable by plain action helpers that need to refresh it. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000
    }
  }
})
