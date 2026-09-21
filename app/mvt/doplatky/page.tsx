import { AppLayout } from '../../components/layout/AppLayout';
import { MvtDoplatkyClient } from '../../components/mvt/MvtDoplatkyClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Doplatky</h1>
        <p className="mb-6 mt-2 text-gray-600">
          Zápisy z aplikace, kde vybraná částka nesedí s očekávaným doplatkem, a platby fakturou ke kontrole. Položka zůstává, dokud ji neoznačíte jako vyřízenou — i když ji kancelář mezitím opravila v ERP.
        </p>
        <MvtDoplatkyClient />
      </main>
    </AppLayout>
  );
}
