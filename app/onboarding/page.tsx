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
          <img
            src="/logo-horizontal.jpg"
            alt="World of Dommes"
            className="h-14 sm:h-16 w-auto mx-auto mb-10 object-contain drop-shadow-[0_0_24px_rgba(236,72,153,0.25)]"
          />
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
            Enter Your <span className="text-pink-400">World</span>
          </h1>
          <p className="text-zinc-500 text-sm sm:text-base tracking-wide">
            Choose your account type to get started
          </p>
        </div>

        <div className="w-full max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
            {/* Fan card */}
            <button
              type="button"
              onClick={() => {
                setSelected('sub');
                setCreatorConfirmed(false);
              }}
              className={`group w-full text-left rounded-3xl p-7 transition-all duration-200 ${
                selected === 'sub'
                  ? 'bg-zinc-900/80 border border-pink-500/60 shadow-[0_0_40px_rgba(236,72,153,0.15)]'
                  : 'bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/70'
              }`}
            >
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-6 h-6 text-pink-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-pink-400/90 uppercase tracking-[0.15em] mb-1.5">For fans</p>
                  <h3 className="text-lg font-semibold mb-3">Fan account</h3>
                  <ul className="text-[13px] text-zinc-400 space-y-1.5 mb-4 leading-relaxed">
                    <li>Discover and follow creators.</li>
                    <li>Subscribe to creators.</li>
                    <li>Purchase content and send tips.</li>
                    <li>Message creators.</li>
                  </ul>
                  <p className="text-[13px] text-zinc-300 italic border-t border-zinc-800/60 pt-3">
                    “I want to follow and support creators.”
                  </p>
                </div>
              </div>
            </button>

            {/* Creator card */}
            <button
              type="button"
              onClick={() => setSelected('creator')}
              className={`group w-full text-left rounded-3xl p-7 transition-all duration-200 ${
                selected === 'creator'
                  ? 'bg-zinc-900/80 border border-pink-500/60 shadow-[0_0_40px_rgba(236,72,153,0.15)]'
                  : 'bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/70'
              }`}
            >
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-900/30">
                  <Star className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-pink-400/90 uppercase tracking-[0.15em] mb-1.5">For creators</p>
                  <h3 className="text-lg font-semibold mb-3">Creator account</h3>
                  <ul className="text-[13px] text-zinc-400 space-y-1.5 mb-4 leading-relaxed">
                    <li>Publish and sell your own content.</li>
                    <li>Build a subscriber audience.</li>
                    <li>Earn money from your content.</li>
                    <li>Manage your creator profile.</li>
                  </ul>
                  <p className="text-[13px] text-zinc-300 italic border-t border-zinc-800/60 pt-3 mb-4">
                    “I intend to become a creator and monetise my own content.”
                  </p>
                  <p className="text-[11px] text-amber-300/80 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2.5 leading-relaxed">
                    Creator accounts are subject to identity verification and platform approval before publishing.
                  </p>
                </div>
              </div>
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
