import { QueryClient } from '@tanstack/react-query';

function isGatewayOrNetworkError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return /502|503|504|bad gateway|service unavailable|gateway timeout|failed to fetch|network|load failed|cors/i.test(msg);
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (isGatewayOrNetworkError(error)) return failureCount < 1;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 6_000),
      },
    },
  });
}
