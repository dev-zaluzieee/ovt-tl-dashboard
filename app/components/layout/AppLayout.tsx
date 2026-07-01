import { Navigation } from '../navigation/Navigation';

/** Shell matching frontend-admin: top bar + green nav. */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      {children}
    </div>
  );
}
