/**
 * Escalations from finance (Doklady) to the MVT team leader (backend `GET /api/tl2/mvt/escalations`, `POST .../:id/resolve`).
 * Types, strict parsers and pure helpers; no Next imports (the contract check runs this on the backend's fixtures).
 */

import { TlShapeError, parseEventView } from './tl-parse';
import type { EventView } from './types';

export type EscalationState = 'open' | 'resolved' | 'withdrawn';

export interface Escalation {
  id: number;
  key: string;
  erpEventId: number;
  erpOrderId: number;
  reason: string;
  link: string | null;
  escalatedBy: string;
  escalatedByName: string | null;
  createdAt: string;
  state: EscalationState;
  withdrawnAt: string | null;
  withdrawnBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
}

export const ESCALATION_KEYS = ['id', 'key', 'erpEventId', 'erpOrderId', 'reason', 'link', 'escalatedBy', 'escalatedByName', 'createdAt', 'state', 'withdrawnAt', 'withdrawnBy', 'resolvedAt', 'resolvedBy', 'resolvedByName', 'resolutionNote'] as const;

export interface EscalationRow {
  escalation: Escalation;
  /** The visit as every MVT list shows it; null when it left the dashboard's period. */
  event: EventView | null;
}

export interface Escalations {
  rows: EscalationRow[];
  openCount: number;
  /** The backend's SQL file is not applied yet (empty list). */
  pending: boolean;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown, w: string): Obj => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TlShapeError(w, 'očekáván objekt');
  return v as Obj;
};
const str = (o: Obj, k: string, w: string): string => {
  if (typeof o[k] !== 'string') throw new TlShapeError(`${w}.${k}`, 'očekáván text');
  return o[k] as string;
};
const num = (o: Obj, k: string, w: string): number => {
  if (typeof o[k] !== 'number' || !Number.isFinite(o[k] as number)) throw new TlShapeError(`${w}.${k}`, 'očekáváno číslo');
  return o[k] as number;
};
const opt = (o: Obj, k: string, w: string): string | null => {
  const v = o[k];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new TlShapeError(`${w}.${k}`, 'očekáván text nebo null');
  return v;
};

export function parseEscalation(v: unknown, where = 'escalation'): Escalation {
  const o = obj(v, where);
  const state = o.state;
  if (state !== 'open' && state !== 'resolved' && state !== 'withdrawn') throw new TlShapeError(`${where}.state`, 'neznámý stav');
  return {
    id: num(o, 'id', where), key: str(o, 'key', where), erpEventId: num(o, 'erpEventId', where), erpOrderId: num(o, 'erpOrderId', where),
    reason: str(o, 'reason', where), link: opt(o, 'link', where), escalatedBy: str(o, 'escalatedBy', where), escalatedByName: opt(o, 'escalatedByName', where),
    createdAt: str(o, 'createdAt', where), state, withdrawnAt: opt(o, 'withdrawnAt', where), withdrawnBy: opt(o, 'withdrawnBy', where),
    resolvedAt: opt(o, 'resolvedAt', where), resolvedBy: opt(o, 'resolvedBy', where), resolvedByName: opt(o, 'resolvedByName', where), resolutionNote: opt(o, 'resolutionNote', where),
  };
}

export function parseEscalations(v: unknown): Escalations {
  const o = obj(v, 'escalations');
  if (!Array.isArray(o.rows)) throw new TlShapeError('escalations.rows', 'očekáváno pole');
  return {
    rows: o.rows.map((r, i) => {
      const w = `escalations.rows[${i}]`;
      const ro = obj(r, w);
      return { escalation: parseEscalation(ro.escalation, `${w}.escalation`), event: ro.event === null || ro.event === undefined ? null : parseEventView(ro.event, `${w}.event`) };
    }),
    openCount: typeof o.openCount === 'number' ? o.openCount : 0,
    pending: o.pending === true,
  };
}

export function parseResolved(v: unknown): Escalation {
  return parseEscalation(obj(v, 'resolve').escalation, 'resolve.escalation');
}

export const STATE_LABELS: Record<EscalationState, string> = { open: 'Otevřeno', resolved: 'Vyřešeno', withdrawn: 'Staženo financemi' };

export type EscalationFilter = 'open' | 'all';
export function parseFilter(v: string | null | undefined): EscalationFilter {
  return v === 'all' ? 'all' : 'open';
}

export const NOTE_MIN = 3;
export const NOTE_MAX = 1000;
/** A note is valid when its trimmed text has 3 to 1000 characters (the backend's rule). */
export function noteValid(note: string): boolean {
  const n = note.trim().length;
  return n >= NOTE_MIN && n <= NOTE_MAX;
}

/** Only an https address on the configured finance origin (`FINANCE_WEB_URL`) becomes a link; no origin configured = no link. */
export function safeLink(href: string | null, financeOrigin: string | null | undefined): string | null {
  if (!href || !financeOrigin || !/^https:\/\/[^\s]+$/i.test(href)) return null;
  try {
    return new URL(href).origin === financeOrigin ? href : null;
  } catch {
    return null;
  }
}

export function visibleRows(rows: readonly EscalationRow[], filter: EscalationFilter): EscalationRow[] {
  return filter === 'open' ? rows.filter((r) => r.escalation.state === 'open') : [...rows];
}
