import { Suspense } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { OfficeDayClient } from '../components/office-day/OfficeDayClient';

/**
 * Denní přehled Raynet událostí napříč všemi uživateli s propojeným Raynetem (kancelář / admin).
 * `Suspense`: `OfficeDayClient` používá `useSearchParams` (hluboké odkazy `?date=&person=&view=`).
 */
export default function PrehledDnePage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1E8449]">Přehled dne</h1>
        </div>
        <Suspense
          fallback={
            <div className="space-y-3" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          }
        >
          <OfficeDayClient />
        </Suspense>
      </main>
    </AppLayout>
  );
}
