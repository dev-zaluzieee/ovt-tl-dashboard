import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-server';
import { safeCallbackPath } from '@/lib/safe-callback';
import LoginClient from './LoginClient';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(params.callbackUrl);

  // Already signed in: skip the SSO round trip (not after an auth error).
  const session = await getServerSession();
  if (session && !params.error) redirect(callbackUrl);

  return <LoginClient callbackUrl={callbackUrl} error={params.error ?? null} />;
}
