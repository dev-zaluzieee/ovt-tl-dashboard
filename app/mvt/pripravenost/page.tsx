import { Suspense } from 'react';
import { AppLayout } from '@/app/components/shell/AppLayout';
import { MvtReadinessClient } from '@/app/components/mvt/MvtReadinessClient';
import { Skeleton } from '@/app/components/ui/kit';

export default function Page() {
  return (
    <AppLayout>
      <Suspense fallback={<main className="container mx-auto px-4 py-8"><Skeleton /></main>}>
        <MvtReadinessClient />
      </Suspense>
    </AppLayout>
  );
}
