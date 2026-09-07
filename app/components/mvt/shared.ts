/** Shared types/labels for the MVT side of the team-leader portal. */
export type AppState = 'unassigned' | 'planned' | 'in_progress' | 'overdue' | 'done' | 'zachrana' | 'reklamace' | 'failed' | 'closed_raynet';

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
  } | null;
  uploads: number;
  appState: AppState;
  raynetUrl: string;
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
};

export const WORKFLOW_LABEL: Record<string, string> = { montaz: 'Montáž', reklamace: 'Reklamace' };
export const OUTCOME_LABEL: Record<string, string> = { happy: 'Dokončeno', reklamace: 'Odesláno na reklamace', zachrana: 'Dokončeno se záchranou' };

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
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
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
