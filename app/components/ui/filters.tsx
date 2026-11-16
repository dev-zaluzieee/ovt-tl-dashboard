'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Person, Side } from '@/lib/types';
import { tlGet } from '@/lib/tl-api';
import { parsePeople } from '@/lib/tl-parse';
import { fmtLongDay, shiftYmd } from '@/lib/format';
import { useLoad } from './useLoad';
import { btnGhost, btnPrimary, inputCls } from './kit';

/** Filters live in the address (shareable, back button works): read with `get`, change with `set` (null/'' removes). */
export function useUrlParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const qs = sp.toString();
  const get = useCallback((k: string) => sp.get(k) ?? '', [sp]);
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams(qs);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') p.delete(k);
        else p.set(k, v);
      }
      const s = p.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [qs, router, pathname],
  );
  return { get, set, qs };
}

/** Person filter on every list: ERP users who own visits of the side (backend `/people`). */
export function PersonSelect({ side, value, onChange }: { side: Side; value: string; onChange: (id: string) => void }) {
  const { data } = useLoad<Person[]>(`people-${side}`, async (signal) => parsePeople(await tlGet('people', { side }, signal)));
  const people = data ?? [];
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">{side === 'ovt' ? 'Obchodník' : 'Montér'}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} min-w-[11rem]`}>
        <option value="">všichni</option>
        {people.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.name}
            {p.active ? '' : ' (neaktivní)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Search box that reports a query only after a pause and only from 3 characters (the backend's minimum). */
export function SearchBox({ value, onChange, placeholder, ignored }: { value: string; onChange: (q: string) => void; placeholder: string; ignored?: boolean }) {
  const [text, setText] = useState(value);
  const cb = useRef(onChange);
  const sent = useRef(value);
  useEffect(() => {
    cb.current = onChange;
  });
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = text.trim();
      const next = q.length >= 3 ? q : '';
      if (next !== sent.current) {
        sent.current = next;
        cb.current(next);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [text]);
  return (
    <div className="relative min-w-[220px] flex-1">
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-[#1E8449] focus:outline-none focus:ring-1 focus:ring-[#1E8449]"
      />
      {text.trim().length > 0 && text.trim().length < 3 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">min. 3 znaky</span>}
      {ignored && <span className="absolute left-0 top-full mt-0.5 text-[11px] text-amber-700">Hledaný text se nepoužil (je kratší než 3 znaky), zobrazuje se vše.</span>}
    </div>
  );
}

export function DayNav({ date, today, onChange }: { date: string; today: string; onChange: (ymd: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange(shiftYmd(date, -1))} className={btnGhost} aria-label="Předchozí den">
        ← Předchozí den
      </button>
      <button type="button" onClick={() => onChange(today)} className={btnPrimary}>
        Dnes
      </button>
      <button type="button" onClick={() => onChange(shiftYmd(date, 1))} className={btnGhost} aria-label="Následující den">
        Následující den →
      </button>
      <input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} className={inputCls} aria-label="Konkrétní datum" />
      <span className="text-sm text-gray-600">{fmtLongDay(date)}</span>
    </div>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="font-medium text-gray-700" htmlFor="range-from">
        Od:
      </label>
      <input id="range-from" type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className={inputCls} />
      <label className="font-medium text-gray-700" htmlFor="range-to">
        Do:
      </label>
      <input id="range-to" type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className={inputCls} />
    </div>
  );
}
