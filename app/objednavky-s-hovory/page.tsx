import { AppLayout } from '../components/layout/AppLayout';
import { OrdersWithCallsClient } from '../components/orders-with-calls/OrdersWithCallsClient';

/**
 * Objednávky s hovory — landing list of every local order whose phone has
 * matching Daktela calls. Row click deep-links to the customer's calls page.
 */
export default function OrdersWithCallsPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">
            Objednávky s hovory
          </h1>
          <p className="mt-2 text-gray-600">
            Zakázky, jejichž telefonní číslo v místní DB matchuje s hovorem v Daktele.
          </p>
        </div>
        <OrdersWithCallsClient />
      </main>
    </AppLayout>
  );
}
