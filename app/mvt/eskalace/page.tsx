import { Suspense } from 'react';
import { AppLayout } from '@/app/components/shell/AppLayout';
import { MvtEscalationsClient } from '@/app/components/mvt/MvtEscalationsClient';
import { Skeleton } from '@/app/components/ui/kit';
import { getFinanceWebOrigin } from '@/lib/finance-url';

// The finance origin comes from the server's environment at request time, not from the build.
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <AppLayout>
      <Suspense fallback={<main className="container mx-auto px-4 py-8"><Skeleton /></main>}>
        <MvtEscalationsClient financeOrigin={getFinanceWebOrigin()} />
      </Suspense>
    </AppLayout>
  );
}
