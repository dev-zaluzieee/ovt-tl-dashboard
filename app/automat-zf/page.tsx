import { AppLayout } from '../components/layout/AppLayout';
import { AutomatZfClient } from '../components/automat-zf/AutomatZfClient';

/**
 * Automat ZF — same monitoring the office retention module has: which
 * unpaid převodem / fakturou zálohy the ceniky-2 batch will send to the
 * retention queue at the next weekday 06:00 run, what it watches and why not
 * yet, the history of runs, and the TL overrides (poslat hned / odložit).
 */
export default function AutomatZfPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Automat ZF</h1>
          <p className="mt-2 text-gray-600">
            Neuhrazené zálohy převodem / fakturou jdou 5 dní po vystavení zálohové faktury automaticky do
            fronty retencí (všední den 6:00). Tady vidíte, co půjde v příští dávce a co už automat poslal;
            zakázku můžete poslat hned nebo odložit.
          </p>
        </div>
        <AutomatZfClient />
      </main>
    </AppLayout>
  );
}
