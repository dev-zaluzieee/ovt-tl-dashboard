import { AppLayout } from '../components/layout/AppLayout';
import { HiddenOrdersClient } from '../components/hidden-orders/HiddenOrdersClient';

/**
 * Skryté zakázky — orders the TL has already confirmed (nedopadlo | retence)
 * via the batch flow on /problematicke-zakazky. They're kept out of the daily
 * TL queue but the underlying state (ERP status / Raynet tags) is unchanged.
 *
 * Per-row actions:
 *   → Do retence  — un-hide + RetentionService.send in one atomic call.
 *   → Happy path  — deep-link to ceniky-2 /objednavka/[id]; the TRIÁŽ modal
 *                    there orchestrates happy path. Confirmation is auto-
 *                    cleaned up when happy path succeeds (server-side hook).
 */
export default function SkryteZakazkyPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Skryté zakázky</h1>
          <p className="mt-2 text-gray-600">
            Zakázky, které TL potvrdil (nedopadlo / retence) přes batch akci.
            Skryté jen z fronty problematických — sdílený stav v ERP a Raynetu
            zůstává, ostatní jej vidí normálně.
          </p>
        </div>
        <HiddenOrdersClient />
      </main>
    </AppLayout>
  );
}
