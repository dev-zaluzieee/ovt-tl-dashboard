import { notFound } from 'next/navigation';
import { AppLayout } from '@/app/components/shell/AppLayout';
import { CustomerCallsClient } from '@/app/components/calls/CustomerCallsClient';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) notFound();
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <CustomerCallsClient kind="order" id={n} />
      </main>
    </AppLayout>
  );
}
