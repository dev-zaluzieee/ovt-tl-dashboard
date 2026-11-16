'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { tlGet } from '@/lib/tl-api';
import { parseOverview } from '@/lib/tl-parse';
import type { MvtOverview } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { Chip, LoadError, PageHeader, Skeleton, StateChip } from '@/app/components/ui/kit';
import { NAV } from '@/app/components/shell/nav';
import { useLoad } from '@/app/components/ui/useLoad';
import { CLAIM_STATE_TONE } from './MvtMontazClaimsClient';

function Block({ title, count, href, tone, children }: { title: string; count: number; href: string; tone: 'rose' | 'amber' | 'sky' | 'gray'; children: ReactNode }) {
  const ring = { rose: 'border-rose-200', amber: 'border-amber-200', sky: 'border-sky-200', gray: 'border-gray-200' }[tone];
  return (
    <section className={`rounded-xl border ${ring} bg-white shadow-sm`}>
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h2 className="font-semibold text-gray-900">{title} <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs">{count}</span></h2>
        <Link href={href} className="text-sm text-blue-600 hover:underline">Otevřít →</Link>
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

/** Přehled (MVT landing): counts and the top rows of each list, then the section tiles. */
export function MvtOverviewClient() {
  const { meta } = useMeta();
  const { data, error, reload } = useLoad<MvtOverview>('mvt-overview', async (signal) => parseOverview(await tlGet('mvt/overview', undefined, signal)), { refreshMs: 5 * 60_000 });
  const none = <p className="px-2 py-2 text-sm text-gray-500">Nic k řešení.</p>;
  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Montéři (MVT): Přehled" subtitle="Co dnes potřebuje vaše rozhodnutí. Podrobnosti najdete na jednotlivých stránkách." />
      <div className="space-y-8">
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton rows={4} h="h-24" />}
        {data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Block title="Chybí výsledek" count={data.missing.count} href="/mvt/nedokoncene" tone="rose">
              {data.missing.owing.length > 0 && <p className="px-2 pb-1 text-xs text-gray-500">dluží: {data.missing.owing.map((o) => `${o.person?.name ?? 'bez montéra'} (${o.count})`).join(', ')}{data.missing.backlog ? ` · starších než 7 dní ${data.missing.backlog}` : ''}</p>}
              {data.missing.top.length === 0 ? none : (
                <ul className="divide-y divide-gray-100">
                  {data.missing.top.map((r) => (
                    <li key={r.event.id} className="flex items-start justify-between gap-2 px-2 py-1.5 text-sm">
                      <div className="min-w-0"><p className="truncate font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? r.event.id}</p><p className="text-xs text-gray-500">{r.event.people.map((p) => p.name).join(', ') || 'bez montéra'} · {fmtDateTime(r.event.startsAt)}</p></div>
                      <StateChip ev={r.event} />
                    </li>
                  ))}
                </ul>
              )}
            </Block>
            <Block title="Otevřeno k opravě" count={data.reopened.count} href="/mvt/opravy" tone="amber">
              {data.reopened.top.length === 0 ? <p className="px-2 py-2 text-sm text-gray-500">Žádná návštěva není otevřená k opravě.</p> : (
                <ul className="divide-y divide-gray-100">
                  {data.reopened.top.map((r) => (
                    <li key={r.id} className="px-2 py-1.5 text-sm">
                      <p className="font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? r.event.id} <span className="text-xs font-normal text-gray-500">{r.event.typeLabel}</span></p>
                      <p className="text-xs text-gray-600">{r.reopenedBy ?? ''} · „{r.reason ?? ''}“ · {fmtDateTime(r.at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
            <Block title="Nesedí doplatek" count={data.doplatek.count} href="/mvt/nesedi-doplatek" tone="rose">
              {data.doplatek.top.length === 0 ? none : (
                <ul className="divide-y divide-gray-100">
                  {data.doplatek.top.map((r) => (
                    <li key={r.event.id} className="flex items-start justify-between gap-2 px-2 py-1.5 text-sm">
                      <div className="min-w-0"><p className="truncate font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? r.event.id}</p><p className="text-xs text-gray-500">{r.event.people.map((p) => p.name).join(', ') || '—'} · rozdíl {r.difference ?? '—'} Kč</p></div>
                      <Chip tone={r.severity === 'red' ? 'red' : r.severity === 'amber' ? 'amber' : 'sky'}>{r.severityLabel}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
            <Block title="Reklamace z montáží" count={data.claims.count} href="/mvt/reklamace" tone="gray">
              {data.claims.top.length === 0 ? none : (
                <ul className="divide-y divide-gray-100">
                  {data.claims.top.map((r) => (
                    <li key={r.event.id} className="flex items-start justify-between gap-2 px-2 py-1.5 text-sm">
                      <div className="min-w-0"><p className="truncate font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? r.event.id}</p><p className="text-xs text-gray-500">{r.reasonLabel ?? ''}</p></div>
                      <Chip tone={CLAIM_STATE_TONE[r.state] ?? 'gray'}>{r.stateLabel}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
            <Block title="Zápisy s problémem" count={data.submissionProblems.count} href="/mvt/zapisy?status=failed,partial" tone="sky">
              <p className="px-2 py-2 text-sm text-gray-700">
                {data.submissionProblems.count} selhaných nebo částečných zápisů za posledních 30 dní{data.submissionProblems.pending ? `, ${data.submissionProblems.pending} čeká` : ''}.
              </p>
            </Block>
          </div>
        )}
        <div className="space-y-6">
          {NAV.mvt.map((g) => (
            <section key={g.label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{g.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {g.items.filter((t) => t.href !== '/mvt').map((t) => (
                  <Link key={t.href} href={t.href} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#1E8449] hover:shadow">
                    <p className="text-lg font-semibold text-gray-900">{t.label}</p>
                    <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
        {meta && <p className="text-xs text-gray-400">Dnes je {meta.today} (pražský čas).</p>}
      </div>
    </main>
  );
}
