import { AppLayout } from '../../../components/layout/AppLayout';
import { MvtLogDetailClient } from '../../../components/mvt/MvtLogDetailClient';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <MvtLogDetailClient id={id} />
      </main>
    </AppLayout>
  );
}
