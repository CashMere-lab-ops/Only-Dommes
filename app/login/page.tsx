'use client';

import { useState, Suspense } from 'react';
import { createClient } from '../../lib/supabase';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown } from 'lucide-react';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Only allow same-site relative paths (block open redirects)
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (raw.startsWith('/login') || raw.startsWith('/signup')) return '/';
  return raw;
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const handleLogin = async () => {
    setLoading(true);
    setMessage('');

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage('Login successful! Redirecting...');
    // Full navigation so session cookie is applied before live page loads
    if (typeof window !== 'undefined') {
      window.location.href = next;
    } else {
      router.push(next);
    }
  };

  const signupHref =
    next && next !== '/'
      ? `/onboarding?next=${encodeURIComponent(next)}`
      : '/onboarding';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-pink-500 rounded-2xl flex items-center justify-center">
            <Crown className="w-7 h-7 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">
          World Of <span className="gradient-text">Dommes</span>
        </h1>
        <p className="text-zinc-400 text-center mb-2">Log in to your account</p>
        {next.startsWith('/live/') ? (
          <p className="text-center text-sm text-pink-400/90 mb-6">
            You&apos;ll return to the live after login
          </p>
        ) : (
          <div className="mb-6" />
        )}

        <div className="bg-zinc-900 p-8 rounded-3xl">
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            className="w-full p-4 mb-5 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium">Password</label>
            <Link
              href="/forgot-password"
              className="text-sm text-pink-500 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full p-4 mb-6 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleLogin();
            }}
          />

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-700 py-4 rounded-2xl text-lg font-semibold transition"
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>

          {message && (
            <p className="mt-5 text-center p-3 bg-zinc-800 rounded-2xl text-sm">
              {message}
            </p>
          )}
        </div>

        <p className="text-center mt-8 text-zinc-400">
          Don&apos;t have an account?{' '}
          <Link
            href={signupHref}
            className="text-pink-500 hover:underline font-medium"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

