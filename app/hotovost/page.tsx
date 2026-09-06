import { AppLayout } from '../components/layout/AppLayout';
import { CashOverviewClient } from '../components/cash/CashOverviewClient';

/**
 * Hotovost — read-only view of OVT cash balances for team leaders. Data comes
 * from the finance app (vyuctovani) through ceniky-2 /api/admin/cash. TLs see
 * the same numbers finance sees; all actions (párování, storno, inventura)
 * stay with finance.
 */
export default function HotovostPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Hotovost</h1>
          <p className="mt-2 text-gray-600">
            Kolik hotovosti mají OVT u sebe, co je po termínu (vklad do banky do neděle) a kdo
            ještě čeká na inventuru od financí.
          </p>
        </div>
        <CashOverviewClient />
      </main>
    </AppLayout>
  );
}
