import { AppLayout } from '../components/layout/AppLayout';
import { TeamsManagerClient } from '../components/teams/TeamsManagerClient';

/**
 * Správa týmů — OVT týmy (vedoucí = OVT TL, členové = OVT) a MVT týmy (vedoucí =
 * MVT TL, členové = montéři z registru mvt-mapa), používané jako filtr portálu.
 */
export default function TymyPage() {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Týmy</h1>
          <p className="mt-2 text-gray-600">
            Sdílené týmy pro filtrování portálu. OVT tým: vedoucí z uživatelů označených „OVT TL“,
            členové z OVT (uživatelů s propojeným Raynetem). MVT tým: vedoucí z uživatelů označených
            „MVT TL“, členové z registru montérů.
          </p>
        </div>
        <TeamsManagerClient />
      </main>
    </AppLayout>
  );
}
