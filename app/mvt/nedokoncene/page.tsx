import { AppLayout } from '../../components/layout/AppLayout';
import { MvtOpenClient } from '../../components/mvt/MvtOpenClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Nedokončené montáže</h1>
        <p className="mb-6 mt-2 text-gray-600">
          Montáže po termínu bez výsledku, nezdařené zápisy do ERP a reklamace čekající na založení navazující události. „Vyřízeno“ položku skryje.
        </p>
        <MvtOpenClient />
      </main>
    </AppLayout>
  );
}
