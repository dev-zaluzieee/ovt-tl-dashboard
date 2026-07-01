import { AppLayout } from '../../../components/layout/AppLayout';
import { CustomerCallsClient } from '../../../components/customer-calls/CustomerCallsClient';

/**
 * Hovory zákazníka — z Daktely přes standalone player backend. TL vidí seznam
 * všech hovorů, které matchují telefony klienta (data ze zdejších orders),
 * a může si je pouštět z nativního audio přehrávače.
 */
export default async function CustomerCallsPage({
  params,
}: {
  params: Promise<{ raynetCompanyId: string }>;
}) {
  const { raynetCompanyId } = await params;
  const id = parseInt(raynetCompanyId, 10);
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-6">
        <CustomerCallsClient raynetCompanyId={id} />
      </main>
    </AppLayout>
  );
}
