import { notFound } from 'next/navigation';
import { AppLayout } from '@/app/components/shell/AppLayout';
import { MvtSubmissionDetail } from '@/app/components/mvt/MvtSubmissionsClient';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) notFound();
  return (
    <AppLayout>
      <MvtSubmissionDetail id={n} />
    </AppLayout>
  );
}
