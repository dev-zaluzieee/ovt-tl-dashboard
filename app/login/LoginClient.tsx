'use client';

import { useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';

/**
 * Login screen. There is no password form: sign-in goes through the Demaxia SSO, which starts by itself. After an
 * error the screen stays put with a retry button, otherwise a denied user would loop between SSO and this page.
 */
export default function LoginClient({ callbackUrl, error }: { callbackUrl: string; error: string | null }) {
  const started = useRef(false);

  useEffect(() => {
    if (error || started.current) return;
    started.current = true;
    void signIn('demaxia', { callbackUrl });
  }, [error, callbackUrl]);

  const denied = error === 'OAuthCallback' || error === 'AccessDenied';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Portál vedoucích týmů</h1>
        <p className="mt-2 text-sm text-zinc-500">OVT a MVT. Přihlášení přes firemní účet (Demaxia).</p>
      </div>
      {error ? (
        <div className="w-full max-w-xs space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {denied
              ? 'K dashboardu nemáte přístup. Pokud si myslíte, že ano, kontaktujte kancelář.'
              : 'Přihlášení se nezdařilo.'}
          </div>
          <button
            type="button"
            onClick={() => void signIn('demaxia', { callbackUrl })}
            className="w-full rounded-xl bg-[#1E8449] px-4 py-4 text-base font-semibold text-white hover:bg-[#166d3b]"
          >
            Přihlásit se znovu
          </button>
          <button
            type="button"
            onClick={() => {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- route handler, full navigation
              window.location.assign('/api/auth/sso-logout');
            }}
            className="w-full text-sm text-zinc-600 hover:underline"
          >
            Zkusit jiný účet
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Přesměrování na přihlášení…</p>
      )}
    </div>
  );
}
