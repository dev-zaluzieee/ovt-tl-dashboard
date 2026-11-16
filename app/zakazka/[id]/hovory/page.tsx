import { notFound } from 'next/navigation';
import { AppLayout } from '@/app/components/shell/AppLayout';
import { CustomerCallsClient } from '@/app/components/calls/CustomerCallsClient';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { id } = await params;
  const { q: qRaw } = await searchParams;
  // the search text that found a customer outside the dashboard's scope (forwarded to the backend, which applies the scope rule)
  const q = typeof qRaw === 'string' && qRaw.trim().length >= 3 && qRaw.length <= 100 ? qRaw.trim() : undefined;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) notFound();
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <CustomerCallsClient kind="order" id={n} q={q} />
      </main>
    </AppLayout>
  );
}
