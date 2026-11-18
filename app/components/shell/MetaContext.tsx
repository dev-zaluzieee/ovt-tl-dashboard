'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Meta } from '@/lib/types';
import { tlGet } from '@/lib/tl-api';
import { parseMeta } from '@/lib/tl-parse';
import { useLoad } from '@/app/components/ui/useLoad';
import { Alert, LoadError, Skeleton, btnGhost } from '@/app/components/ui/kit';
import { TlApiError } from '@/lib/tl-errors';
import { pragueYmd } from '@/lib/format';
import { errorText } from '@/lib/tl-errors';

interface Ctx {
  meta: Meta | null;
}
const MetaCtx = createContext<Ctx>({ meta: null });

export function useMeta(): Ctx {
  return useContext(MetaCtx);
}

/**
 * Earliest day a date picker of a HISTORY page may offer (Prague date of the backend's `historyFrom`); null while the backend has no history
 * scope (then nothing is capped). Only the history pages (day views, Výsledky, Nedopadlo, Záchrany, Reklamace z montáží) use it.
 */
export function useHistoryMin(): string | null {
  const { meta } = useMeta();
  return meta?.historyFrom ? pragueYmd(meta.historyFrom) : null;
}

/** The vocabulary and "today" the backend owns, read once. Blocks the content when the account itself is refused. */
export function MetaProvider({ children }: { children: ReactNode }) {
  const { data, error, reload } = useLoad<Meta>('meta', async (signal) => parseMeta(await tlGet('meta', undefined, signal)));
  const fatal = error instanceof TlApiError && ['NO_ERP_USER', 'ERP_ACCOUNT_DISABLED', 'FORBIDDEN_ROLE', 'NOT_CONFIGURED', 'TOKEN_RENEW'].includes(error.code ?? '');

  if (!data) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-10">
        {error ? (
          fatal ? (
            <div className="space-y-3">
              <Alert tone="red">
                <p className="font-semibold">Dashboard nelze použít</p>
                <p className="mt-1">{errorText(error)}</p>
              </Alert>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a route handler that must be a full navigation */}
              <a href="/api/auth/sso-logout" className={btnGhost}>
                Odhlásit se
              </a>
            </div>
          ) : (
            <LoadError error={error} onRetry={reload} />
          )
        ) : (
          <Skeleton rows={3} />
        )}
      </main>
    );
  }
  return <MetaCtx.Provider value={{ meta: data }}>{children}</MetaCtx.Provider>;
}
