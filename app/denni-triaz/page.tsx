import { AppLayout } from '../components/layout/AppLayout';
import { DenniTriazClient } from '../components/denni-triaz/DenniTriazClient';

/**
 * Denní triáž — order-centric day view. See all of a day's zakázky (by zaměření
 * date) and give each a disposition (Nedopadlo / Na retenci / Ponechat), driving
 * the day to "vše zkontrolováno". Superset of Problematické zakázky.
 */
export default function DenniTriazPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Denní triáž</h1>
          <p className="mt-2 text-gray-600">
            Všechny zakázky z daného dne (dle zaměření). Roztřiďte neúspěšné —
            ty co neprošly tabletem nebo skončily neúspěchem — a dotáhněte den na
            „vše zkontrolováno“.
          </p>
        </div>
        <DenniTriazClient />
      </main>
    </AppLayout>
  );
}
