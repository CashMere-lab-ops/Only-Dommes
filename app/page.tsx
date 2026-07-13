'use client';

import Link from 'next/link';
import { Home, Radio, Film, Trophy, MessageCircle, LayoutDashboard, TrendingUp, Search, ShoppingBag, Users, Heart, Library, Bell } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center font-bold">
            OD
          </div>
          <span className="text-xl font-bold">Only Dommes</span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-600/20 text-red-400 font-medium">
            <Home size={20} /> Home
          </Link>
          <Link href="/live" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Radio size={20} /> Live
          </Link>
          <Link href="/clips" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Film size={20} /> Clips
          </Link>
          <Link href="/leaderboard" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Trophy size={20} /> Leaderboard
          </Link>
          <Link href="/messages" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <MessageCircle size={20} /> Messages
          </Link>
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <LayoutDashboard size={20} /> Dashboard
          </Link>

          <div className="pt-6 pb-2 px-4 text-xs font-semibold text-zinc-500 uppercase">
            More
          </div>

          <Link href="/earnings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <TrendingUp size={20} /> Earnings
          </Link>
          <Link href="/discover" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Search size={20} /> Discover
          </Link>
          <Link href="/shop" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <ShoppingBag size={20} /> Shop
          </Link>
          <Link href="/following" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Users size={20} /> Following
          </Link>
          <Link href="/subscriptions" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Heart size={20} /> Subscriptions
          </Link>
          <Link href="/library" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Library size={20} /> My Library
          </Link>
          <Link href="/notifications" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 text-zinc-300">
            <Bell size={20} /> Notifications
          </Link>
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-700"></div>
            <div>
              <p className="font-medium text-sm">Princess K</p>
              <p className="text-xs text-zinc-400">Creator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          
          {/* Featured Live */}
          <div className="relative rounded-2xl overflow-hidden mb-10 h-80 bg-zinc-800">
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
              <Radio className="text-red-500" size={22} /> Live Now
            </h2>
            <Link href="/live" className="text-red-500 text-sm">View all →</Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="bg-zinc-900 rounded-2xl overflow-hidden">
              <div className="aspect-video bg-zinc-800 relative">
                <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2 py-1 rounded-full">LIVE</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold">Morning Workout Routine</h3>
                <p className="text-sm text-zinc-400">Scarlet Rose</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl overflow-hidden">
              <div className="aspect-video bg-zinc-800 relative">
                <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2 py-1 rounded-full">LIVE</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold">Sunset Yoga Flow</h3>
                <p className="text-sm text-zinc-400">Ava Diamond</p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl overflow-hidden">
              <div className="aspect-video bg-zinc-800 relative">
                <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2 py-1 rounded-full">LIVE</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold">Evening Session</h3>
                <p className="text-sm text-zinc-400">Mistress Vex</p>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}