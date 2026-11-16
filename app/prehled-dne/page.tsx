import { Suspense } from 'react';
import { AppLayout } from '@/app/components/shell/AppLayout';
import { OvtDayClient } from '@/app/components/ovt/OvtDayClient';
import { Skeleton } from '@/app/components/ui/kit';

export default function Page() {
  return (
    <AppLayout>
      <Suspense fallback={<main className="container mx-auto px-4 py-8"><Skeleton /></main>}>
        <OvtDayClient />
      </Suspense>
    </AppLayout>
  );
}
