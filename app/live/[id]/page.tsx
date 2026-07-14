'use client';

import { useParams } from 'next/navigation';
import Sidebar from '../../../components/Sidebar';
import { Radio, Heart, MessageCircle, Gift } from 'lucide-react';

export default function LiveRoomPage() {
  const params = useParams();
  const id = params.id;

  // Fake data for now (later we will load the real stream)
  const stream = {
    id: id,
    title: 'Live Stream',
    creator: 'Creator Name',
    viewers: 342,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">

          {/* Video Player Area */}
          <div className="bg-zinc-900 rounded-2xl overflow-hidden mb-6">
            <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
              <div className="text-center">
                <Radio className="text-pink-500 mx-auto mb-3" size={48} />
                <p className="text-zinc-400">Live video will play here</p>
                <p className="text-sm text-zinc-500 mt-1">Stream ID: {id}</p>
              </div>

              {/* LIVE badge */}
              <span className="absolute top-4 left-4 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                LIVE
              </span>
            </div>
          </div>

          {/* Stream Info + Actions */}
          <div className="flex flex-col md:flex-row gap-6">
            
            {/* Left side - Info */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-2">{stream.title}</h1>
              <p className="text-zinc-400 mb-4">{stream.creator} · {stream.viewers} watching</p>

              <div className="flex gap-3">
                <button className="bg-pink-600 hover:bg-pink-500 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition">
                  <Gift size={18} />
                  Send Tip
                </button>
                <button className="bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition">
                  <Heart size={18} />
                  Follow
                </button>
              </div>
            </div>

            {/* Right side - Chat placeholder */}
            <div className="w-full md:w-80 bg-zinc-900 rounded-2xl p-4 h-80 flex flex-col">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
                <MessageCircle size={18} className="text-pink-500" />
                <span className="font-medium">Live Chat</span>
              </div>
              <div className="flex-1 text-zinc-500 text-sm">
                Chat will appear here...
              </div>
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Say something..."
                  className="w-full bg-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}