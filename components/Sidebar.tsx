'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase';
import { 
  Home, Radio, Film, Trophy, MessageCircle, LayoutDashboard,
  TrendingUp, Search, ShoppingBag, Users, Heart, Library, 
  Bell, Ban, Settings, LifeBuoy, Crown, LogOut, LogIn
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    // Get current user on load
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();

    // Listen for login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const isActive = (path: string) => pathname === path;

  const linkClass = (path: string) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition ${
      isActive(path)
        ? 'bg-pink-600/20 text-pink-400 font-medium'
        : 'text-zinc-300 hover:bg-zinc-800'
    }`;

  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center">
          <Crown className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold">
          Only <span className="gradient-text">Dommes</span>
        </span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <Link href="/" className={linkClass('/')}>
          <Home size={20} /> Home
        </Link>
        <Link href="/live" className={linkClass('/live')}>
          <Radio size={20} /> Live
        </Link>
        <Link href="/clips" className={linkClass('/clips')}>
          <Film size={20} /> Clips
        </Link>
        <Link href="/leaderboard" className={linkClass('/leaderboard')}>
          <Trophy size={20} /> Leaderboard
        </Link>
        <Link href="/messages" className={linkClass('/messages')}>
          <MessageCircle size={20} /> Messages
        </Link>
        <Link href="/dashboard" className={linkClass('/dashboard')}>
          <LayoutDashboard size={20} /> Dashboard
        </Link>

        <div className="pt-6 pb-2 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          More
        </div>

        <Link href="/earnings" className={linkClass('/earnings')}>
          <TrendingUp size={20} /> Earnings
        </Link>
        <Link href="/discover" className={linkClass('/discover')}>
          <Search size={20} /> Discover
        </Link>
        <Link href="/shop" className={linkClass('/shop')}>
          <ShoppingBag size={20} /> Shop
        </Link>
        <Link href="/following" className={linkClass('/following')}>
          <Users size={20} /> Following
        </Link>
        <Link href="/subscriptions" className={linkClass('/subscriptions')}>
          <Heart size={20} /> Subscriptions
        </Link>
        <Link href="/library" className={linkClass('/library')}>
          <Library size={20} /> My Library
        </Link>
        <Link href="/notifications" className={linkClass('/notifications')}>
          <Bell size={20} /> Notifications
        </Link>
        <Link href="/blocked" className={linkClass('/blocked')}>
          <Ban size={20} /> Blocked
        </Link>
        <Link href="/settings" className={linkClass('/settings')}>
          <Settings size={20} /> Settings
        </Link>
        <Link href="/support" className={linkClass('/support')}>
          <LifeBuoy size={20} /> Support
        </Link>
      </nav>

      {/* User section at the bottom */}
      <div className="p-4 border-t border-zinc-800">
        {loading ? (
          <div className="text-zinc-500 text-sm">Loading...</div>
        ) : user ? (
          <div className="space-y-3">
            <div className="text-sm">
              <p className="text-zinc-400">Logged in as</p>
              <p className="font-medium truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition"
            >
              <LogOut size={18} />
              Log out
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-sm font-medium transition"
          >
            <LogIn size={18} />
            Log in
          </Link>
        )}
      </div>
    </aside>
  );
}