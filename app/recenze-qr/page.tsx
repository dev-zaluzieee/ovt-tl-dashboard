import { AppLayout } from '@/app/components/shell/AppLayout';
import { PageHeader } from '@/app/components/ui/kit';
import { ReviewQrClient } from '@/app/components/review-qr/ReviewQrClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <PageHeader title="Recenze QR" subtitle="QR na recenzi, který tablet ukáže po uzavření zakázky na místě." />
        <ReviewQrClient />
      </main>
    </AppLayout>
  );
}
