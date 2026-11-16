'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Root forwards to the remembered side's landing page (/ovt or /mvt). */
export function Home() {
  const router = useRouter();
  useEffect(() => {
    let side = 'ovt';
    try {
      side = localStorage.getItem('tl-side') === 'mvt' ? 'mvt' : 'ovt';
    } catch {
      /* storage may be blocked */
    }
    router.replace(side === 'mvt' ? '/mvt' : '/ovt');
  }, [router]);
  return <main className="container mx-auto max-w-5xl px-4 py-10 text-gray-500">Načítám…</main>;
}
