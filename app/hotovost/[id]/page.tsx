import { notFound } from 'next/navigation';
import { AppLayout } from '../../components/layout/AppLayout';
import { PersonCashClient } from '../../components/cash/PersonCashClient';

/** One person's full cash ledger (read-only mirror of finance /osoby/[id]). */
export default async function PersonCashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = parseInt(id, 10);
  if (!Number.isFinite(personId) || personId < 1) notFound();
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <PersonCashClient personId={personId} />
      </main>
    </AppLayout>
  );
}
