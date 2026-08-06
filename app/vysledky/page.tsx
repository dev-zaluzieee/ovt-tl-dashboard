import { AppLayout } from '../components/layout/AppLayout';
import { OvtDashboardClient } from '../components/ovt-dashboard/OvtDashboardClient';

/**
 * Výkon OVT — one table, one period control (2026-08-06, Karel). Every order
 * classified by what happened to it (TL intervened / retence / neuzavřeno /
 * success), windowed by zaměření date. Stacked mini-bar per row for
 * cross-OVT scanning; click a name for a donut + order drill-down, the
 * "deep insight into one OVT" half of the job a comparison view can't do.
 */
export default function VysledkyPage() {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <OvtDashboardClient />
      </main>
    </AppLayout>
  );
}
