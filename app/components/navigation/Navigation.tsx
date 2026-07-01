'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface User {
  email?: string;
  role?: string;
}

function getCookieValue(cookieName: string): string | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${cookieName}=`))
    ?.split('=')
    .slice(1)
    .join('=');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function Navigation() {
  const router = useRouter();
  const pathname = usePathname();

  const [signingOut, setSigningOut] = useState(false);

  const user = useMemo<User | null>(() => {
    const email = getCookieValue('user_email');
    const role = getCookieValue('user_role');
    if (!email) return null;
    return { email, role: role || undefined };
  }, []);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await fetch('/api/auth/signout', { method: 'POST' });
      router.push('/auth');
      router.refresh();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-block">
              <Image
                src="/logo-zaluzieee.png"
                alt="žaluzieee logo"
                width={384}
                height={94}
                priority
                className="h-8 w-auto"
                unoptimized
              />
            </Link>
          </div>
          <div className="flex items-center gap-6">
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-700">
                  <span className="font-medium">{user.email || 'Uživatel'}</span>
                  {user.role === 'admin' && (
                    <span className="ml-2 px-2 py-1 bg-[#1E8449] text-white text-xs rounded">
                      Admin
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="text-sm text-gray-700 hover:text-[#1E8449] transition-colors"
                >
                  Odhlásit se
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="bg-[#1E8449] text-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-6 flex-wrap">
            <Link
              href="/prehled-dne"
              className={`hover:opacity-80 transition-opacity ${
                pathname === '/prehled-dne' || pathname.startsWith('/prehled-dne/')
                  ? 'font-semibold underline'
                  : ''
              }`}
            >
              Přehled dne
            </Link>
            <Link
              href="/problematicke-zakazky"
              className={`hover:opacity-80 transition-opacity ${
                pathname === '/problematicke-zakazky' ||
                pathname.startsWith('/problematicke-zakazky/')
                  ? 'font-semibold underline'
                  : ''
              }`}
            >
              Problematické zakázky
            </Link>
            <Link
              href="/skryte-zakazky"
              className={`hover:opacity-80 transition-opacity ${
                pathname === '/skryte-zakazky' ||
                pathname.startsWith('/skryte-zakazky/')
                  ? 'font-semibold underline'
                  : ''
              }`}
            >
              Skryté zakázky
            </Link>
            <Link
              href="/vysledky"
              className={`hover:opacity-80 transition-opacity ${
                pathname === '/vysledky' || pathname.startsWith('/vysledky/')
                  ? 'font-semibold underline'
                  : ''
              }`}
            >
              Výsledková tabule
            </Link>
            <Link
              href="/tymy"
              className={`hover:opacity-80 transition-opacity ${
                pathname === '/tymy' || pathname.startsWith('/tymy/')
                  ? 'font-semibold underline'
                  : ''
              }`}
            >
              Týmy
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
