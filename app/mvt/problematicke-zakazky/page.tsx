import { AppLayout } from '../../components/layout/AppLayout';
import { MvtProblemsClient } from '../../components/mvt/MvtProblemsClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Problematické zakázky</h1>
        <p className="mb-6 mt-2 text-gray-600">
          Co potřebuje rozhodnutí team leadera: eskalace od financí a kanceláře, zápisy s nesedícím doplatkem a žádosti montérů o otevření k opravě. Každou položku uzavřete s důvodem.
        </p>
        <MvtProblemsClient />
      </main>
    </AppLayout>
  );
}
