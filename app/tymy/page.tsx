import { AppLayout } from '../components/layout/AppLayout';
import { TeamsManagerClient } from '../components/teams/TeamsManagerClient';

/**
 * Správa týmů — sdílené týmy (vedoucí = OVT TL, členové = OVT) používané jako
 * filtr na dashboardu vedoucích týmů.
 */
export default function TymyPage() {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Týmy</h1>
          <p className="mt-2 text-gray-600">
            Sdílené týmy pro filtrování dashboardu. Vedoucí se vybírá z uživatelů
            označených „OVT TL“, členové z OVT (uživatelů s propojeným Raynetem).
          </p>
        </div>
        <TeamsManagerClient />
      </main>
    </AppLayout>
  );
}
