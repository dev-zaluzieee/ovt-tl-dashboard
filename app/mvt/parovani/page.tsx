import { AppLayout } from '../../components/layout/AppLayout';
import { MvtPairingClient } from '../../components/mvt/MvtPairingClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Párování montáží</h1>
        <p className="mb-6 mt-2 text-gray-600">
          Zítřejší montáže, které systém nedokázal s jistotou spárovat s objednávkou. Montér takovou událost v aplikaci neuzavře, dokud ji tady kancelář nespáruje. Rozhodnutí se zapíše i do popisu události v Raynetu.
        </p>
        <MvtPairingClient />
      </main>
    </AppLayout>
  );
}
