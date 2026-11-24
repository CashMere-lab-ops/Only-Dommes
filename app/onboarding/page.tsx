'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, Heart } from 'lucide-react';
import BackHome from '../../components/BackHome';
import SiteFooter from '../../components/SiteFooter';
import { createClient } from '../../lib/supabase';

export default function OnboardingPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [selected, setSelected] = useState<'sub' | 'creator' | null>(null);
  const [creatorConfirmed, setCreatorConfirmed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const canContinue =
    selected === 'sub' || (selected === 'creator' && creatorConfirmed);

  const continueTo = () => {
    if (!selected || !canContinue) return;
    const base = signedIn ? '/setup' : '/signup';
    const params = new URLSearchParams({ type: selected });
    if (selected === 'creator') params.set('confirmed', '1');
    router.push(`${base}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <BackHome />
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-12">
        <div className="text-center mb-12">
          <img
            src="/logo-horizontal.jpg"
            alt="World of Dommes"
            className="h-16 sm:h-20 w-auto mx-auto mb-8 object-contain"
          />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Enter Your <span className="text-pink-500">World</span>
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg">
            Choose your account type to get started
          </p>
        </div>

        <div className="w-full max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Fan card */}
            <button
              type="button"
              onClick={() => {
                setSelected('sub');
                setCreatorConfirmed(false);
              }}
              className={`w-full text-left bg-zinc-900 border rounded-2xl p-6 transition ${
                selected === 'sub'
                  ? 'border-pink-500 shadow-[0_0_28px_rgba(236,72,153,0.18)]'
                  : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-7 h-7 text-pink-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-pink-400 uppercase tracking-wide mb-1">For fans</p>
                  <h3 className="text-xl font-semibold mb-2">Fan account</h3>
                  <ul className="text-sm text-zinc-400 space-y-1 mb-3">
                    <li>Discover and follow creators.</li>
                    <li>Subscribe to creators.</li>
                    <li>Purchase content and send tips.</li>
                    <li>Message creators.</li>
                  </ul>
                  <p className="text-sm text-zinc-300 italic">
                    “I want to follow and support creators.”
                  </p>
                </div>
              </div>
            </button>

            {/* Creator card */}
            <button
              type="button"
              onClick={() => setSelected('creator')}
              className={`w-full text-left bg-zinc-900 border rounded-2xl p-6 transition ${
                selected === 'creator'
                  ? 'border-pink-500 shadow-[0_0_28px_rgba(236,72,153,0.18)]'
                  : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <Star className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-pink-400 uppercase tracking-wide mb-1">For creators</p>
                  <h3 className="text-xl font-semibold mb-2">Creator account</h3>
                  <ul className="text-sm text-zinc-400 space-y-1 mb-3">
                    <li>Publish and sell your own content.</li>
                    <li>Build a subscriber audience.</li>
                    <li>Earn money from your content.</li>
                    <li>Manage your creator profile.</li>
                  </ul>
                  <p className="text-sm text-zinc-300 italic mb-3">
                    “I intend to become a creator and monetise my own content.”
                  </p>
                  <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    Creator accounts are subject to identity verification and platform approval before publishing.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Creator confirmation checkbox */}
          {selected === 'creator' && (
            <label className="mt-6 flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 cursor-pointer max-w-2xl mx-auto">
              <input
                type="checkbox"
                checked={creatorConfirmed}
                onChange={(e) => setCreatorConfirmed(e.target.checked)}
                className="mt-1 accent-pink-500 w-4 h-4 flex-shrink-0"
              />
              <span className="text-sm text-zinc-300 leading-relaxed">
                I confirm that I intend to use World of Dommes as a content creator, and understand that creator accounts are subject to identity verification and platform approval before I can publish content or earn money.
              </span>
            </label>
          )}

          <div className="mt-6 max-w-md mx-auto">
            <button
              type="button"
              onClick={continueTo}
              disabled={!canContinue}
              className="w-full py-4 rounded-2xl text-lg font-semibold bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition"
            >
              Continue
            </button>
          </div>
        </div>

        <p className="mt-8 text-zinc-400">
          Already have an account?{' '}
          <Link href="/login" className="text-pink-500 hover:underline font-medium">Log in</Link>
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-pink-500">Privacy</Link>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
