/** Shared types/labels for the MVT side of the team-leader portal. */
export type AppState = 'unassigned' | 'planned' | 'in_progress' | 'overdue' | 'done' | 'zachrana' | 'reklamace' | 'failed' | 'closed_raynet' | 'reopened';

export interface TlPerson {
  raynetId: number;
  name: string;
}
export interface TlDayEvent {
  id: number;
  scheduledFrom: string | null;
  scheduledTill: string | null;
  categoryId: number | null;
  categoryLabel: string;
  title: string | null;
  customer: string | null;
  address: string | null;
  status: string | null;
  stavZakazky: string | null;
  monterName: string | null;
  monters: TlPerson[];
  orderId: number | null;
  zamerovac: { email: string; name: string } | null;
  outcome: {
    id: number;
    outcome: 'happy' | 'reklamace' | 'zachrana';
    status: string;
    createdAt: string;
    vybranoKolik: number | null;
    zpusobUhrady: string | null;
    slevaMvt: number | null;
    duvod?: string | null;
  } | null;
  uploads: number;
  appState: AppState;
  raynetUrl: string;
  /** Active / recent reopen ("Otevřít k opravě") of the event. */
  reopen?: { id: number; status: 'requested' | 'open' | 'used' | 'expired' | 'declined' | 'cancelled'; isOpen: boolean; expiresAt: string | null; openReason: string | null; openedBy: string | null } | null;
}

export const STATE_UI: Record<AppState, { label: string; cls: string }> = {
  unassigned: { label: 'Bez montéra (fronta)', cls: 'bg-gray-100 text-gray-500' },
  planned: { label: 'Naplánováno', cls: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'Probíhá', cls: 'bg-blue-100 text-blue-800' },
  overdue: { label: 'Po termínu bez výsledku', cls: 'bg-rose-100 text-rose-800' },
  done: { label: 'Dokončeno', cls: 'bg-green-100 text-green-800' },
  zachrana: { label: 'Se záchranou', cls: 'bg-amber-100 text-amber-800' },
  reklamace: { label: 'Odesláno na reklamace', cls: 'bg-rose-100 text-rose-800' },
  failed: { label: 'Zápis selhal', cls: 'bg-red-100 text-red-800' },
  closed_raynet: { label: 'Uzavřeno v Raynetu', cls: 'bg-gray-200 text-gray-700' },
  reopened: { label: 'Otevřeno k opravě', cls: 'bg-amber-100 text-amber-800' },
};

export const WORKFLOW_LABEL: Record<string, string> = { montaz: 'Montáž', reklamace: 'Reklamace', servis: 'Servis', placena_oprava: 'Placená oprava' };
export const OUTCOME_LABEL: Record<string, string> = { happy: 'Dokončeno', reklamace: 'Odesláno na reklamace', zachrana: 'Dokončeno se záchranou' };

export const OUTCOME_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Čeká',
  SENDING: 'Zapisuje se',
  SUCCESS: 'Zapsáno',
  PARTIAL_SUCCESS: 'Zapsáno · ERP nezapsáno',
  FAILED: 'Selhalo',
  SUPERSEDED: 'Nahrazeno opravou',
};

export function statusClasses(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'bg-green-100 text-green-800';
    case 'PARTIAL_SUCCESS':
      return 'bg-amber-100 text-amber-800';
    case 'FAILED':
      return 'bg-red-100 text-red-800';
    case 'SENDING':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  // Postgres text timestamps look like "2026-09-21 12:21:02.631086+00" — JS needs
  // "T", at most 3 fraction digits and a "+00:00" offset.
  const norm = iso
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(norm);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtTime(iso: string | null): string {
  return iso && iso.length >= 16 ? iso.slice(11, 16) : '—';
}
export function fmtKc(n: number | null | undefined): string {
  return n == null ? '—' : `${new Intl.NumberFormat('cs-CZ').format(Math.round(n))} Kč`;
}
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Team filter: an event belongs to the team when one of its montéři is a member (by Raynet id). */
export function eventInTeam(e: TlDayEvent, memberRaynetIds: string[] | null): boolean {
  if (!memberRaynetIds) return true;
  const set = new Set(memberRaynetIds.map(String));
  return e.monters.some((m) => set.has(String(m.raynetId)));
}
