import { AppLayout } from '../components/layout/AppLayout';
import { MvtOverviewClient } from '../components/mvt/MvtOverviewClient';

/** MVT landing = Přehled: warnings needing the team leader, reopened events, then the section tiles. */
export default function MvtHome() {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Montéři (MVT) — Přehled</h1>
          <p className="mt-2 text-gray-600">Co dnes potřebuje vaše rozhodnutí. Podrobnosti najdete na jednotlivých stránkách.</p>
        </header>
        <MvtOverviewClient />
      </main>
    </AppLayout>
  );
}
