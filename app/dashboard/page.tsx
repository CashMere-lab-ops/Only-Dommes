'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign, TrendingUp, Film, Radio, Wallet, Eye,
  Heart, Users, Clock, Package, Plus, Search
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function DashboardPage() {
  const supabase = createClient();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(data);
      setLoading(false);
    };

    loadProfile();
  }, []);

  const displayName = profile?.display_name || profile?.username || 'User';
  const isCreator = profile?.account_type === 'creator';

  // ==================== LOADING STATE ====================
  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-zinc-400">Loading dashboard...</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // ==================== SUB DASHBOARD ====================
  if (!isCreator) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">

              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h1 className="text-3xl font-bold">Welcome back, {displayName}</h1>
                  <p className="text-zinc-400 mt-1">Here’s what’s happening with your account</p>
                </div>
                <Link
                  href="/discover"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 px-5 py-2.5 rounded-xl text-sm font-medium transition"
                >
                  <Search size={18} /> Discover Creators
                </Link>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <DollarSign size={16} /> Spent This Month
                  </div>
                  <p className="text-2xl font-bold">£0.00</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <Heart size={16} /> Active Subscriptions
                  </div>
                  <p className="text-2xl font-bold">0</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <Film size={16} /> Clips Owned
                  </div>
                  <p className="text-2xl font-bold">0</p>
                </div>
                <div className="bg-gradient-to-br from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-300 text-sm mb-1">
                    <Wallet size={16} /> Wallet Balance
                  </div>
                  <p className="text-2xl font-bold text-pink-400">£0.00</p>
                  <button className="mt-3 text-xs text-pink-400 hover:text-pink-300 font-medium">
                    + Top Up
                  </button>
                </div>
              </div>

              {/* Main Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                {/* Your Subscriptions */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Heart size={20} className="text-pink-400" /> Your Subscriptions
                    </h2>
                    <Link href="/subscriptions" className="text-sm text-pink-400 hover:text-pink-300">
                      View all
                    </Link>
                  </div>

                  <div className="text-center py-12 text-zinc-500">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                      <Heart size={28} className="opacity-40" />
                    </div>
                    <p className="text-sm mb-1">No active subscriptions</p>
                    <p className="text-xs text-zinc-600 mb-5">Subscribe to creators to unlock exclusive content</p>
                    <Link 
                      href="/discover" 
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 rounded-xl text-sm font-medium transition"
                    >
                      Find Creators
                    </Link>
                  </div>
                </div>

                {/* Your Library */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Film size={20} className="text-pink-400" /> Your Library
                    </h2>
                    <Link href="/library" className="text-sm text-pink-400 hover:text-pink-300">
                      View all
                    </Link>
                  </div>

                  <div className="text-center py-12 text-zinc-500">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                      <Film size={28} className="opacity-40" />
                    </div>
                    <p className="text-sm mb-1">No purchased clips yet</p>
                    <p className="text-xs text-zinc-600">Clips you buy will appear here</p>
                  </div>
                </div>
              </div>

              {/* Upcoming Lives */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Radio size={20} className="text-pink-400" /> Upcoming Lives
                  </h2>
                </div>

                <div className="text-center py-12 text-zinc-500">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <Clock size={28} className="opacity-40" />
                  </div>
                  <p className="text-sm mb-1">No upcoming lives</p>
                  <p className="text-xs text-zinc-600">Follow creators to see when they go live</p>
                </div>
              </div>

              {/* Recommended Creators */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Users size={20} className="text-pink-400" /> Recommended For You
                  </h2>
                  <Link href="/discover" className="text-sm text-pink-400 hover:text-pink-300">
                    See more
                  </Link>
                </div>

                <div className="text-center py-12 text-zinc-500">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <Users size={28} className="opacity-40" />
                  </div>
                  <p className="text-sm mb-1">Discover new creators</p>
                  <p className="text-xs text-zinc-600 mb-5">Explore trending and recommended creators</p>
                  <Link 
                    href="/discover" 
                    className="inline-flex items-center gap-2 px-5 py-2.5 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-sm font-medium transition"
                  >
                    <Search size={16} /> Explore Discover
                  </Link>
                </div>
              </div>

            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // ==================== CREATOR DASHBOARD ====================
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold">Welcome, {displayName}</h1>
                <p className="text-zinc-400 mt-1">Manage your content and earnings</p>
              </div>

              <button
                onClick={() => setIsLive(!isLive)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition ${
                  isLive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90'
                }`}
              >
                <Radio size={18} />
                {isLive ? 'End Stream' : 'Go Live'}
              </button>
            </div>

            {/* Earnings Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <DollarSign size={16} /> Today
                </div>
                <p className="text-2xl font-bold">£0.00</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <TrendingUp size={16} /> This Week
                </div>
                <p className="text-2xl font-bold">£0.00</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <Wallet size={16} /> This Month
                </div>
                <p className="text-2xl font-bold">£0.00</p>
              </div>
              <div className="bg-gradient-to-br from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-300 text-sm mb-1">
                  <Wallet size={16} /> Total Earned
                </div>
                <p className="text-2xl font-bold text-pink-400">£0.00</p>
              </div>
            </div>

            {/* Payout Banner */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center">
                  <Wallet className="text-pink-400" size={22} />
                </div>
                <div>
                  <p className="font-semibold">Weekly Payout</p>
                  <p className="text-sm text-zinc-400">Next payout: Friday · £0.00 pending</p>
                </div>
              </div>
              <button className="px-5 py-2.5 rounded-xl border border-zinc-700 text-sm font-medium hover:bg-zinc-800 transition">
                Withdraw
              </button>
            </div>

            {/* Quick Creator Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <button
                onClick={() => setIsLive(true)}
                className="bg-zinc-900 border border-zinc-800 hover:border-pink-500/50 rounded-2xl p-5 text-left transition"
              >
                <Radio className="text-pink-400 mb-3" size={24} />
                <div className="font-semibold">Go Live</div>
                <div className="text-sm text-zinc-400">Start a live stream</div>
              </button>
              <div className="bg-zinc-900 border border-zinc-800 hover:border-pink-500/50 rounded-2xl p-5 transition">
                <Film className="text-pink-400 mb-3" size={24} />
                <div className="font-semibold">Upload Clip</div>
                <div className="text-sm text-zinc-400">Sell exclusive videos</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 hover:border-pink-500/50 rounded-2xl p-5 transition">
                <Package className="text-pink-400 mb-3" size={24} />
                <div className="font-semibold">Sell Items</div>
                <div className="text-sm text-zinc-400">Underwear, heels & more</div>
              </div>
            </div>

            {/* Active Stream Banner */}
            {isLive && (
              <div className="rounded-2xl border border-pink-500/40 bg-pink-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full">LIVE</div>
                  <div>
                    <p className="font-semibold">You are currently live</p>
                    <p className="text-sm text-zinc-400 flex items-center gap-1">
                      <Eye size={14} /> 0 watching
                    </p>
                  </div>
                </div>
                <Link href="/live/demo" className="text-sm font-medium text-pink-400 hover:text-pink-300">
                  View Stream →
                </Link>
              </div>
            )}

          </div>
        </main>
      </div>
    </AuthGuard>
  );
}