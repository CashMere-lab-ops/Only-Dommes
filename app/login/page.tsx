'use client';

import { useState, Suspense } from 'react';
import { createClient } from '../../lib/supabase';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import BackHome from '../../components/BackHome';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

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

  const handleGoogle = async () => {
    setMessage('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setMessage(error.message);
  };

  const signupHref =
    next && next !== '/'
      ? `/onboarding?next=${encodeURIComponent(next)}`
      : '/onboarding';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <BackHome />
      <div className="w-full max-w-md">
        <div className="flex justify-center -mb-4">
          <img
            src="/logo-icon.png"
            alt="World of Dommes"
            className="w-52 h-52 object-contain"
          />
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">
          World of <span className="text-pink-500">Dommes</span>
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

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-xs text-zinc-500">or</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <button
            type="button"
            onClick={() => void handleGoogle()}
            className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 hover:bg-zinc-100 py-3.5 rounded-2xl text-sm font-semibold"
          >
            <GoogleMark />
            Continue with Google
          </button>
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
        <p className="text-center mt-3 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-pink-500">Privacy</Link>
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
