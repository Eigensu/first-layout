import { QueryClient } from '@tanstack/react-query';

// Shared instance so code outside the component tree (e.g. the auth store's
// logout action) can clear cached data without needing a hook.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
