'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BackHome from '../../components/BackHome';
import AgeTermsTicks from '../../components/AgeTermsTicks';
import SiteFooter from '../../components/SiteFooter';
import { createClient } from '../../lib/supabase';

function cleanUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function SignupForm() {
  const params = useSearchParams();
  const type = params.get('type') === 'creator' ? 'creator' : 'sub';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [creatorConfirmed, setCreatorConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    const name = cleanUsername(username);
    if (name.length < 3 || name.length > 24) {
      setMessage('Username must be between 3 and 24 characters.');
      return;
    }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== repeat) {
      setMessage('Passwords do not match.');
      return;
    }
    if (!age || !terms) {
      setMessage('Tick both boxes to continue.');
      return;
    }
    if (type === 'creator' && !creatorConfirmed) {
      setMessage('Creator confirmation is required.');
      return;
    }

    setLoading(true);
    setMessage('');
    const supabase = createClient();

    const { data: taken } = await supabase
      .from('public_profiles')
      .select('id')
      .eq('username', name)
      .maybeSingle();
    if (taken) {
      setMessage('That username is taken.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: name,
          display_name: name,
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data.user && data.session) {
      const { error: setupError } = await supabase.rpc('complete_profile_setup', {
        p_username: name,
        p_account_type: type,
        p_age_confirmed: age,
        p_terms_accepted: terms,
        p_creator_confirmed: type === 'creator' && creatorConfirmed,
      });
      if (setupError) {
        setMessage(setupError.message || 'Account created, but profile setup could not be completed. Please sign in and finish setup.');
        setLoading(false);
        return;
      }
      window.location.href = '/';
      return;
    }

    setMessage('Account created. Check your email to confirm it. After confirming, you will choose your account type and complete the age, terms and Creator confirmations.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <BackHome />
      <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center -mb-4">
          <img src="/logo-icon.png" alt="World of Dommes" className="w-52 h-52 object-contain" />
        </div>
        <h1 className="text-3xl font-bold text-center mb-2">
          World of <span className="text-pink-500">Dommes</span>
        </h1>
        <p className="text-zinc-400 text-center mb-8">
          {type === 'creator' ? 'Create your creator account' : 'Create your fan account'}
        </p>
        <div className="bg-zinc-900 p-8 rounded-3xl space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(cleanUsername(e.target.value))}
              placeholder="yourname"
              autoComplete="off"
              name="new-username"
              className="w-full p-4 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="off"
              name="new-email"
              className="w-full p-4 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              name="new-password"
              className="w-full p-4 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Repeat password</label>
            <input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              name="new-password-repeat"
              className="w-full p-4 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            />
          </div>
          <AgeTermsTicks age={age} setAge={setAge} terms={terms} setTerms={setTerms} />
          {type === 'creator' && (
            <label className="flex items-start gap-3 cursor-pointer text-sm text-zinc-300">
              <input type="checkbox" checked={creatorConfirmed} onChange={(e) => setCreatorConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-pink-500" />
              <span>I confirm that I intend to use World of Dommes as a content creator, and understand that creator accounts are subject to identity verification and platform approval before I can publish content or earn money.</span>
            </label>
          )}
          <button
            onClick={() => void handleSignup()}
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-700 py-4 rounded-2xl text-lg font-semibold"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          {message && <p className="text-center text-sm text-zinc-300">{message}</p>}
        </div>
        <p className="text-center mt-8 text-zinc-400">
          Already have an account?{' '}
          <Link href="/login" className="text-pink-500 hover:underline font-medium">Log in</Link>
        </p>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <SignupForm />
    </Suspense>
  );
}
