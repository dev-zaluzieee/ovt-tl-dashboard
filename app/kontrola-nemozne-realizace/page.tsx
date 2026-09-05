import { AppLayout } from '../components/layout/AppLayout';
import { NemoznaRealizaceClient } from '../components/nemozna-realizace/NemoznaRealizaceClient';

/**
 * Kontrola nemožné realizace — TL verification queue. Every zakázka the OVT
 * closed as "nemožná realizace" in the window, minus those a TL already
 * reviewed. Three decisions per order: potvrdit / změnit důvod / na retenci.
 * Replaces the former "Denní triáž" day view (2026-09-05). Backend unchanged:
 * ceniky-2 /api/admin/tl-triage.
 */
export default function KontrolaNemozneRealizacePage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Kontrola nemožné realizace</h1>
          <p className="mt-2 text-gray-600">
            Zakázky, které OVT uzavřel jako „nemožná realizace“. U každé rozhodněte:
            potvrdit důvod, změnit důvod (zapíše se do ERP i Raynetu), nebo poslat
            na retenci. Rozhodnuté zakázky z fronty mizí.
          </p>
        </div>
        <NemoznaRealizaceClient />
      </main>
    </AppLayout>
  );
}
