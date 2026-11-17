import { notFound } from 'next/navigation';
import { AppLayout } from '@/app/components/shell/AppLayout';
import { PersonCashClient } from '@/app/components/cash/PersonCashClient';
import { isCashId } from '@/lib/cash-routes';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isCashId(id)) notFound();
  return (
    <AppLayout>
      <PersonCashClient personId={Number(id)} />
    </AppLayout>
  );
}
