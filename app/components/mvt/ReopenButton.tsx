'use client';

import { useState } from 'react';
import { tlSend } from '@/lib/tl-api';
import { parseAction } from '@/lib/tl-parse';
import type { EventView } from '@/lib/types';
import { ReasonDialog, btnAmber } from '@/app/components/ui/kit';

/** "Otevřít k opravě": ERP reopen-visit with a mandatory reason, as the signed-in person. Only for a closed visit. */
export function ReopenButton({ ev, onDone }: { ev: EventView; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  // the ERP decides what can be reopened (it has no legacy rule): a visit taken over from the old systems is reopened like any other.
  // Only a completed visit: state `closed_from_order` is closed by the order while the visit is scheduled (the server answers 409 NOT_CLOSED).
  if (!ev.state.closed || ev.status !== 'completed') return null;
  return (
    <>
      <button type="button" className={btnAmber} onClick={() => setOpen(true)} title="Vrátí návštěvu do stavu naplánováno, aby šel výsledek znovu zapsat. Dosavadní výsledek zůstane v historii oprav.">
        Otevřít k opravě
      </button>
      {open && (
        <ReasonDialog
          title="Otevřít k opravě"
          intro={<>{ev.customer?.name ?? ev.title ?? `Událost ${ev.id}`} · {ev.typeLabel}. Důvod uvidí montér i kancelář a zůstane v seznamu Opravy.</>}
          noReason
          noteMin={3}
          noteLabel="Důvod"
          submitLabel="Otevřít k opravě"
          onClose={() => {
            setOpen(false);
            onDone();
          }}
          onSubmit={async ({ note }) => parseAction(await tlSend('POST', `mvt/events/${ev.id}/reopen`, { reason: note }))}
        />
      )}
    </>
  );
}
