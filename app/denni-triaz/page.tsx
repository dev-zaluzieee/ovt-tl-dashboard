import { AppLayout } from '../components/layout/AppLayout';
import { DenniTriazClient } from '../components/denni-triaz/DenniTriazClient';

/**
 * Triáž zakázek — windowed queue of orders (by zaměření date). Every zakázka in
 * the window gets a disposition (Nedopadlo / Na retenci / Ponechat), driving
 * the queue to empty. Filterable by nedopadlo reason. Superset of
 * Problematické zakázky. Route kept as /denni-triaz for link stability.
 */
export default function DenniTriazPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Triáž zakázek</h1>
          <p className="mt-2 text-gray-600">
            Fronta zakázek za zvolené období (dle zaměření). Roztřiďte neúspěšné —
            ty co neprošly tabletem nebo skončily neúspěchem — a dotáhněte frontu
            na nulu. Filtr důvodu ukáže všechny nedopadlé s daným důvodem.
          </p>
        </div>
        <DenniTriazClient />
      </main>
    </AppLayout>
  );
}
