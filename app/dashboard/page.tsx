'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase';
import Sidebar from '../../components/Sidebar';
import { LayoutDashboard, Radio, DollarSign, Users, Film } from 'lucide-react';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Not logged in → send to login page
        router.push('/login');
        return;
      }
      
      setUser(user);
      setLoading(false);
    };

    checkUser();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <LayoutDashboard className="text-pink-500" size={32} />
              Dashboard
            </h1>
            <p className="text-zinc-400 mt-1">
              Welcome back, {user?.email}
            </p>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            <div className="bg-zinc-900 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="text-pink-500" size={20} />
                </div>
                <span className="text-zinc-400 text-sm">Earnings (30d)</span>
              </div>
              <p className="text-2xl font-bold">$0.00</p>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center">
                  <Users className="text-pink-500" size={20} />
                </div>
                <span className="text-zinc-400 text-sm">Subscribers</span>
              </div>
              <p className="text-2xl font-bold">0</p>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center">
                  <Radio className="text-pink-500" size={20} />
                </div>
                <span className="text-zinc-400 text-sm">Live Streams</span>
              </div>
              <p className="text-2xl font-bold">0</p>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center">
                  <Film className="text-pink-500" size={20} />
                </div>
                <span className="text-zinc-400 text-sm">Clips</span>
              </div>
              <p className="text-2xl font-bold">0</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-zinc-900 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <button className="bg-pink-600 hover:bg-pink-500 px-5 py-3 rounded-xl font-medium transition">
                Go Live
              </button>
              <button className="bg-zinc-800 hover:bg-zinc-700 px-5 py-3 rounded-xl font-medium transition">
                Upload Clip
              </button>
              <button className="bg-zinc-800 hover:bg-zinc-700 px-5 py-3 rounded-xl font-medium transition">
                View Earnings
              </button>
              <button className="bg-zinc-800 hover:bg-zinc-700 px-5 py-3 rounded-xl font-medium transition">
                Edit Profile
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}