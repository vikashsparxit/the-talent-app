import { QueryClient } from '@tanstack/react-query';

function isGatewayOrNetworkError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return /502|503|504|bad gateway|service unavailable|gateway timeout|failed to fetch|network|load failed|cors/i.test(msg);
}

/** Missing table/RPC/object — retrying will never succeed until a migration is applied. */
export function isSupabaseNotFoundError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; status?: number; statusCode?: string | number };
  const code = e?.code ?? '';
  const msg = String(e?.message ?? error ?? '').toLowerCase();
  const status = Number(e?.status ?? e?.statusCode ?? NaN);
  return (
    status === 404
    || code === 'PGRST205'
    || code === 'PGRST202'
    || code === '42883'
    || /could not find the table|could not find the function|relation .* does not exist|function .* does not exist/i.test(msg)
  );
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isSupabaseNotFoundError(error)) return false;
          if (failureCount >= 2) return false;
          if (isGatewayOrNetworkError(error)) return failureCount < 1;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 6_000),
      },
    },
  });
}
