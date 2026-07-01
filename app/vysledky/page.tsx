import { AppLayout } from '../components/layout/AppLayout';
import { ScoreboardClient } from '../components/scoreboard/ScoreboardClient';

/**
 * Výsledková tabule OVT — field funnel (zaměření → objednávky → hodnota) per OVT,
 * pro den (dnes/včera) i měsíc, celkově i po týmech.
 */
export default function VysledkyPage() {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Výsledková tabule</h1>
          <p className="mt-2 text-gray-600">
            Výkon OVT: zaměření, objednávky, konverze, hodnota a problematické zakázky. Přepínejte
            období a filtrujte podle týmu.
          </p>
        </div>
        <ScoreboardClient />
      </main>
    </AppLayout>
  );
}
