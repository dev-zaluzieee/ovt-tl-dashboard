'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from './components/layout/AppLayout';
import { useWorkforce } from './components/workforce/WorkforceContext';

/** Root just forwards to the remembered workforce's landing page (/ovt or /mvt). */
export default function Home() {
  const router = useRouter();
  const { workforce, ready } = useWorkforce();
  useEffect(() => {
    if (ready) router.replace(workforce === 'mvt' ? '/mvt' : '/ovt');
  }, [ready, workforce, router]);
  return (
    <AppLayout>
      <main className="container mx-auto max-w-5xl px-4 py-10 text-gray-500">Načítám…</main>
    </AppLayout>
  );
}
