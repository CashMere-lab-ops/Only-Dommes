'use client';

import { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { Trophy } from 'lucide-react';

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');

  // Fake data for Top 30 (later we will connect real earnings)
  const makeData = (multiplier: number) => {
    const names = [
      'Princess K', 'Mistress Vex', 'Ivy Belle', 'Ava Diamond', 'Scarlet Rose',
      'Lady Ember', 'Queen Luna', 'Domina Blaze', 'Mistress Nova', 'Goddess Aria',
      'Lady Raven', 'Princess Jade', 'Mistress Storm', 'Queen Violet', 'Domina Flame',
      'Lady Shadow', 'Princess Ruby', 'Mistress Night', 'Queen Crystal', 'Goddess Sky',
      'Lady Phoenix', 'Princess Star', 'Mistress Frost', 'Queen Sapphire', 'Domina Rose',
      'Lady Velvet', 'Princess Luna', 'Mistress Ember', 'Queen Iris', 'Goddess Rain'
    ];

    return names.map((name, index) => ({
      rank: index + 1,
      name,
      amount: Math.round((100000 - index * 2800) * multiplier + Math.random() * 500),
      followers: `${(15 - index * 0.3).toFixed(1)}K`,
      category: index % 3 === 0 ? 'Fitness' : 'Domme'
    }));
  };

  const data = {
    '24h': makeData(0.08),
    '7d': makeData(0.6),
    '30d': makeData(1),
  };

  const current = data[period];
  const top1 = current[0];
  const top2 = current[1];
  const top3 = current[2];
  const rest = current.slice(3); // ranks 4 to 30

  const formatMoney = (num: number) => {
    return '£' + num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">

          {/* Title */}
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-8">
            <Trophy className="text-pink-500" size={32} />
            Leaderboard
          </h1>

          {/* Tabs */}
          <div className="flex gap-2 mb-10 bg-zinc-900 p-1.5 rounded-2xl w-fit">
            <button
              onClick={() => setPeriod('24h')}
              className={`px-6 py-2.5 rounded-xl text-sm font-medium transition ${
                period === '24h'
                  ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              24 Hours
            </button>
            <button
              onClick={() => setPeriod('7d')}
              className={`px-6 py-2.5 rounded-xl text-sm font-medium transition ${
                period === '7d'
                  ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`px-6 py-2.5 rounded-xl text-sm font-medium transition ${
                period === '30d'
                  ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              30 Days
            </button>
          </div>

          {/* Top 3 Podium */}
          <div className="grid grid-cols-3 gap-4 mb-10 items-end">
            
            {/* 2nd Place */}
            <div className="bg-zinc-900 rounded-2xl p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-zinc-600 flex items-center justify-center text-lg font-bold">
                2
              </div>
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-zinc-700 flex items-center justify-center text-xl font-bold">
                {top2.name.charAt(0)}
              </div>
              <p className="font-semibold">{top2.name}</p>
              <p className="text-pink-500 font-bold mt-1">{formatMoney(top2.amount)}</p>
            </div>

            {/* 1st Place */}
            <div className="bg-zinc-900 rounded-2xl p-6 text-center -mt-6 border border-pink-500/30">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-yellow-500 flex items-center justify-center text-xl font-bold text-black">
                1
              </div>
              <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-2xl font-bold">
                {top1.name.charAt(0)}
              </div>
              <p className="font-semibold text-lg">{top1.name}</p>
              <p className="text-pink-500 font-bold text-lg mt-1">{formatMoney(top1.amount)}</p>
            </div>

            {/* 3rd Place */}
            <div className="bg-zinc-900 rounded-2xl p-5 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-orange-600 flex items-center justify-center text-lg font-bold">
                3
              </div>
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-zinc-700 flex items-center justify-center text-xl font-bold">
                {top3.name.charAt(0)}
              </div>
              <p className="font-semibold">{top3.name}</p>
              <p className="text-pink-500 font-bold mt-1">{formatMoney(top3.amount)}</p>
            </div>
          </div>

          {/* Ranks 4 to 30 */}
          <div className="space-y-3">
            {rest.map((item) => (
              <div
                key={item.rank}
                className="bg-zinc-900 rounded-2xl px-5 py-4 flex items-center justify-between"
              >
                <