'use client';

import { useState } from 'react';
import type { ActionResult } from '@/lib/types';
import { tlSend } from '@/lib/tl-api';
import { parseAction } from '@/lib/tl-parse';
import { errorText } from '@/lib/tl-errors';
import { Alert, B2BBadge, Modal, StepsPanel, btnGhost, btnPrimary, btnSmall } from '@/app/components/ui/kit';

/** B2B is a property of the ORDER (ERP column, written through the ERP API as the signed-in person). */
export function B2BControl({ orderId, b2b, onDone }: { orderId: number | null; b2b: boolean | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  if (!orderId) return <span className="text-xs text-gray-400">bez zakázky</span>;
  const next = b2b !== true;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = parseAction(await tlSend('POST', `ovt/orders/${orderId}/b2b`, { value: next }));
      setResult(r);
      if (r.outcome === 'done') onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        {b2b === true ? <B2BBadge b2b /> : <span className="text-xs text-gray-500">{b2b === false ? 'B2C' : 'B2B neuvedeno'}</span>}
        <button type="button" onClick={() => setOpen(true)} className={btnSmall}>
          {b2b === true ? 'Zrušit B2B' : 'Označit B2B'}
        </button>
      </span>
      {open && (
        <Modal
          title="B2B zakázky"
          onClose={() => {
            setOpen(false);
            setResult(null);
            setError(null);
          }}
        >
          <div className="space-y-3 text-sm">
            <p>
              {next ? 'Označit zakázku' : 'Zrušit označení B2B u zakázky'} <b>#{orderId}</b>
              {next ? ' jako B2B?' : '?'} Změna se zapíše do ERP na zakázku (platí pro všechny její návštěvy) a v ERP bude vidět, kdo ji provedl.
            </p>
            {error && <Alert tone="red">{error}</Alert>}
            {result && <StepsPanel result={result} />}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setOpen(false);
                  setResult(null);
                  setError(null);
                }}
              >
                {result ? 'Zavřít' : 'Zrušit'}
              </button>
              {(!result || result.outcome !== 'done') && (
                <button type="button" disabled={busy} onClick={() => void go()} className={btnPrimary}>
                  {busy ? 'Zapisuji…' : result ? 'Zkusit znovu' : next ? 'Označit B2B' : 'Zrušit B2B'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
