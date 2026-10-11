'use client';

import Link from 'next/link';
import { Star, Heart } from 'lucide-react';
import BackHome from '../../components/BackHome';

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-6">
      <BackHome />
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-2">
          Enter Your <span className="text-pink-500">World</span>
        </h1>
        <p className="text-zinc-400 text-lg">Choose your account type to get started</p>
      </div>

      <div className="w-full max-w-md space-y-4">
        <Link
          href="/signup?type=creator"
          className="block bg-zinc-900 border border-pink-500/70 rounded-2xl p-6 shadow-[0_0_28px_rgba(236,72,153,0.22)] hover:border-pink-400 transition"
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center flex-shrink-0">
              <Star className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-1">I'm a Creator</h3>
              <p className="text-zinc-400 text-sm mb-3">
                Go live, sell clips, earn tips from your subs, and get weekly payouts.
              </p>
              <span className="text-pink-500 text-sm font-medium flex items-center gap-1">
                Get started →
              </span>
            </div>
          </div>
        </Link>

        <Link
          href="/signup?type=sub"
          className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition"
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Heart className="w-7 h-7 text-pink-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-1">I'm a Subscriber</h3>
              <p className="text-zinc-400 text-sm mb-3">
                Watch live streams, buy exclusive clips, tip your favourite creators,
                and message them privately.
              </p>
              <span className="text-pink-500 text-sm font-medium flex items-center gap-1">
                Get started →
              </span>
            </div>
          </div>
        </Link>
      </div>

      <p className="mt-8 text-zinc-400">
        Already have an account?{' '}
        <Link href="/login" className="text-pink-500 hover:underline font-medium">
          Log in
        </Link>
      </p>
      <p className="mt-3 text-xs text-zinc-500">
        <Link href="/privacy" className="hover:text-pink-500">Privacy</Link>
      </p>
    </div>
  );
}
