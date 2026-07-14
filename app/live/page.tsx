'use client';

import Sidebar from '../../components/Sidebar';
import { Radio } from 'lucide-react';

export default function LivePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-8">
            <Radio className="text-pink-500" size={32} />
            Live Streams
          </h1>

          <div className="bg-zinc-900 rounded-2xl p-10 text-center">
            <p className="text-zinc-400 text-lg">
              No live streams right now
            </p>
            <p className="text-zinc-500 mt-2">
              Check back later or go live yourself from the Dashboard
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}