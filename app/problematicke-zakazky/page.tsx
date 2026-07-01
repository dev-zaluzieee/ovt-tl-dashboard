import { AppLayout } from '../components/layout/AppLayout';
import { ProblematicOrdersClient } from '../components/problematic-orders/ProblematicOrdersClient';

/**
 * Problematické zakázky — zakázky za posledních 14 dní (s 2denním odkladem),
 * které nejsou v systému, nemají exportovaný ADMF, nebo jsou označené
 * „Nezastižen / přeložit".
 */
export default function ProblematickeZakazkyPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Problematické zakázky</h1>
          <p className="mt-2 text-gray-600">
            Nevyřízené zakázky v posledních 2 dnech: chybí v systému,
            nemají exportovaný ADMF, nebo jsou označené „Nezastižen / přeložit“.
          </p>
        </div>
        <ProblematicOrdersClient />
      </main>
    </AppLayout>
  );
}
