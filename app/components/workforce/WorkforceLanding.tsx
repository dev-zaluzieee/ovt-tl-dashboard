'use client';

import Link from 'next/link';
import { AppLayout } from '../layout/AppLayout';
import { NAV, SHARED_NAV } from '../navigation/Navigation';
import { WORKFORCE_LONG, type Workforce } from './WorkforceContext';

/**
 * Landing page of one workforce: its pages as tiles, grouped, plus the shared
 * settings (Týmy). This is what the OVT/MVT switch lands on.
 */
export function WorkforceLanding({ workforce }: { workforce: Workforce }) {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#1E8449]">{WORKFORCE_LONG[workforce]}</h1>
          <p className="mt-2 text-gray-600">Vyberte sekci.</p>
        </header>

        <div className="space-y-8">
          {NAV[workforce].map((g) => (
            <section key={g.label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{g.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {g.items.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1E8449] hover:shadow"
                  >
                    <p className="text-lg font-semibold text-gray-900">{t.label}</p>
                    <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Nastavení</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {SHARED_NAV.map((t) => (
                <Link key={t.href} href={t.href} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1E8449] hover:shadow">
                  <p className="text-lg font-semibold text-gray-900">{t.label}</p>
                  <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </AppLayout>
  );
}
