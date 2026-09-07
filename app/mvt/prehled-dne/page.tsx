import { AppLayout } from '../../components/layout/AppLayout';
import { MvtDayClient } from '../../components/mvt/MvtDayClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Přehled dne — montéři</h1>
        <p className="mb-6 mt-2 text-gray-600">Montáže, servisy a reklamace dne po montérech, se stavem dokončení z aplikace. Jen ke čtení.</p>
        <MvtDayClient />
      </main>
    </AppLayout>
  );
}
