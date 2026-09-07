import { AppLayout } from '../../components/layout/AppLayout';
import { MvtLogsClient } from '../../components/mvt/MvtLogsClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Zápisy z aplikace</h1>
        <p className="mb-6 mt-2 text-gray-600">Každé odeslání výsledku z aplikace montérů a co se kam zapsalo (Raynet, ERP, hotovost).</p>
        <MvtLogsClient />
      </main>
    </AppLayout>
  );
}
