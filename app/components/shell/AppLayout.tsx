'use client';

import type { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { MetaProvider, useMeta } from './MetaContext';
import { startText } from '@/lib/startText';

function StartNote() {
  const { meta } = useMeta();
  if (!meta) return null;
  return (
    <div className="border-b border-gray-100 bg-gray-50">
      <p className="container mx-auto px-4 py-1 text-xs text-gray-500">
        {meta.testMode ? <span className="font-semibold text-amber-800">Zkušební provoz: </span> : null}
        {startText(meta)}
      </p>
    </div>
  );
}

/** Shell: top bar with the OVT / MVT switch, green navigation, the backend's vocabulary ("meta") for every page. */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <MetaProvider>
        <Navigation />
        <StartNote />
        {children}
      </MetaProvider>
    </div>
  );
}
