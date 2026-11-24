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
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(236,72,153,0.08),_transparent_50%)]" />
      <BackHome />
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-16">
        <div className="text-center mb-14">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
            Enter Your <span className="text-pink-400">World</span>
          </h1>
          <p className="text-zinc-500 text-sm sm:text-base tracking-wide">
            Choose your account type to get started
          </p>
        </div>

        <div className="w-full max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-stretch">
            {/* Fan card */}
            <button
              type="button"
              onClick={() => {
                setSelected('sub');
                setCreatorConfirmed(false);
              }}
              className={`group w-full text-left rounded-3xl p-6 transition-all duration-200 flex flex-col ${
                selected === 'sub'
                  ? 'bg-zinc-900 border-2 border-pink-500 shadow-[0_0_32px_rgba(236,72,153,0.2)]'
                  : 'bg-zinc-900/70 border border-zinc-800 hover:border-pink-500/40'
              }`}
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="w-11 h-11 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">For fans</p>
                  <h3 className="text-sm font-semibold text-white leading-tight">Fan account</h3>
                </div>
              </div>
              <ul className="text-sm text-zinc-300 space-y-2">
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Discover and follow creators</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Subscribe to creators</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Purchase content and send tips</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Message creators</li>
              </ul>
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <p className="text-sm text-zinc-400 italic">
                  “I want to follow and support creators.”
                </p>
              </div>
            </button>

            {/* Creator card */}
            <button
              type="button"
              onClick={() => setSelected('creator')}
              className={`group w-full text-left rounded-3xl p-6 transition-all duration-200 flex flex-col ${
                selected === 'creator'
                  ? 'bg-zinc-900 border-2 border-pink-500 shadow-[0_0_32px_rgba(236,72,153,0.2)]'
                  : 'bg-zinc-900/70 border border-zinc-800 hover:border-pink-500/40'
              }`}
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center flex-shrink-0">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">For creators</p>
                  <h3 className="text-sm font-semibold text-white leading-tight">Creator account</h3>
                </div>
              </div>
              <ul className="text-sm text-zinc-300 space-y-2">
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Publish and sell your content</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Build a subscriber audience</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Earn money from your content</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-pink-500 flex-shrink-0" />Manage your creator profile</li>
              </ul>
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <p className="text-sm text-zinc-400 italic">
                  “I intend to become a creator and monetise my content.”
                </p>
              </div>
              <p className="text-[11px] text-pink-300/90 bg-pink-500/10 border border-pink-500/20 rounded-xl px-3 py-2 mt-3 leading-relaxed">
                Creator accounts are subject to identity verification and platform approval before publishing.
              </p>
            </button>
          </div>

          {selected === 'creator' && (
            <label className="mt-6 flex items-start gap-3.5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 cursor-pointer max-w-2xl mx-auto">
              <input
                type="checkbox"
                checked={creatorConfirmed}
                onChange={(e) => setCreatorConfirmed(e.target.checked)}
                className="mt-0.5 accent-pink-500 w-4 h-4 flex-shrink-0"
              />
              <span className="text-[13px] text-zinc-300 leading-relaxed">
                I confirm that I intend to use World of Dommes as a content creator, and understand that creator accounts are subject to identity verification and platform approval before I can publish content or earn money.
              </span>
            </label>
          )}

          <div className="mt-8 max-w-xs mx-auto">
            <button
              type="button"
              onClick={continueTo}
              disabled={!canContinue}
              className="w-full py-3.5 rounded-full text-sm font-semibold tracking-wide bg-pink-500 hover:bg-pink-400 disabled:bg-zinc-800/80 disabled:text-zinc-600 disabled:cursor-not-allowed transition shadow-lg shadow-pink-950/20"
            >
              Continue
            </button>
          </div>
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-pink-400 hover:text-pink-300 font-medium">Log in</Link>
        </p>
        <p className="mt-3 text-xs text-zinc-600">
          <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
