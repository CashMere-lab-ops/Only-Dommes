'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createClient } from '../../../lib/supabase';

function ResultContent() {
  const params = useSearchParams();
  const status = params.get('status') === 'success' ? 'success' : 'failed';
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const retry = async () => {
    setLoading(true);
    setMessage('');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      window.location.href = '/login';
      return;
    }
    const response = await fetch('/api/agego/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.redirect) {
      setMessage(result.error || 'Unable to restart verification. Please try again.');
      setLoading(false);
      return;
    }
    window.location.href = result.redirect;
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl bg-zinc-900 p-8 text-center space-y-5">
        {status === 'success' ? (
          <>
            <div className="text-4xl">✓</div>
            <h1 className="text-2xl font-bold">Age verification successful</h1>
            <p className="text-zinc-400">AgeGO has confirmed your age. You can now continue to World of Dommes.</p>
            <Link href="/" className="block rounded-2xl bg-pink-500 px-5 py-4 font-semibold">Continue</Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Age verification not completed</h1>
            <p className="text-zinc-400">We couldn't confirm your age verification. Your account remains restricted until verification succeeds.</p>
            <button onClick={() => void retry()} disabled={loading} className="w-full rounded-2xl bg-pink-500 px-5 py-4 font-semibold disabled:bg-zinc-700">
              {loading ? 'Starting...' : 'Try again'}
            </button>
            <Link href="/login" className="block text-pink-400">Log in</Link>
          </>
        )}
        {message && <p className="text-sm text-zinc-300">{message}</p>}
      </section>
    </main>
  );
}

export default function AgeVerificationResultPage() {
  return <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}><ResultContent /></Suspense>;
}
