'use client';

import Link from 'next/link';
import { createClient } from '../lib/supabase';
import SiteFooter from './SiteFooter';

const cards = [
  { label: 'Live', src: '/landing/live.png' },
  { label: 'Creators', src: '/landing/creators.png' },
  { label: 'Community', src: '/landing/community.png' },
];

export default function Landing() {
  const handleGoogle = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <main className="flex-1 flex flex-col items-center px-5 pt-3 pb-4 sm:pt-6 sm:pb-8">
        <img
          src="/logo-icon.png"
          alt="World of Dommes"
          className="w-40 h-40 sm:w-64 sm:h-64 object-contain"
        />
        <h1 className="-mt-4 sm:-mt-8 text-4xl sm:text-6xl font-bold tracking-tight">
          World of <span className="text-pink-500">Dommes</span>
        </h1>
        <p className="mt-1 text-sm sm:text-base text-zinc-400">Creators. Community. Connection.</p>

        <div className="mt-4 sm:mt-6 flex gap-3 w-full max-w-md sm:max-w-xl">
          {cards.map((card) => (
            <div
              key={card.label}
              className="flex-1 aspect-[4/5] sm:aspect-[3/4] rounded-2xl overflow-hidden relative border border-white/10"
            >
              <img
                src={card.src}
                alt={card.label}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <span className="absolute bottom-3 left-3 text-sm font-semibold">{card.label}</span>
            </div>
          ))}
        </div>

        <div className="w-full max-w-md mt-5 sm:mt-8 space-y-3">
          <Link
            href="/onboarding"
            className="block w-full text-center py-2.5 text-sm sm:py-3.5 sm:text-base rounded-full bg-pink-500 hover:bg-pink-600 font-semibold"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="block w-full text-center py-2.5 text-sm sm:py-3.5 sm:text-base rounded-full bg-pink-500/15 border border-pink-500/40 text-pink-300 hover:bg-pink-500/25 font-semibold"
          >
            Log in
          </Link>
          <p className="sm:hidden mt-3 mb-2 px-1 text-center text-xs text-zinc-400 leading-relaxed">
            By joining, you agree to our{' '}
            <Link href="/terms" className="text-white font-semibold hover:text-pink-400">
              Terms & Conditions
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-white font-semibold hover:text-pink-400">
              Privacy Policy
            </Link>
            , and confirm that you are at least 18 years old.
          </p>
          <button
            type="button"
            onClick={() => void handleGoogle()}
            className="w-full flex items-center justify-center gap-3 py-2.5 text-sm sm:py-3.5 sm:text-base rounded-full bg-white text-zinc-900 font-semibold"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="hidden sm:block mt-5 max-w-md text-center text-sm text-zinc-400 leading-relaxed">
          By joining, you agree to our{' '}
          <Link href="/terms" className="text-white font-semibold hover:text-pink-400">
            Terms & Conditions
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-white font-semibold hover:text-pink-400">
            Privacy Policy
          </Link>
          , and confirm that you are at least 18 years old.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
