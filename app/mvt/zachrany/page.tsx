import { AppLayout } from '../../components/layout/AppLayout';
import { MvtZachranyClient } from '../../components/mvt/MvtZachranyClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Záchrany</h1>
        <p className="mb-6 mt-2 text-gray-600">
          Zakázky, které montér dokončil se záchranou — i s popisem, co bylo špatně a jak to na místě zachránil.
        </p>
        <MvtZachranyClient />
      </main>
    </AppLayout>
  );
}
