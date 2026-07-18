'use client';

import Link from 'next/link';
import { Star, Heart } from 'lucide-react';

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-6">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-2">Welcome to Only Dommes</h1>
        <p className="text-zinc-400 text-lg">Choose your account type to get started</p>
      </div>

      <div className="w-full max-w-md space-y-4">
        {/* Creator Card */}
        <Link 
          href="/signup?type=creator" 
          className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-pink-500 transition"
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

        {/* Sub Card */}
        <Link 
          href="/signup?type=sub" 
          className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-pink-500 transition"
        >
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Heart className="w-7 h-7 text-pink-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-1">I'm a Sub</h3>
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
    </div>
  );
}