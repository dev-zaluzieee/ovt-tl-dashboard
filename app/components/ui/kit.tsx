'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActionResult, EventView } from '@/lib/types';
import { errorText } from '@/lib/tl-errors';
import { useMeta } from '@/app/components/shell/MetaContext';
import { erpClaimUrl, erpEventUrl, erpOrderUrl } from '@/lib/links';

export const btnPrimary = 'rounded-md bg-[#1E8449] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#166d3b] disabled:opacity-50';
export const btnGhost = 'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';
export const btnSmall = 'rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';
export const btnAmber = 'rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50';
export const inputCls = 'rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[#1E8449] focus:outline-none focus:ring-1 focus:ring-[#1E8449]';

type Tone = 'green' | 'emerald' | 'gray' | 'amber' | 'red' | 'rose' | 'sky' | 'blue' | 'indigo' | 'slate';
const TONES: Record<Tone, string> = {
  green: 'bg-green-100 text-green-800 border-green-300',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  gray: 'bg-gray-100 text-gray-700 border-gray-300',
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  red: 'bg-red-100 text-red-800 border-red-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  sky: 'bg-sky-100 text-sky-800 border-sky-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
};

export function Chip({ tone = 'gray', children, title, onClick, active }: { tone?: Tone; children: ReactNode; title?: string; onClick?: () => void; active?: boolean }) {
  const cls = `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${active ? 'ring-2 ring-gray-500 ring-offset-1' : ''}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={`${cls} ${active ? '' : 'opacity-80 hover:opacity-100'}`}>
        {children}
      </button>
    );
  }
  return (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}

/** Tone of a visit state code (one ladder for every list, L7 section 4). */
export function stateTone(code: string): Tone {
  switch (code) {
    case 'closed':
      return 'green';
    case 'closed_from_order':
      return 'emerald';
    case 'closed_no_result':
    case 'legacy_no_result':
    case 'no_owner':
    case 'planned':
    case 'cancelled':
      return 'gray';
    case 'reopened':
    case 'app_partial':
    case 'past_end':
      return 'amber';
    case 'app_failed':
    case 'overdue':
      return 'rose';
    case 'tablet_in_progress':
      return 'sky';
    case 'in_progress':
      return 'blue';
    default:
      return 'gray';
  }
}

/** Bar colours of the day calendar by state. */
export function stateBarClass(code: string): string {
  switch (code) {
    case 'closed':
      return 'border-green-600 bg-green-50 text-green-950 hover:bg-green-100';
    case 'closed_from_order':
      return 'border-emerald-500 bg-emerald-50 text-emerald-950 hover:bg-emerald-100';
    case 'reopened':
    case 'app_partial':
    case 'past_end':
      return 'border-amber-500 bg-amber-50 text-amber-950 hover:bg-amber-100';
    case 'app_failed':
    case 'overdue':
      return 'border-rose-500 bg-rose-50 text-rose-950 hover:bg-rose-100';
    case 'tablet_in_progress':
      return 'border-sky-500 bg-sky-50 text-sky-950 hover:bg-sky-100';
    case 'in_progress':
      return 'border-blue-500 bg-blue-50 text-blue-950 hover:bg-blue-100';
    default:
      return 'border-slate-400/70 bg-slate-100 text-slate-900 hover:bg-slate-200/90';
  }
}

/** Small grey label on a visit whose result was taken over from the old systems (Raynet and the old apps), not written by the new system. */
export function LegacyResultTag({ ev }: { ev: EventView }) {
  if (ev.result?.source !== 'legacy') return null;
  return (
    <span className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-1.5 text-[10px] font-medium text-gray-600" title="Výsledek byl přenesen ze starých systémů (Raynet, staré aplikace), nezapsal ho nový systém.">
      přenesený výsledek
    </span>
  );
}

export function StateChip({ ev }: { ev: EventView }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Chip tone={stateTone(ev.state.code)}>{ev.state.label}</Chip>
      <LegacyResultTag ev={ev} />
    </span>
  );
}

export function B2BBadge({ b2b }: { b2b: boolean | null }) {
  if (!b2b) return null;
  return <span className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-800" title="B2B zakázka">B2B</span>;
}

export function Alert({ tone = 'red', children, role }: { tone?: 'red' | 'amber' | 'green' | 'gray'; children: ReactNode; role?: string }) {
  const cls = { red: 'border-red-200 bg-red-50 text-red-900', amber: 'border-amber-300 bg-amber-50 text-amber-950', green: 'border-emerald-200 bg-emerald-50 text-emerald-900', gray: 'border-gray-200 bg-gray-50 text-gray-800' }[tone];
  return (
    <div role={role ?? (tone === 'red' ? 'alert' : 'status')} className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert tone="red">
      <p>{errorText(error, 'Data se nepodařilo načíst.')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${btnSmall} mt-2`}>
          Zkusit znovu
        </button>
      )}
    </Alert>
  );
}

export function Skeleton({ rows = 3, h = 'h-14' }: { rows?: number; h?: string }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${h} animate-pulse rounded-xl bg-gray-100`} />
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
      <p className="font-medium text-gray-900">{title}</p>
      {children && <p className="mt-2 text-sm">{children}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold text-[#1E8449]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} className={`max-h-[88vh] w-full overflow-y-auto whitespace-normal rounded-2xl border border-gray-200 bg-white p-5 shadow-xl outline-none ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className={btnSmall}>
            Zavřít
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** What an ERP write reported: outcome and every step (a failure is HTTP 200, so it is read from here). */
export function StepsPanel({ result }: { result: ActionResult }) {
  const tone = result.outcome === 'done' ? 'green' : result.outcome === 'dry' ? 'amber' : 'red';
  const label = { done: 'Zapsáno do ERP.', partial: 'Zapsáno jen částečně.', failed: 'Zápis do ERP selhal.', dry: 'Zkušební běh, do ERP se nic nezapsalo.' }[result.outcome];
  return (
    <Alert tone={tone}>
      <p className="font-semibold">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {result.steps.map((s) => (
          <li key={s.name}>
            <span className={s.status === 'ok' ? 'text-emerald-700' : s.status === 'failed' ? 'font-semibold text-red-700' : 'text-gray-600'}>
              {s.status === 'ok' ? 'hotovo' : s.status === 'failed' ? 'selhalo' : s.status === 'dry' ? 'zkušebně' : 'nespuštěno'}
            </span>{' '}
            {s.label}
            {s.detail ? <span className="text-gray-700">: {s.detail}</span> : null}
          </li>
        ))}
      </ul>
      {result.ref && <p className="mt-1 text-xs text-gray-500">Reference: {result.ref}</p>}
    </Alert>
  );
}

/**
 * Reason + note dialog shared by every action (close a row, mark nedopadlo, reopen, resolve a doplatek).
 * `onSubmit` returns an ERP result to show (the dialog stays open then) or void to close.
 */
export function ReasonDialog({
  title,
  intro,
  reasons,
  noteRequiredFor,
  noteLabel = 'Poznámka',
  noteMin = 0,
  noReason,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  intro?: ReactNode;
  reasons?: Record<string, string>;
  noteRequiredFor?: string[];
  noteLabel?: string;
  noteMin?: number;
  noReason?: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (v: { reason: string; note: string }) => Promise<ActionResult | void>;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const noteNeeded = noteMin > 0 || (noteRequiredFor ?? []).includes(reason);
  const trimmed = note.trim();
  const valid = (noReason || !!reason) && (!noteNeeded || trimmed.length >= Math.max(1, noteMin));

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await onSubmit({ reason, note: trimmed });
      if (r) {
        setResult(r);
        if (r.outcome === 'done') window.setTimeout(onClose, 2200);
      } else onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {intro && <div className="text-gray-700">{intro}</div>}
        {reasons && !noReason && (
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Důvod</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} mt-1 w-full`}>
              <option value="">Vyberte důvod…</option>
              {Object.entries(reasons).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">
            {noteLabel}
            {noteNeeded ? ' – povinné pole' : ' – nepovinné'}
          </span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={`${inputCls} mt-1 w-full`} />
        </label>
        {error && <Alert tone="red">{error}</Alert>}
        {result && <StepsPanel result={result} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>
            {result ? 'Zavřít' : 'Zrušit'}
          </button>
          {(!result || result.outcome !== 'done') && (
            <button type="button" disabled={!valid || busy} onClick={() => void go()} className={btnPrimary}>
              {busy ? 'Ukládám…' : result ? 'Zkusit znovu' : submitLabel}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ExtLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
      {children}
    </a>
  );
}

/** Links of one visit into the ERP web (order, event, claim); nothing when the backend gave no base URL. */
export function EventLinks({ ev, claimId }: { ev: EventView; claimId?: number | null }) {
  const { meta } = useMeta();
  const base = meta?.erpWebBaseUrl;
  const claim = claimId ?? ev.claim?.id ?? ev.complaintId ?? null;
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      <ExtLink href={erpOrderUrl(base, ev.orderId)}>Zakázka</ExtLink>
      <ExtLink href={erpClaimUrl(base, claim)}>Reklamace</ExtLink>
      <ExtLink href={erpEventUrl(base, ev.id, ev.day)}>Událost</ExtLink>
    </span>
  );
}

export function ErpOrderLink({ orderId, children }: { orderId: number | null; children?: ReactNode }) {
  const { meta } = useMeta();
  const href = erpOrderUrl(meta?.erpWebBaseUrl, orderId);
  if (!orderId) return <span className="text-gray-400">—</span>;
  if (!href) return <span className="tabular-nums text-gray-700">{children ?? `#${orderId}`}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="tabular-nums text-blue-600 hover:underline">
      {children ?? `#${orderId}`}
    </a>
  );
}
