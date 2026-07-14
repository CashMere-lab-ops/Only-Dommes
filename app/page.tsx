'use client';

import Sidebar from '../components/Sidebar';
import Link from 'next/link';
import { Radio } from 'lucide-react';

export default function Home() {
  // Fake live streams data (later we will get this from the database)
  const liveStreams = [
    { id: 1, title: 'Morning Workout Routine', creator: 'Scarlet Rose', viewers: 342, featured: true },
    { id: 2, title: 'Findom Session Live', creator: 'Princess K', viewers: 891 },
    { id: 3, title: 'Late Night Domme Chat', creator: 'Mistress Vex', viewers: 567 },
    { id: 4, title: 'Foot Worship Live', creator: 'Ivy Belle', viewers: 423 },
    { id: 5, title: 'Financial Domination', creator: 'Lady Ember', viewers: 312 },
    { id: 6, title: 'Strict Domme Training', creator: 'Queen Luna', viewers: 278 },
    { id: 7, title: 'Tease & Denial', creator: 'Domina Blaze', viewers: 195 },
    { id: 8, title: 'Goddess Worship', creator: 'Goddess Aria', viewers: 164 },
    { id: 9, title: 'Cash Tribute Night', creator: 'Mistress Nova', viewers: 143 },
    { id: 10, title: 'Private Domme Session', creator: 'Lady Raven', viewers: 98 },
  ];

  const featured = liveStreams.find(stream => stream.featured);
  const others = liveStreams.filter(stream => !stream.featured).slice(0, 9); // max 9 more = total 10

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">

          {/* Featured Live */}
          {featured && (
            <div className="relative rounded-2xl overflow-hidden mb-10 h-72 md:h-96 bg-zinc-900">
              {/* This will later be the creator's live thumbnail */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent z-10"></div>
              
              <div className="absolute bottom-0 left-0 p-8 z-20">
                <div className="flex items-center gap-3 mb-3">
                  <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    LIVE
                  </span>
                  <span className="text-white/80 text-sm">{featured.viewers} watching</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2">{featured.title}</h1>
                <p className="text-zinc-300">{featured.creator}</p>
              </div>
            </div>
          )}

          {/* Live Now Section */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Radio className="text-pink-500" size={22} /> Live Now
            </h2>
            <Link href="/live" className="text-pink-500 text-sm hover:underline">
              View all →
            </Link>
          </div>

          {/* Grid of up to 9 more lives (total 10 including featured) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {others.map((stream) => (
              <div
                key={stream.id}
                className="bg-zinc-900 rounded-2xl overflow-hidden hover:ring-2 hover:ring-pink-500/40 transition cursor-pointer"
              >
                {/* Thumbnail placeholder - later this will be the real live thumbnail */}
                <div className="aspect-video bg-zinc-800 relative">
                  <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2 py-1 rounded-full">
                    LIVE
                  </span>
                  <span className="absolute bottom-3 right-3 bg-black/70 text-xs px-2 py-1 rounded">
                    {stream.viewers} watching
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold truncate">{stream.title}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{stream.creator}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}