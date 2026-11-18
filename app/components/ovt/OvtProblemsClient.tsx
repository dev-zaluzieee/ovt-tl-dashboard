'use client';

import { useCallback, useState } from 'react';
import { tlGet, tlSend } from '@/lib/tl-api';
import { parseAction, parseProblems, parseResolution } from '@/lib/tl-parse';
import { errorText } from '@/lib/tl-errors';
import type { OvtProblems, ProblemRow } from '@/lib/types';
import { fmtDateTime, fmtKc, isYmd, pragueYmd, shiftYmd } from '@/lib/format';
import { useHistoryMin, useMeta } from '@/app/components/shell/MetaContext';
import { DateRange, PersonSelect, SearchBox, useUrlParams } from '@/app/components/ui/filters';
import { Alert, B2BBadge, Chip, Empty, ErpOrderLink, LoadError, PageHeader, ReasonDialog, Skeleton, btnAmber, btnSmall, inputCls } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';
import { erpEventUrl } from '@/lib/links';

const KINDS = ['nedopadlo', 'vraceno_ovt', 'bez_vysledku'] as const;
const KIND_TONE: Record<string, 'rose' | 'amber' | 'sky'> = { nedopadlo: 'rose', vraceno_ovt: 'amber', bez_vysledku: 'sky' };

type Dialog = { type: 'close' | 'nedopadlo'; row: ProblemRow } | null;

function itemId(row: ProblemRow): number | null {
  return row.kind === 'vraceno_ovt' ? row.orderId : row.eventId;
}

/** Problematické zakázky (OVT): three kinds, "uzavřené" with undo, close with a reason, mark nedopadlo. */
export function OvtProblemsClient() {
  const { meta } = useMeta();
  const historyMin = useHistoryMin();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const today = meta?.today ?? '';
  const mode = get('mode') === 'range' ? 'range' : 'current';
  const from = isYmd(get('from')) ? get('from') : shiftYmd(today, -13);
  const to = isYmd(get('to')) ? get('to') : today;
  const kindsRaw = get('kind');
  const kinds = kindsRaw ? kindsRaw.split(',').filter((k) => (KINDS as readonly string[]).includes(k)) : [];
  const reason = get('reason');
  const person = get('person');
  const q = get('q');
  const closed = get('closed') === 'show' ? 'show' : get('closed') === 'only' ? 'only' : 'hide';
  const onQ = useCallback((v: string) => set({ q: v }), [set]);

  const key = [mode, from, to, kinds.join(','), reason, person, q, closed].join('|');
  const { data, error, loading, reload } = useLoad<OvtProblems>(key, async (signal) =>
    parseProblems(
      await tlGet(
        'ovt/problems',
        { kind: kinds.join(','), current: mode === 'current', from: mode === 'range' ? from : undefined, to: mode === 'range' ? to : undefined, reason, person, q, closed: closed === 'hide' ? undefined : closed },
        signal,
      ),
    ),
  );

  const vocab = meta?.vocabulary;
  const evUrl = (r: ProblemRow) => (r.eventId && r.at ? erpEventUrl(meta?.erpWebBaseUrl, r.eventId, pragueYmd(r.at)) : null);
  const cell = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2.5';

  function toggleKind(k: string) {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    set({ kind: next.length ? next.join(',') : null });
  }

  async function undo(row: ProblemRow) {
    if (!row.resolution) return;
    setRowError(null);
    try {
      parseResolution((await tlSend('POST', `resolutions/${row.resolution.id}/undo`) as { resolution: unknown }).resolution);
      setNotice('Uzavření bylo vzato zpět, řádek je znovu na seznamu.');
      reload();
    } catch (e) {
      setRowError(errorText(e));
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Problematické zakázky" subtitle="Zaměření bez výsledku (od 2 pracovních dnů po konci), zaměření s výsledkem nedopadlo a zakázky vrácené OVT k dořešení." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs" role="group" aria-label="Období">
            {(['current', 'range'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => set({ mode: m === 'range' ? 'range' : null })} className={`px-3 py-1.5 font-medium ${mode === m ? 'bg-[#1E8449] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${m === 'range' ? 'border-l border-gray-300' : ''}`}>
                {m === 'current' ? 'Současné' : 'Období'}
              </button>
            ))}
          </div>
          {mode === 'range' && <DateRange from={from} to={to} min={historyMin} onChange={(f, t) => set({ from: f, to: t })} />}
          <PersonSelect side="ovt" scope={kinds.length === 1 && kinds[0] === 'nedopadlo' ? 'history' : 'work'} value={person} onChange={(v) => set({ person: v })} />
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">Uzavřené</span>
            <select value={closed} onChange={(e) => set({ closed: e.target.value === 'hide' ? null : e.target.value })} className={inputCls}>
              <option value="hide">skrýt</option>
              <option value="show">zobrazit i uzavřené</option>
              <option value="only">jen uzavřené</option>
            </select>
          </label>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" onClick={reload} className={btnSmall}>
            Obnovit
          </button>
        </div>
        <SearchBox value={q} onChange={onQ} placeholder="Hledat: zákazník, telefon, číslo zakázky…" ignored={data?.qIgnored} />

        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <Chip key={k} tone={KIND_TONE[k]} active={kinds.includes(k)} onClick={() => toggleKind(k)}>
              {vocab?.ovtProblemKinds[k] ?? k} · {data?.counts[k] ?? 0}
            </Chip>
          ))}
          {data && data.closedCount > 0 && closed === 'hide' && <span className="text-xs text-gray-500">{data.closedCount} uzavřených je skryto</span>}
          {vocab && (
            <label className="ml-2 flex items-center gap-1 text-xs text-gray-700">
              Důvod nedopadlo:
              <select value={reason} onChange={(e) => set({ reason: e.target.value })} className={inputCls}>
                <option value="">všechny</option>
                {Object.entries(vocab.nedopadloReasons).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {notice && <Alert tone="green">{notice}</Alert>}
        {rowError && <Alert tone="red">{rowError}</Alert>}
        {error && <LoadError error={error} onRetry={reload} />}
        {data?.warnings.map((w) => (
          <Alert key={w} tone="amber">{w}</Alert>
        ))}
        {data?.truncated && <Alert tone="amber">Seznam je zkrácený (nejvýše 1000 řádků). Zúžte filtr.</Alert>}
        {!data && !error && <Skeleton />}
        {data && (data.rows.length === 0 ? (
          <Empty title="Nic k vyřízení">Pro zvolené filtry nejsou žádné problematické zakázky.</Empty>
        ) : (
          <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className={cell}>Proč</th>
                  <th className={cell}>Zákazník</th>
                  <th className={cell}>Telefon</th>
                  <th className={cell}>OVT</th>
                  <th className={`${cell} text-right`}>Hodnota</th>
                  <th className={cell}>Termín</th>
                  <th className={cell}>Zakázka</th>
                  <th className={`${cell} text-right`}>Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r) => (
                  <tr key={r.key} className={`align-top ${r.resolution ? 'bg-gray-50 text-gray-500' : ''}`}>
                    <td className={cell}>
                      <Chip tone={KIND_TONE[r.kind] ?? 'gray'}>{r.kindLabel}</Chip>
                      {r.reasonLabel && <p className="mt-0.5 text-xs text-gray-700">{r.reasonLabel}</p>}
                      {r.legacy && <p className="mt-0.5 text-xs text-gray-500">přenesený výsledek</p>}
                      {r.subState && <p className="mt-0.5 text-xs text-gray-600">{r.subState.label}</p>}
                      {r.note && density === 'standard' && <p className="mt-0.5 text-xs italic text-gray-600">„{r.note}“</p>}
                      {r.resolution && (
                        <p className="mt-0.5 text-xs text-gray-600">
                          Uzavřeno: {vocab?.ovtCloseReasons[r.resolution.reason] ?? r.resolution.reason} · {r.resolution.actorName ?? r.resolution.actorEmail} · {fmtDateTime(r.resolution.createdAt)}
                          {r.resolution.note ? ` · „${r.resolution.note}“` : ''}
                        </p>
                      )}
                    </td>
                    <td className={cell}>
                      <span className="font-medium text-gray-900">{r.customer?.name ?? '—'}</span> <B2BBadge b2b={r.b2b} />
                      {density === 'standard' && r.customer?.city && <p className="text-xs text-gray-500">{r.customer.city}</p>}
                    </td>
                    <td className={`${cell} whitespace-nowrap font-mono text-xs`}>{r.customer?.phone ?? '—'}</td>
                    <td className={`${cell} whitespace-nowrap`}>{r.owner?.name ?? <span className="text-gray-400">bez vlastníka</span>}</td>
                    <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{fmtKc(r.valueSDph)}</td>
                    <td className={`${cell} whitespace-nowrap text-gray-700`}>
                      {fmtDateTime(r.at)}
                      {r.ageWorkingDays !== null && <p className="text-xs text-gray-500">{r.ageWorkingDays} prac. dní</p>}
                    </td>
                    <td className={`${cell} whitespace-nowrap text-xs`}>
                      <ErpOrderLink orderId={r.orderId} />
                      {r.orderStatusLabel && <p className="text-gray-500">{r.orderStatusLabel}</p>}
                      {r.eventId && evUrl(r) && (
                        <a href={evUrl(r) ?? '#'} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Událost
                        </a>
                      )}
                    </td>
                    <td className={`${cell} whitespace-nowrap text-right`}>
                      <div className="flex justify-end gap-1.5">
                        {r.resolution ? (
                          <button type="button" className={btnSmall} onClick={() => void undo(r)}>
                            Vrátit zpět
                          </button>
                        ) : r.legacy ? (
                          <span className="text-xs text-gray-500" title="Návštěva byla přenesena ze starých systémů, z dashboardu se nedá měnit ani uzavřít.">přeneseno, jen ke čtení</span>
                        ) : (
                          <>
                            {r.kind === 'bez_vysledku' && (
                              <button type="button" className={btnAmber} onClick={() => setDialog({ type: 'nedopadlo', row: r })}>
                                Označit jako nedopadlo
                              </button>
                            )}
                            <button type="button" className={btnSmall} onClick={() => setDialog({ type: 'close', row: r })}>
                              Uzavřít
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {dialog?.type === 'close' && vocab && (
        <ReasonDialog
          title="Uzavřít řádek"
          intro={
            <>
              {dialog.row.customer?.name ?? 'Řádek'} · {dialog.row.kindLabel}. Uzavření je vaše vlastní poznámka v dashboardu, do ERP se nic nezapisuje; jde vzít zpět.
            </>
          }
          reasons={vocab.ovtCloseReasons}
          noteRequiredFor={['jine']}
          submitLabel="Uzavřít"
          onClose={() => setDialog(null)}
          onSubmit={async ({ reason: rs, note }) => {
            const id = itemId(dialog.row);
            if (!id) throw new Error('Řádek nemá identifikátor.');
            await tlSend('POST', 'ovt/problems/close', { kind: dialog.row.kind, id, reason: rs, note: note || undefined });
            setNotice('Řádek byl uzavřen.');
            reload();
          }}
        />
      )}
      {dialog?.type === 'nedopadlo' && vocab && (
        <ReasonDialog
          title="Označit jako nedopadlo"
          intro={<><p>Do ERP se zapíše (pod vaším jménem): zakázka dopadlo = ne s důvodem, stav zakázky „nedopadlo“, štítky (důvod a ZKONTROLOVÁNO), komentář u zakázky a výsledek návštěvy nedopadlo.</p><p className="mt-2 text-amber-900">Pozor: označení z dashboardu nejde vrátit zpět na tabletu. Cesta zpět je „Otevřít k opravě“ na návštěvě a přesun zakázky kanceláří.</p><p className="mt-2 text-gray-700">Po zápisu se návštěva přesune mezi „Nedopadlo“. V režimu „Současné“ se tam ukazuje jen posledních 2 pracovních dnů, starší návštěvu najdete po výběru období.</p></>}
          reasons={vocab.nedopadloReasons}
          noteLabel="Poznámka (max. 500 znaků)"
          submitLabel="Označit jako nedopadlo"
          onClose={() => {
            setDialog(null);
            reload();
          }}
          onSubmit={async ({ reason: rs, note }) => {
            if (!dialog.row.eventId) throw new Error('Řádek nemá návštěvu.');
            return parseAction(await tlSend('POST', 'ovt/problems/nedopadlo', { eventId: dialog.row.eventId, reason: rs, note: note ? note.slice(0, 500) : undefined }));
          }}
        />
      )}
    </main>
  );
}
