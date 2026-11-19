/**
 * What to tell the team leader after "Otevřít" on a fitter's request. Pure (used by the dialog and the contract check).
 * The ERP outcome alone is not enough: a decline or the fitter's withdraw can win a race during the ERP call, so the
 * visit is open in the ERP while the request says declined / withdrawn.
 */

import { fmtDateTime } from './format';
import type { ActionResult, ReopenRequest } from './types';

export interface ApproveNotice {
  /** `mismatch` = opened in the ERP but the request is not "opened" (warning); `already_open` = nothing was written. */
  kind: 'mismatch' | 'already_open';
  text: string;
}

export function approveNotice(r: Pick<ActionResult, 'outcome' | 'steps'> & { request?: ReopenRequest | null }): ApproveNotice | null {
  if (r.outcome === 'dry' || r.outcome === 'failed') return null;
  const q = r.request ?? null;
  if (q && q.status === 'requested' && r.outcome !== 'done') {
    return { kind: 'mismatch', text: 'Návštěva byla v ERP otevřena k opravě, ale žádost se teď nepodařilo označit jako vyřízenou. Při příštím načtení seznamu se označí jako otevřená sama.' };
  }
  if (q && q.status !== 'opened') {
    const who = [q.decidedByName, q.decidedAt ? fmtDateTime(q.decidedAt) : null].filter(Boolean).join(', ');
    return {
      kind: 'mismatch',
      text: `Pozor: návštěva byla v ERP otevřena k opravě, ale žádost mezitím dostala stav „${q.statusLabel}“${who ? ` (${who})` : ''}. Montér se o otevření z žádosti nedozví, dejte mu vědět. Seznam žádostí se obnoví.`,
    };
  }
  if (r.outcome === 'done' && r.steps.length === 0) return { kind: 'already_open', text: 'Návštěva už byla v ERP otevřená, do ERP se nic nezapisovalo. Žádost je označená jako vyřízená.' };
  return null;
}
