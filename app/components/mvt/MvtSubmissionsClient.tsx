'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { tlGet } from '@/lib/tl-api';
import { parseSubmissionDetail, parseSubmissionList } from '@/lib/tl-parse';
import type { SubmissionDetail, SubmissionList } from '@/lib/types';
import { fmtDateTime, fmtKc, isYmd } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { SearchBox, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, LoadError, PageHeader, Skeleton, btnGhost, btnSmall, inputCls } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';

const STATUSES = ['failed', 'partial', 'running', 'success', 'superseded'];
const STATUS_TONE: Record<string, 'red' | 'amber' | 'blue' | 'green' | 'gray'> = { failed: 'red', partial: 'amber', running: 'blue', success: 'green', superseded: 'gray' };
const OUTCOMES: Record<string, string> = { happy: 'Dokončeno', zachrana: 'Se záchranou', reklamace: 'Na reklamace' };
const PER_PAGE = 50;

/** Zápisy: every close the fitters' app sent, with its status; click for the steps. */
export function MvtSubmissionsClient() {
  const { meta } = useMeta();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const status = get('status');
  const outcome = get('outcome');
  const fitter = get('fitter');
  const q = get('q');
  const eventId = get('eventId');
  const from = isYmd(get('from')) ? get('from') : '';
  const to = isYmd(get('to')) ? get('to') : '';
  const page = Math.max(1, Number(get('page')) || 1);
  const onQ = useCallback((v: string) => set({ q: v, page: null }), [set]);
  const statuses = status ? status.split(',').filter(Boolean) : [];

  const { data, error, loading, reload } = useLoad<SubmissionList>(`subs-${status}-${outcome}-${fitter}-${q}-${eventId}-${from}-${to}-${page}`, async (signal) =>
    parseSubmissionList(await tlGet('mvt/submissions', { status, outcome, fitter, q, eventId, from, to, page, perPage: PER_PAGE }, signal)),
  );
  const pad = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const labels = { ...(meta?.vocabulary.submissionStatuses ?? {}), ...(data?.statusLabels ?? {}) };

  function toggle(s: string) {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    set({ status: next.length ? next.join(',') : null, page: null });
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Zápisy" subtitle="Každé odeslání výsledku z aplikace montérů a co se kam zapsalo (ERP, hotovost)." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">Od <input type="date" value={from} onChange={(e) => set({ from: e.target.value, page: null })} className={inputCls} /></label>
          <label className="flex items-center gap-2 text-sm text-gray-700">Do <input type="date" value={to} onChange={(e) => set({ to: e.target.value, page: null })} className={inputCls} /></label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Výsledek
            <select value={outcome} onChange={(e) => set({ outcome: e.target.value, page: null })} className={inputCls}>
              <option value="">všechny</option>
              {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Montér
            <input defaultValue={fitter} onBlur={(e) => e.target.value.trim() !== fitter && set({ fitter: e.target.value.trim(), page: null })} placeholder="jméno" className={`${inputCls} w-36`} />
          </label>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>Obnovit</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={q} onChange={onQ} placeholder="Hledat: zákazník, číslo zakázky…" />
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Chip key={s} tone={STATUS_TONE[s]} active={statuses.includes(s)} onClick={() => toggle(s)}>{labels[s] ?? s}</Chip>
            ))}
          </div>
          {eventId && (
            <span className="text-sm text-gray-700">
              Jen událost #{eventId} <button type="button" className={btnSmall} onClick={() => set({ eventId: null })}>zrušit</button>
            </span>
          )}
        </div>
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton />}
        {data && (data.rows.length === 0 ? (
          <Empty title="Žádné zápisy">Pro zvolené filtry nic není.</Empty>
        ) : (
          <>
            <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className={pad}>Kdy</th>
                    <th className={pad}>Montér</th>
                    <th className={pad}>Událost</th>
                    <th className={pad}>Výsledek</th>
                    <th className={pad}>Stav</th>
                    <th className={`${pad} text-right`}>Kroky</th>
                    <th className={`${pad} text-right`}>Vybráno</th>
                    <th className={pad} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((r) => (
                    <tr key={r.id} className="align-top hover:bg-gray-50">
                      <td className={`${pad} whitespace-nowrap`}>{fmtDateTime(r.createdAt)}</td>
                      <td className={`${pad} whitespace-nowrap`}>{r.fitterName ?? '—'}</td>
                      <td className={`${pad} whitespace-nowrap text-xs`}>#{r.eventId}{r.erpOrderId ? ` · zakázka ${r.erpOrderId}` : ''}</td>
                      <td className={pad}>{r.outcome ? OUTCOMES[r.outcome] ?? r.outcome : '—'}</td>
                      <td className={pad}><Chip tone={STATUS_TONE[r.status] ?? 'gray'}>{r.statusLabel}</Chip></td>
                      <td className={`${pad} whitespace-nowrap text-right text-xs`}>
                        {r.stepCount}{r.failedSteps ? <span className="font-semibold text-red-700"> · {r.failedSteps} selhalo</span> : null}{r.warningCount ? <span className="text-amber-700"> · {r.warningCount} upoz.</span> : null}
                      </td>
                      <td className={`${pad} whitespace-nowrap text-right tabular-nums`}>{r.collected !== null ? `${fmtKc(r.collected)}${r.method ? ` · ${r.method}` : ''}` : '—'}</td>
                      <td className={`${pad} text-right`}><Link href={`/mvt/zapisy/${r.id}`} className="text-blue-600 hover:underline">Detail</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>{data.total} zápisů, strana {data.page} z {pages}</span>
              <span className="flex gap-2">
                <button type="button" className={btnGhost} disabled={page <= 1} onClick={() => set({ page: page > 2 ? String(page - 1) : null })}>Předchozí</button>
                <button type="button" className={btnGhost} disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Další</button>
              </span>
            </div>
          </>
        ))}
        {data && data.total > 0 && statuses.length === 0 && <Alert tone="gray">Zobrazují se všechny stavy. Chipy nahoře zúží výběr na problémové zápisy (Selhalo, Částečné).</Alert>}
      </div>
    </main>
  );
}

export function MvtSubmissionDetail({ id }: { id: number }) {
  const { meta } = useMeta();
  const { data, error, reload } = useLoad<SubmissionDetail>(`sub-${id}`, async (signal) => parseSubmissionDetail(await tlGet(`mvt/submissions/${id}`, undefined, signal)));
  const stepTone = (s: string) => (s === 'failed' ? 'text-red-700 font-semibold' : s === 'ok' ? 'text-emerald-700' : s === 'skipped' ? 'text-gray-400' : 'text-amber-700');
  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <PageHeader title={`Zápis #${id}`} subtitle={<Link href="/mvt/zapisy" className="text-blue-600 hover:underline">← Zpět na zápisy</Link>} />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Skeleton />}
      {data && (
        <div className="space-y-5">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <dt className="text-gray-500">Stav</dt><dd><Chip tone={STATUS_TONE[data.status] ?? 'gray'}>{data.statusLabel}</Chip></dd>
            <dt className="text-gray-500">Montér</dt><dd>{data.fitterName ?? '—'}</dd>
            <dt className="text-gray-500">Událost</dt><dd><Link href={`/mvt/zapisy?eventId=${data.eventId}`} className="text-blue-600 hover:underline">#{data.eventId}</Link>{data.erpOrderId ? ` · zakázka ${data.erpOrderId}` : ''}</dd>
            <dt className="text-gray-500">Výsledek</dt><dd>{data.outcome ? OUTCOMES[data.outcome] ?? data.outcome : '—'}</dd>
            <dt className="text-gray-500">Odesláno</dt><dd>{fmtDateTime(data.createdAt)}</dd>
            <dt className="text-gray-500">Dokončeno</dt><dd>{fmtDateTime(data.completedAt)}</dd>
            <dt className="text-gray-500">Přílohy</dt><dd>{data.uploads.length}</dd>
          </dl>
          {data.warnings.length > 0 && <Alert tone="amber"><ul className="list-disc pl-5">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Kroky</h2>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {data.steps.map((s) => (
                    <tr key={s.name} className="align-top">
                      <td className="px-3 py-1.5 text-gray-800">{meta?.vocabulary.stepNames[s.name] ?? s.label}</td>
                      <td className={`px-3 py-1.5 ${stepTone(s.status)}`}>{s.statusLabel}</td>
                      <td className="px-3 py-1.5 text-gray-600">{s.detail ?? ''}{s.code ? <span className="ml-1 text-xs text-gray-400">[{s.code}]</span> : null}</td>
                    </tr>
                  ))}
                  {data.steps.length === 0 && <tr><td className="px-3 py-3 text-gray-500">Zápis zatím nemá žádné kroky.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          {data.input && (
            <section>
              <h2 className="mb-2 text-lg font-semibold text-gray-900">Co montér zadal</h2>
              <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white p-4 text-sm">
                {Object.entries(data.input).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd className="break-words text-gray-800">{String(v)}</dd></div>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
