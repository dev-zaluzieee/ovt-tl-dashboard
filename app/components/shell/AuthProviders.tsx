"use client";

import { SessionProvider } from "next-auth/react";

/**
 * NextAuth session context. Polling /api/auth/session once a minute (and on
 * window focus) is what renews the SSO access token before it expires: that
 * route is where the rotated refresh token can be written back to the cookie.
 */
export function AuthProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
