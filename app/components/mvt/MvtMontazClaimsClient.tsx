'use client';

import { tlGet } from '@/lib/tl-api';
import { parseMontazClaims } from '@/lib/tl-parse';
import type { MvtMontazClaims } from '@/lib/types';
import { fmtDateTime, fmtYmd, isYmd, shiftYmd } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { DateRange, PersonSelect, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, EventLinks, LoadError, PageHeader, Skeleton, btnSmall } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';

export const CLAIM_STATE_TONE: Record<string, 'green' | 'sky' | 'amber' | 'rose' | 'gray'> = { vyreseno: 'green', naplanovano: 'sky', ceka: 'amber', bez_reklamace: 'rose' };

/** Reklamace z montáží: montáže nedokončené (not_done), the claim they created and its follow-up visit. */
export function MvtMontazClaimsClient() {
  const { meta } = useMeta();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const today = meta?.today ?? '';
  const from = isYmd(get('from')) ? get('from') : shiftYmd(today, -59);
  const to = isYmd(get('to')) ? get('to') : today;
  const person = get('person');
  const resolved = get('resolved') === '1';
  const state = get('state');
  const { data, error, loading, reload } = useLoad<MvtMontazClaims>(`mclaims-${from}-${to}-${person}-${resolved}`, async (signal) =>
    parseMontazClaims(await tlGet('mvt/montaz-claims', { from, to, person, includeResolved: resolved }, signal)),
  );
  const pad = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';
  const rows = data ? data.rows.filter((r) => !state || r.state === state) : [];
  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Reklamace z montáží" subtitle="Montáže, které montér nedokončil, a co z nich vzniklo: reklamace a navazující návštěva." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <DateRange from={from} to={to} onChange={(f, t) => set({ from: f, to: t })} />
          <PersonSelect side="mvt" value={person} onChange={(v) => set({ person: v })} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={resolved} onChange={(e) => set({ resolved: e.target.checked ? '1' : null })} />
            zobrazit i vyřešené
          </label>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </div>
        {data && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.counts).map(([k, n]) => (
              <Chip key={k} tone={CLAIM_STATE_TONE[k] ?? 'gray'} active={state === k} onClick={() => set({ state: state === k ? null : k })}>
                {data.stateLabels[k] ?? k} · {n}
              </Chip>
            ))}
          </div>
        )}
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton />}
        {data?.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků).</Alert>}
        {data && (rows.length === 0 ? (
          <Empty title="Žádné nedokončené montáže">V tomto období a filtru nic není.</Empty>
        ) : (
          <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr><th className={pad}>Montáž</th><th className={pad}>Montér</th><th className={pad}>Důvod</th><th className={pad}>Stav</th><th className={pad}>Reklamace</th><th className={pad}>Navazující návštěva</th><th className={pad} /></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.event.id} className="align-top">
                    <td className={pad}>
                      <p className="font-medium text-gray-900">{r.event.customer?.name ?? r.event.title ?? '—'}</p>
                      <p className="text-xs text-gray-500">{fmtDateTime(r.event.startsAt)}{r.ageDays !== null ? ` · před ${r.ageDays} dny` : ''}</p>
                    </td>
                    <td className={`${pad} whitespace-nowrap`}>{r.event.people.map((p) => p.name).join(', ') || '—'}</td>
                    <td className={`${pad} max-w-xs`}>{r.reasonLabel ?? '—'}{r.note ? <p className="text-xs text-gray-500">{r.note}</p> : null}</td>
                    <td className={pad}><Chip tone={CLAIM_STATE_TONE[r.state] ?? 'gray'}>{r.stateLabel}</Chip></td>
                    <td className={`${pad} text-xs`}>
                      {r.claim ? (
                        <>
                          <p>#{r.claim.id} · {r.claim.statusLabel ?? r.claim.status ?? ''}</p>
                          <p className="text-gray-500">{[r.claim.druh, r.claim.uznano, r.claim.blocker ? `čeká na ${r.claim.blocker}` : null].filter(Boolean).join(' · ')}</p>
                        </>
                      ) : <span className="text-amber-700">bez reklamace</span>}
                    </td>
                    <td className={`${pad} text-xs`}>{r.followUp ? `${fmtYmd(r.followUp.startsAt.slice(0, 10))} · ${r.followUp.status}` : '—'}</td>
                    <td className={`${pad} text-right text-xs`}><EventLinks ev={r.event} claimId={r.claim?.id ?? null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </main>
  );
}
