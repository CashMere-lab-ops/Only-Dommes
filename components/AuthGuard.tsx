'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase';

/**
 * Protects pages that need a logged-in user.
 * Redirects to /login?next=<current path> so users return after auth.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        const next = pathname && pathname !== '/login' ? pathname : '/';
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setOk(true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, supabase.auth]);

  if (!ready || !ok) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
