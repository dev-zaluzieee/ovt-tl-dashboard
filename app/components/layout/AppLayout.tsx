import { Navigation } from '../navigation/Navigation';
import { WorkforceProvider } from '../workforce/WorkforceContext';

/** Shell matching frontend-admin: top bar + green nav, with the OVT/MVT workforce choice. */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkforceProvider>
      <div className="min-h-screen bg-white">
        <Navigation />
        {children}
      </div>
    </WorkforceProvider>
  );
}
