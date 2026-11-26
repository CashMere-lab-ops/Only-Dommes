'use client';

import { useState } from 'react';
import { createClient } from '../../../lib/supabase';

export default function AgeVerificationPendingPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const start = async () => {
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
      setMessage(result.error || 'Unable to start verification. Please try again.');
      setLoading(false);
      return;
    }
    window.location.href = result.redirect;
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl bg-zinc-900 p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold">Age verification required</h1>
        <p className="text-zinc-400">Please complete AgeGO verification before accessing World of Dommes.</p>
        <button onClick={() => void start()} disabled={loading} className="inline-block rounded-2xl bg-pink-500 px-5 py-4 font-semibold disabled:bg-zinc-700">
          {loading ? 'Starting...' : 'Continue verification'}
        </button>
        {message && <p className="text-sm text-zinc-300">{message}</p>}
        <a href="/login" className="block text-pink-400">Log in to another account</a>
      </section>
    </main>
  );
}
