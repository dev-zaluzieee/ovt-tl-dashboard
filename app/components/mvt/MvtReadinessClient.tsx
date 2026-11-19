'use client';

import { Fragment, type ReactNode } from 'react';
import { tlGet } from '@/lib/tl-api';
import { parseReadiness } from '@/lib/tl-parse';
import type { MvtReadiness, ReadinessLevel, ReadinessRow } from '@/lib/types';
import { erpClaimUrl, erpEventUrl, erpOrderUrl } from '@/lib/links';
import { fmtDateTime, fmtYmd, plural } from '@/lib/format';
import { useMeta } from '@/app/components/shell/MetaContext';
import { PersonSelect, useUrlParams } from '@/app/components/ui/filters';
import { Alert, Chip, Empty, ErpOrderLink, LoadError, PageHeader, Skeleton, btnSmall } from '@/app/components/ui/kit';
import { DensityToggle } from '@/app/components/retention/DensityToggle';
import { useListDensity } from '@/app/components/retention/listDensity';
import { useLoad } from '@/app/components/ui/useLoad';

const WINDOWS = [7, 14, 21] as const;
const DEFAULT_DAYS = 7;
const TONE: Record<ReadinessLevel, 'red' | 'amber' | 'gray'> = { chyba: 'red', overit: 'amber', info: 'gray' };
const WEEKDAYS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d}. ${m}.`;
}

function ExtA({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
      {children}
    </a>
  );
}

/** The fix text; `#123` of an order the hint names becomes a link to that order in the ERP. */
function FixText({ text, orderIds }: { text: string; orderIds: number[] }) {
  const parts = text.split(/(#\d+)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^#(\d+)$/.exec(p);
        if (m && orderIds.includes(Number(m[1]))) return <ErpOrderLink key={i} orderId={Number(m[1])} />;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Připravenost montáží: upcoming visits whose data is not enough for the fitter. Read only; one visit per line. */
export function MvtReadinessClient() {
  const { meta } = useMeta();
  const { get, set } = useUrlParams();
  const [density, setDensity] = useListDensity();
  const dayChoice = get('day');
  const daysParam = Number(get('days'));
  const days = (WINDOWS as readonly number[]).includes(daysParam) ? daysParam : DEFAULT_DAYS;
  const person = get('person');
  const all = get('level') === 'vse';
  const pad = density === 'compact' ? 'px-3 py-1' : 'px-3 py-2';

  const { data, error, loading, reload } = useLoad<MvtReadiness>(`readiness-${days}`, async (signal) => parseReadiness(await tlGet('mvt/readiness', { days }, signal)));
  const base = meta?.erpWebBaseUrl;

  // the person filter reaches every count: tallies are computed from the rows of that person (the answer's `byDay` knows no persons)
  const ofPerson = (data?.rows ?? []).filter((r) => !person || r.event.people.some((p) => String(p.id) === person));
  const shown = ofPerson.filter((r) => all || r.level === 'chyba');
  // a day that is not in the answer (another window) means "all days"
  const day = data && data.byDay.some((d) => d.day === dayChoice) ? dayChoice : '';
  const rows = day ? shown.filter((r) => r.event.day === day) : shown;
  const tally = (d: string): { chyba: number; overit: number; info: number } => {
    const t = { chyba: 0, overit: 0, info: 0 };
    for (const r of ofPerson) if (r.event.day === d) t[r.level]++;
    return t;
  };
  const days_ = (data?.byDay ?? []).map((d) => (person ? { ...d, ...tally(d.day) } : d));
  const countOf = (d: { chyba: number; overit: number; info: number }): number => (all ? d.chyba + d.overit + d.info : d.chyba);
  const total = shown.length;
  const filtered = !!person;

  function table() {
    if (!data) return null;
    const groups: Array<{ day: string; rows: ReadinessRow[] }> = [];
    for (const r of rows) {
      const g = groups[groups.length - 1];
      if (g && g.day === r.event.day) g.rows.push(r);
      else groups.push({ day: r.event.day, rows: [r] });
    }
    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className={pad}>Termín</th>
              <th className={pad}>Druh</th>
              <th className={pad}>Montér</th>
              <th className={pad}>Zákazník</th>
              <th className={pad}>Zakázka</th>
              <th className={pad}>Co chybí</th>
              <th className={pad}>Náprava</th>
              <th className={pad}>Odkazy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {groups.map((g) => {
              const d = days_.find((x) => x.day === g.day);
              return (
                <Fragment key={g.day}>
                  <tr className="bg-gray-100">
                    <td colSpan={8} className="px-3 py-1 text-xs font-semibold text-gray-700">
                      {dayLabel(g.day)}
                      {d ? <span className="ml-2 font-normal text-gray-500">{person ? '' : `zkontrolováno ${d.checked} ${plural(d.checked, 'návštěva', 'návštěvy', 'návštěv')} · `}s chybou {d.chyba} · k ověření {d.overit}</span> : null}
                    </td>
                  </tr>
                  {g.rows.map((r) => {
                    const e = r.event;
                    const first = r.findings[0];
                    const ids = r.hint ? r.hint.otherOrderIds : [];
                    return (
                      <tr key={e.id} className="align-top">
                        <td className={`${pad} whitespace-nowrap tabular-nums`}>{fmtDateTime(e.startsAt)}</td>
                        <td className={pad}>
                          <Chip tone="slate">{e.typeLabel}</Chip>
                          {e.migrated && density === 'standard' && <p className="mt-0.5 text-[11px] text-gray-400">převzato</p>}
                        </td>
                        <td className={`${pad} whitespace-nowrap`}>{e.people.map((p) => p.name).filter(Boolean).join(', ') || <span className="text-red-700">bez montéra</span>}</td>
                        <td className={pad}>
                          <p className="font-medium text-gray-900">{e.customer.name ?? e.title ?? '—'}</p>
                          {density === 'standard' && e.customer.city && <p className="text-xs text-gray-500">{e.customer.city}</p>}
                          {e.note && (
                            <p className={`mt-0.5 text-xs italic text-gray-600 ${density === 'compact' ? 'max-w-xs truncate' : 'max-w-sm'}`} title={e.note}>
                              {e.note}
                            </p>
                          )}
                        </td>
                        <td className={`${pad} whitespace-nowrap`}>
                          <ErpOrderLink orderId={e.orderId} />
                          {e.complaintId ? <span className="ml-1 text-xs text-gray-500">R#{e.complaintId}</span> : null}
                        </td>
                        <td className={pad}>
                          <div className="flex flex-wrap gap-1">
                            {r.findings.map((f) => (
                              <Chip key={f.code} tone={TONE[f.level]} title={f.fix}>
                                {f.label}
                              </Chip>
                            ))}
                          </div>
                        </td>
                        <td className={`${pad} max-w-md text-xs text-gray-700`}>
                          {first ? <FixText text={first.fix} orderIds={ids} /> : null}
                          {r.findings.some((f) => f.code === 'bez_zakazky') && (
                            <p className="mt-1">
                              <ExtA href={erpEventUrl(base, e.id, e.day)}>Otevřít událost v ERP</ExtA>
                            </p>
                          )}
                        </td>
                        <td className={`${pad} whitespace-nowrap text-xs`}>
                          <span className="inline-flex flex-wrap gap-x-2">
                            <ExtA href={erpOrderUrl(base, e.orderId)}>Zakázka</ExtA>
                            <ExtA href={erpClaimUrl(base, e.complaintId)}>Reklamace</ExtA>
                            <ExtA href={erpEventUrl(base, e.id, e.day)}>Událost</ExtA>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function body() {
    if (!data) return null;
    if (!data.available) {
      return (
        <Alert tone="amber">
          <p>Kontrolu připravenosti se teď nepodařilo načíst, zkuste to za chvíli.</p>
          <button type="button" className={`${btnSmall} mt-2`} onClick={reload}>
            Zkusit znovu
          </button>
        </Alert>
      );
    }
    return (
      <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
        {data.testMode && <Alert tone="amber">Zkušební provoz: kontrolují se jen události vytvořené ručně v ERP, ostatní návštěvy se tu nezobrazují.</Alert>}
        {data.capped && <Alert tone="amber">Období má víc návštěv, než se kontroluje najednou. Zvolte kratší období.</Alert>}
        {data.checked === 0 ? (
          <Alert tone="gray">V období není žádná návštěva ke kontrole.</Alert>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Dny">
              <Chip tone="slate" active={day === ''} onClick={() => set({ day: null })}>
                Vše · {total}
              </Chip>
              {days_.filter((d) => (person ? countOf(d) > 0 : d.checked > 0)).map((d) => (
                <Chip key={d.day} tone={countOf(d) > 0 ? (d.chyba > 0 ? 'red' : 'amber') : 'emerald'} active={day === d.day} onClick={() => set({ day: day === d.day ? null : d.day })} title={`Zkontrolováno ${d.checked}`}>
                  {dayLabel(d.day)} · {countOf(d)}
                </Chip>
              ))}
            </div>
            {rows.length === 0 ? (
              <Empty title={filtered || day ? 'Žádná návštěva neodpovídá filtru.' : 'Žádná návštěva s chybou.'}>
                Zkontrolováno {data.checked} {plural(data.checked, 'návštěva', 'návštěvy', 'návštěv')} od {fmtYmd(data.from)} do {fmtYmd(data.to)}.
                {!all && data.counts && data.counts.overit + data.counts.info > 0 ? ' Další návštěvy k ověření a informace zobrazíte volbou nahoře.' : ''}
              </Empty>
            ) : (
              table()
            )}
          </>
        )}
        <p className="text-xs text-gray-400">
          Zkontrolováno {data.checked} {plural(data.checked, 'návštěva', 'návštěvy', 'návštěv')} od {fmtYmd(data.from)} do {fmtYmd(data.to)}
          {data.counts ? ` · s chybou ${data.counts.chyba} · k ověření ${data.counts.overit} · informace ${data.counts.info}` : ''}. Data jsou nejvýše minutu stará; tlačítko Obnovit je načte znovu.
        </p>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <PageHeader title="Montéři (MVT): Připravenost montáží" subtitle="Naplánované návštěvy, ke kterým montér v aplikaci nedostane vše potřebné. Opravte v ERP před dnem návštěvy. Jen ke čtení." />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">Období</span>
            {WINDOWS.map((w) => (
              <Chip key={w} tone="slate" active={days === w} onClick={() => set({ days: w === DEFAULT_DAYS ? null : String(w) })}>
                {w === DEFAULT_DAYS ? 'Týden' : `${w} dní`}
              </Chip>
            ))}
          </div>
          <PersonSelect side="mvt" value={person} onChange={(v) => set({ person: v })} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={all} onChange={(e) => set({ level: e.target.checked ? 'vse' : null })} />
            i k ověření a informace
          </label>
          <DensityToggle density={density} onChange={setDensity} />
          <button type="button" className={btnSmall} onClick={reload}>
            Obnovit
          </button>
        </div>
        {error && <LoadError error={error} onRetry={reload} />}
        {!data && !error && <Skeleton />}
        {body()}
      </div>
    </main>
  );
}
