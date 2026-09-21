/** Shared bits for the reopen ("Otevřít k opravě") actions in the TL portal. */
export interface ReopenInfo {
  id: number;
  status: 'requested' | 'open' | 'used' | 'expired' | 'declined' | 'cancelled';
  isOpen: boolean;
  expiresAt: string | null;
  openReason: string | null;
  openedBy: string | null;
  openedAt: string | null;
  requestReason: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  supersededOutcomeId: number | null;
  usedByOutcomeId: number | null;
  windowHours: number;
}
export interface ReopenLogRow {
  id: number;
  reopen_id: number | null;
  event_id: number;
  at: string;
  actor: string;
  action: string;
  detail: unknown;
}
export interface TlReopenItem extends ReopenInfo {
  eventId: number;
  hoursLeft: number | null;
  log: ReopenLogRow[];
}

export const REOPEN_STATUS_UI: Record<ReopenInfo['status'], { label: string; cls: string }> = {
  requested: { label: 'Žádost čeká', cls: 'bg-sky-100 text-sky-800' },
  open: { label: 'Otevřeno k opravě', cls: 'bg-amber-100 text-amber-800' },
  used: { label: 'Opraveno', cls: 'bg-green-100 text-green-800' },
  expired: { label: 'Vypršelo', cls: 'bg-gray-200 text-gray-700' },
  declined: { label: 'Zamítnuto', cls: 'bg-rose-100 text-rose-800' },
  cancelled: { label: 'Zrušeno', cls: 'bg-gray-100 text-gray-600' },
};
export const REOPEN_ACTION_LABEL: Record<string, string> = {
  requested: 'montér požádal o otevření',
  opened: 'TL otevřel k opravě',
  approved: 'TL schválil žádost',
  declined: 'TL zamítl žádost',
  cancelled: 'otevření zrušeno',
  request_cancelled: 'montér zrušil žádost',
  expired: 'okno vypršelo',
  resubmission_started: 'montér odesílá opravu',
  resubmitted: 'oprava zapsána',
  cash_reconciled: 'hotovost srovnána',
};

export function hoursLeftLabel(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'vypršelo';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `${h} h ${m} min` : `${m} min`;
}

/** TL opens an event for correction (prompt for the reason). Returns true when done. */
export async function openForCorrection(eventId: number, label: string): Promise<boolean> {
  const reason = window.prompt(`Otevřít k opravě na 48 h — ${label}. Důvod (povinný, uvidí ho montér i kancelář):`, '');
  if (reason == null) return false;
  if (reason.trim().length < 3) {
    window.alert('Napište důvod (alespoň 3 znaky).');
    return false;
  }
  const res = await fetch(`/api/mvt-reopens/event/${eventId}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) {
    window.alert(j?.error || j?.message || `Otevření se nepodařilo (HTTP ${res.status}).`);
    return false;
  }
  return true;
}
export async function reopenAction(id: number, action: 'approve' | 'decline' | 'cancel', note: string | null): Promise<boolean> {
  const res = await fetch(`/api/mvt-reopens/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) {
    window.alert(j?.error || j?.message || `Akce se nepodařila (HTTP ${res.status}).`);
    return false;
  }
  return true;
}
