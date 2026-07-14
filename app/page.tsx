'use client';

import Sidebar from '../components/Sidebar';
import Link from 'next/link';
import { Radio } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          
          {/* Featured Hero */}
          <div className="relative rounded-2xl overflow-hidden mb-10 h-72 md:h-96 bg-zinc-800">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
            <div className="absolute bottom-0 left-0 p-8 z-20">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  LIVE
                </span>
                <span className="text-white/80 text-sm">342 watching</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Morning Workout Routine</h1>
              <p className="text-zinc-300">Scarlet Rose</p>
            </div>
          </div>

          {/* Live Now */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Radio className="text-pink-500" size={22} /> Live Now
            </h2>
            <Link href="/live" className="text-pink-500 text-sm hover:underline">
              View all →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-zinc-900 rounded-2xl overflow-hidden hover:ring-2 hover:ring-pink-500/40 transition">
                <div className="aspect-video bg-zinc-800 relative">
                  <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2 py-1 rounded-full">
                    LIVE
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">Live Stream {i}</h3>
                  <p className="text-sm text-zinc-400">Creator Name</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}