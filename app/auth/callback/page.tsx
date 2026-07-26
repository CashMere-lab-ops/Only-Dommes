'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<'loading' | 'success' | 'fallback'>('loading');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const token_hash = url.searchParams.get('token_hash');
        const type = url.searchParams.get('type');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });
          if (error) throw error;
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('No session');
        }

        setStatus('success');
        setTimeout(() => router.push('/dashboard'), 800);
      } catch (err) {
        console.error('Auth callback error:', err);
        // Email is still confirmed — just need to log in
        setStatus('fallback');
      }
    };

    handleCallback();
  }, []);

  if (status === 'fallback') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold mb-3">Email confirmed!</h2>
          <p className="text-zinc-400 mb-8">
            Your account is ready. Please log in to continue.
          </p>
          <Link
            href="/login"
            className="inline-block bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 text-white font-semibold py-3 px-8 rounded-xl transition"
          >
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-400">
          {status === 'success' ? 'Email confirmed! Logging you in...' : 'Confirming your email...'}
        </p>
      </div>
    </div>
  );
}