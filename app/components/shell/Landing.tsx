'use client';

import Link from 'next/link';
import { NAV, type Side } from './nav';
import { PageHeader } from '@/app/components/ui/kit';

const TITLE: Record<Side, string> = { ovt: 'Obchodníci (OVT)', mvt: 'Montéři (MVT)' };

/** Landing page of the OVT side (the MVT side lands on its Přehled): the pages as tiles. */
export function Landing({ side }: { side: Side }) {
  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <PageHeader title={TITLE[side]} subtitle="Vyberte sekci." />
      <div className="space-y-8">
        {NAV[side].map((g) => (
          <section key={g.label}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{g.label}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {g.items.map((t) => (
                <Link key={t.href} href={t.href} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1E8449] hover:shadow">
                  <p className="text-lg font-semibold text-gray-900">{t.label}</p>
                  <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
