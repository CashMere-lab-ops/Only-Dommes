'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Edit3, TrendingUp, Users, DollarSign, Heart,
  Settings, Bell, Shield, LogOut
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function MyAccountPage() {
  const router = useRouter();
  const supabase = createClient();

  const user = {
    name: "Scarlet Bloom",
    username: "@scarletbloom",
    joined: "January 2025",
    bio: "Professional Dominatrix & Content Creator. Daily lives, customs, and exclusive content.",
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />

        <main className="flex-1">
          {/* Mobile Top Bar */}
          <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-zinc-400 hover:text-white">
                <ArrowLeft size={22} />
              </Link>
              <h1 className="text-xl font-semibold">My Account</h1>
            </div>
            <Link href="/account" className="w-9 h-9 rounded-full bg-pink-600 flex items-center justify-center text-sm font-bold">
              SB
            </Link>
          </div>

          <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
            {/* Profile Header */}
            <div className="flex flex-col lg:flex-row lg:items-end gap-6 mb-10">
              <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-5xl font-bold flex-shrink-0">
                SB
              </div>
             
              <div className="flex-1">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h1 className="text-4xl font-bold">{user.name}</h1>
                    <p className="text-pink-400 text-xl">{user.username}</p>
                    <p className="text-sm text-zinc-400 mt-1">Joined {user.joined}</p>
                  </div>
                 
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition w-fit"
                  >
                    <Edit3 size={18} /> Edit Profile
                  </Link>
                </div>
                <p className="mt-4 text-zinc-300 max-w-2xl">{user.bio}</p>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-3 text-zinc-400 mb-1">
                  <Users size={18} /> <span className="text-sm">Followers</span>
                </div>
                <div className="text-3xl font-semibold">12.4k</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-3 text-zinc-400 mb-1">
                  <Heart size={18} /> <span className="text-sm">Active Subscribers</span>
                </div>
                <div className="text-3xl font-semibold">1,240</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-3 text-zinc-400 mb-1">
                  <DollarSign size={18} /> <span className="text-sm">Total Earnings</span>
                </div>
                <div className="text-3xl font-semibold">$45,230</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-3 text-zinc-400 mb-1">
                  <TrendingUp size={18} /> <span className="text-sm">This Month</span>
                </div>
                <div className="text-3xl font-semibold">$8,420</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold mb-4 px-1">Quick Actions</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Link href="/settings" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-pink-500/50 rounded-2xl p-5 flex flex-col items-start transition">
                  <Edit3 className="text-pink-400 mb-3" size={24} />
                  <div className="font-semibold">Edit Profile</div>
                  <div className="text-sm text-zinc-400">Update bio, photos & links</div>
                </Link>
                <Link href="/earnings" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-pink-500/50 rounded-2xl p-5 flex flex-col items-start transition">
                  <TrendingUp className="text-pink-400 mb-3" size={24} />
                  <div className="font-semibold">View Earnings</div>
                  <div className="text-sm text-zinc-400">Payouts & analytics</div>
                </Link>
                <Link href="/subscriptions" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-pink-500/50 rounded-2xl p-5 flex flex-col items-start transition">
                  <Users className="text-pink-400 mb-3" size={24} />
                  <div className="font-semibold">Manage Subscribers</div>
                  <div className="text-sm text-zinc-400">View & message fans</div>
                </Link>
                <Link href="/settings" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-pink-500/50 rounded-2xl p-5 flex flex-col items-start transition">
                  <DollarSign className="text-pink-400 mb-3" size={24} />
                  <div className="font-semibold">Payout Settings</div>
                  <div className="text-sm text-zinc-400">Bank & crypto details</div>
                </Link>
              </div>
            </div>

            {/* Settings Sections */}
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold mb-4 px-1">Account</h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800">
                  <Link href="/settings" className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800 transition rounded-t-2xl">
                    <div className="flex items-center gap-3"><Settings size={20} /> Account Settings</div>
                    <span className="text-zinc-400">→</span>
                  </Link>
                  <Link href="/settings" className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800 transition">
                    <div className="flex items-center gap-3"><Bell size={20} /> Notifications</div>
                    <span className="text-zinc-400">→</span>
                  </Link>
                  <Link href="/settings" className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800 transition rounded-b-2xl">
                    <div className="flex items-center gap-3"><Shield size={20} /> Privacy & Safety</div>
                    <span className="text-zinc-400">→</span>
                  </Link>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 px-1">Billing & Support</h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800">
                  <Link href="/earnings" className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800 transition rounded-t-2xl">
                    <div className="flex items-center gap-3"><DollarSign size={20} /> Payout History</div>
                    <span className="text-zinc-400">→</span>
                  </Link>
                  <Link href="/support" className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800 transition rounded-b-2xl">
                    <div className="flex items-center gap-3"><Heart size={20} /> Contact Support</div>
                    <span className="text-zinc-400">→</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Logout */}
            <div className="mt-10">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 bg-zinc-900 hover:bg-red-950/30 border border-zinc-800 hover:border-red-900/50 text-red-400 py-4 rounded-2xl font-medium transition"
              >
                <LogOut size={20} /> Log Out
              </button>
              <p className="text-center text-xs text-zinc-500 mt-4">
                Only Dommes • v1.0
              </p>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}