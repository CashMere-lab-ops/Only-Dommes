'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../lib/supabase';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Read account type from URL
  const accountType = searchParams.get('type') as 'creator' | 'sub' || 'sub';

  console.log("🔍 Account type from URL:", accountType);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  const checkUsername = async (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(clean);

    if (clean.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', clean)
      .maybeSingle();

    setUsernameAvailable(!data);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username || username.length < 3) {
      setError('Username must be at least 3 characters');
      setLoading(false);
      return;
    }

    if (usernameAvailable === false) {
      setError('That username is already taken');
      setLoading(false);
      return;
    }

    try {
      console.log("Creating user with account_type:", accountType);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.toLowerCase(),
            display_name: displayName || username,
            account_type: accountType,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup failed');

      await new Promise(resolve => setTimeout(resolve, 800));

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          username: username.toLowerCase(),
          display_name: displayName || username,
          account_type: accountType,
        })
        .eq('id', authData.user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
      } else {
        console.log("✅ Successfully saved account_type as:", accountType);
      }

      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignup} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block">Username</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
          <input
            type="text"
            value={username}
            onChange={(e) => checkUsername(e.target.value)}
            placeholder="yourusername"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-8 pr-4 outline-none focus:border-pink-500"
            required
          />
        </div>
        {username.length >= 3 && (
          <p className={`text-xs mt-1.5 ${usernameAvailable ? 'text-green-400' : 'text-red-400'}`}>
            {usernameAvailable === null
              ? ''
              : usernameAvailable
              ? '✓ Username is available'
              : '✗ Username is already taken'}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How you want to be known"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500"
        />
      </div>

      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500"
          required
        />
      </div>

      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500"
          required
          minLength={6}
        />
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || usernameAvailable === false}
        className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
      >
        {loading ? 'Creating account...' : 'Create Account'}
      </button>
    </form>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">♕</span>
            </div>
            <span className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
              Only Dommes
            </span>
          </div>
          <p className="text-zinc-400">Create your account</p>
        </div>

        <Suspense fallback={<div className="text-center py-10">Loading...</div>}>
          <SignupForm />
        </Suspense>

        <p className="text-center text-sm text-zinc-400 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-pink-400 hover:text-pink-300">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}