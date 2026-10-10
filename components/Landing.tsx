'use client';

import Link from 'next/link';

const cards = [
  { label: 'Live', tone: 'from-pink-600/80 to-zinc-900' },
  { label: 'Creators', tone: 'from-rose-500/70 to-zinc-900' },
  { label: 'Community', tone: 'from-fuchsia-700/70 to-zinc-900' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <main className="flex-1 flex flex-col items-center px-5 pt-10 pb-8">
        <img
          src="/logo-icon.png"
          alt="World of Dommes"
          className="w-36 h-36 sm:w-44 sm:h-44 object-contain"
        />
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          World of <span className="text-pink-500">Dommes</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">Creators. Community. Connection.</p>

        <div className="mt-8 flex gap-3 w-full max-w-md">
          {cards.map((card) => (
            <div
              key={card.label}
              className={`flex-1 aspect-[3/4] rounded-2xl bg-gradient-to-b ${card.tone} border border-white/10 flex items-end p-3`}
            >
              <span className="text-sm font-semibold">{card.label}</span>
            </div>
          ))}
        </div>

        <div className="w-full max-w-md mt-8 space-y-3">
          <Link
            href="/signup"
            className="block w-full text-center py-3.5 rounded-full bg-pink-500 hover:bg-pink-600 font-semibold"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="block w-full text-center py-3.5 rounded-full bg-pink-500/15 border border-pink-500/40 text-pink-300 hover:bg-pink-500/25 font-semibold"
          >
            Log in
          </Link>
        </div>

        <p className="mt-5 max-w-md text-center text-xs text-zinc-500 leading-relaxed">
          By joining you agree to our terms and privacy policy, and confirm you are at least 18.
        </p>
      </main>

      <footer className="px-5 pb-8 text-center text-xs text-zinc-500">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mb-3">
          <Link href="/support" className="hover:text-zinc-300">Support</Link>
          <Link href="/support" className="hover:text-zinc-300">Terms</Link>
          <Link href="/support" className="hover:text-zinc-300">Privacy</Link>
          <Link href="/discover" className="hover:text-zinc-300">Discover</Link>
        </div>
        <p>© {new Date().getFullYear()} World of Dommes</p>
      </footer>
    </div>
  );
}
