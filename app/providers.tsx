'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * React Query provider. The `QueryClient` is created inside the component via
 * `useState` so each browser session (and each SSR request) gets its own
 * instance — sharing a single client across requests on the server would leak
 * cache between users.
 *
 * This is a client component wrapping the server-rendered tree; it must not
 * import server-only code. It renders during SSR as a passthrough provider.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Avoid refetch-on-focus churn for admin tooling.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}