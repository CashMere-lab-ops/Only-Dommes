'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BackHome from '../../components/BackHome';
import AgeTermsTicks from '../../components/AgeTermsTicks';
import { createClient } from '../../lib/supabase';

function cleanUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function SetupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const type = params.get('type') === 'creator' ? 'creator' : 'sub';
  const [username, setUsername] = useState('');
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    const name = cleanUsername(username);
    if (name.length < 3) {
      setMessage('Username must be at least 3 characters.');
      return;
    }
    if (!age || !terms) {
      setMessage('Tick both boxes to continue.');
      return;
    }

    setLoading(true);
    setMessage('');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/signup?type=${type}`);
      return;
    }

    const { data: taken } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', name)
      .neq('id', user.id)
      .maybeSingle();
    if (taken) {
      setMessage('That username is taken.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: name,
      display_name: name,
      account_type: type,
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <BackHome />
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">Choose your username</h1>
        <p className="text-zinc-400 text-center mb-8">
          {type === 'creator' ? 'Creator account' : 'Subscriber account'}
        </p>
        <div className="bg-zinc-900 p-8 rounded-3xl space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(cleanUsername(e.target.value))}
              placeholder="yourname"
              className="w-full p-4 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            />
          </div>
          <AgeTermsTicks age={age} setAge={setAge} terms={terms} setTerms={setTerms} />
          <button
            onClick={() => void save()}
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-700 py-4 rounded-2xl text-lg font-semibold"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
          {message && <p className="text-center text-sm text-zinc-300">{message}</p>}
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <SetupForm />
    </Suspense>
  );
}
