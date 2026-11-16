'use client';

import { useState } from 'react';
import { tlSend } from '@/lib/tl-api';
import { parseAction } from '@/lib/tl-parse';
import type { EventView } from '@/lib/types';
import { ReasonDialog, btnAmber } from '@/app/components/ui/kit';

/** "Otevřít k opravě": ERP reopen-visit with a mandatory reason, as the signed-in person. Only for a closed visit. */
export function ReopenButton({ ev, onDone }: { ev: EventView; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  if (!ev.state.closed) return null;
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
