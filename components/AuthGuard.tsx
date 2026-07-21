'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
      } else {
        setChecked(true);
      }
    };

    checkUser();
  }, [router, supabase]);

  // While checking, still show the page (no full-screen loading)
  // This stops the sidebar from flashing
  if (!checked) {
    return (
      <div className="min-h-screen bg-zinc-950">
        {children}
      </div>
    );
  }

  return <>{children}</>;
}