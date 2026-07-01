import { AppLayout } from '../../components/layout/AppLayout';
import { KlientCardClient } from '../../components/retention/KlientCardClient';

/** Karta zákazníka (ported from the office portal; reuses the shared backend endpoint). */
export default async function KlientCardPage({
  params,
}: {
  params: Promise<{ raynetCompanyId: string }>;
}) {
  const { raynetCompanyId } = await params;
  const id = parseInt(raynetCompanyId, 10);
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-6">
        <KlientCardClient raynetCompanyId={id} />
      </main>
    </AppLayout>
  );
}
