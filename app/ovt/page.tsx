import { AppLayout } from '@/app/components/shell/AppLayout';
import { Landing } from '@/app/components/shell/Landing';

export default function Page() {
  return (
    <AppLayout>
      <Landing side="ovt" />
    </AppLayout>
  );
}
