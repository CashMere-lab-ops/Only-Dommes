'use client';

import { useEffect, useState } from 'react';
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

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <p className="text-zinc-400">Loading profile...</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const displayName = profile?.display_name || profile?.username || 'User';
  const username = profile?.username || 'username';
  const initial = displayName.charAt(0).toUpperCase();
  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })
    : 'Recently';

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
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">

            {/* Profile Header */}
            <div className="flex flex-col sm:flex-row gap-6 mb-6">
              
              {/* Left column - Avatar + X (centred) */}
              <div className="flex flex-col items-center gap-3 flex-shrink-0">
                <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-5xl font-bold overflow-hidden">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>

                {profile?.x_username && (
                  <a
                    href={`https://x.com/${profile.x_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-xl transition"
                  >
                    <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                      <span className="text-white font-bold text-xs">𝕏</span>
                    </div>
                    <span className="text-sm font-medium">@{profile.x_username}</span>
                  </a>
                )}
              </div>

              {/* Right column - Text aligned flush left */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-1">
                    <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{displayName}</h1>
                    <p className="text-pink-400 text-lg leading-tight">@{username}</p>

                    <div className="flex flex-wrap items-center gap-2.5 text-sm text-zinc-400 pt-1">
                      <span>Joined {joinedDate}</span>
                      {profile?.account_type && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 capitalize">
                          {profile.account_type}
                        </span>
                      )}
                    </div>
                  </div>

                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition w-fit flex-shrink-0"
                  >
                    <Edit3 size={18} /> Edit Profile
                  </Link>
                </div>

                {profile?.bio && (
                  <p className="mt-6 text-zinc-300 max-w-2xl leading-relaxed">
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Stats Cards - Improved alignment */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 mt-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px]">
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <Users size={16} />
                  <span>Followers</span>
                </div>
                <div className="text-3xl font-semibold mt-3">0</div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px]">
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <Heart size={16} />
                  <span>Active Subscribers</span>
                </div>
                <div className="text-3xl font-semibold mt-3">0</div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px]">
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <DollarSign size={16} />
                  <span>Total Earnings</span>
                </div>
                <div className="text-3xl font-semibold mt-3">£0</div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between min-h-[110px]">
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <TrendingUp size={16} />
                  <span>This Month</span>
                </div>
                <div className="text-3xl font-semibold mt-3">£0</div>
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