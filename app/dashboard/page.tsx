'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  DollarSign, TrendingUp, Film, Plus, Radio, Wallet, Eye, 
  ShoppingBag, Users, Heart, Settings 
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';

export default function DashboardPage() {
  const [isLive, setIsLive] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Mock data (later we will replace with real Supabase data)
  const stats = {
    today: 142.50,
    week: 890.00,
    month: 3420.75,
    total: 18450.00,
  };

  const recentTips = [
    { id: 1, name: 'PrincessK', amount: 50, message: 'Love your energy 🔥' },
    { id: 2, name: 'TommyB', amount: 25, message: '' },
    { id: 3, name: 'SubmissiveSam', amount: 100, message: 'Thank you Mistress' },
    { id: 4, name: 'NightOwl', amount: 15, message: '' },
  ];

  const myClips = [
    { id: 1, title: 'Morning Stretch Session', price: 12.99, sales: 48 },
    { id: 2, title: 'Private JOI Custom', price: 45.00, sales: 19 },
    { id: 3, title: 'Feet Worship Clip', price: 9.99, sales: 87 },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">Creator Dashboard</h1>
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
              <p className="text-2xl font-bold">£{stats.today.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <TrendingUp size={16} /> This Week
              </div>
              <p className="text-2xl font-bold">£{stats.week.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <Wallet size={16} /> This Month
              </div>
              <p className="text-2xl font-bold">£{stats.month.toFixed(2)}</p>
            </div>
            <div className="bg-gradient-to-br from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-300 text-sm mb-1">
                <Wallet size={16} /> Total Earned
              </div>
              <p className="text-2xl font-bold text-pink-400">£{stats.total.toFixed(2)}</p>
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
                <p className="text-sm text-zinc-400">Next payout: Friday · £{stats.week.toFixed(2)} pending</p>
              </div>
            </div>
            <button className="px-5 py-2.5 rounded-xl border border-zinc-700 text-sm font-medium hover:bg-zinc-800 transition">
              Withdraw
            </button>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Recent Tips */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-pink-400" /> Recent Tips
              </h2>

              {recentTips.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  No tips yet. Go live to start earning!
                </div>
              ) : (
                <div className="space-y-3">
                  {recentTips.map((tip) => (
                    <div key={tip.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold">
                        {tip.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{tip.name}</p>
                        {tip.message && (
                          <p className="text-xs text-zinc-400 truncate">{tip.message}</p>
                        )}
                      </div>
                      <span className="font-semibold text-pink-400">£{tip.amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Clips */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Film size={20} className="text-pink-400" /> My Clips
                </h2>
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1.5 text-sm bg-pink-600 hover:bg-pink-700 px-3 py-1.5 rounded-lg transition"
                >
                  <Plus size={16} /> Upload
                </button>
              </div>

              {myClips.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  <Film size={32} className="mx-auto mb-2 opacity-40" />
                  No clips yet. Upload your first clip!
                </div>
              ) : (
                <div className="space-y-3">
                  {myClips.map((clip) => (
                    <div key={clip.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50">
                      <div className="w-14 h-10 rounded-lg bg-zinc-700 flex items-center justify-center">
                        <Film size={18} className="text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{clip.title}</p>
                        <p className="text-xs text-zinc-400 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <ShoppingBag size={12} /> {clip.sales}
                          </span>
                          <span>·</span>
                          <span>£{clip.price.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Stream Banner */}
          {isLive && (
            <div className="mt-6 rounded-2xl border border-pink-500/40 bg-pink-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full">LIVE</div>
                <div>
                  <p className="font-semibold">You are currently live</p>
                  <p className="text-sm text-zinc-400 flex items-center gap-1">
                    <Eye size={14} /> 47 watching
                  </p>
                </div>
              </div>
              <Link
                href="/live/demo"
                className="text-sm font-medium text-pink-400 hover:text-pink-300"
              >
                View Stream →
              </Link>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}