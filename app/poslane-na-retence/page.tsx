import { AppLayout } from '../components/layout/AppLayout';
import { TlRetentionSendsClient } from '../components/tl-retention-sends/TlRetentionSendsClient';

/**
 * Poslané na retence — persistent audit list of orders a team leader routed to
 * retention (retention_logs rows with `tl_user_id`). Unlike /skryte-zakazky
 * (which drops rows once un-hidden), this is a durable historical trace: it
 * shows every TL send in the window, who sent it, and whether the retention
 * team has already taken it. Read-only.
 */
export default function PoslaneNaRetencePage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Poslané na retence</h1>
          <p className="mt-2 text-gray-600">
            Historická stopa zakázek, které team leader poslal do retence.
            Na rozdíl od skrytých zakázek zůstává záznam i poté, co si retence
            zakázku převezme.
          </p>
        </div>
        <TlRetentionSendsClient />
      </main>
    </AppLayout>
  );
}
