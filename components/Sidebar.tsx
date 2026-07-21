'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Radio, Video, Trophy, MessageCircle, LayoutDashboard,
  Search, ShoppingBag, Heart, Settings,
  LogOut, Menu, X, Bell, BookOpen, Ban, HelpCircle, User
} from 'lucide-react';
import { createClient } from '../lib/supabase';

// Simple cache so the profile doesn't flash on every navigation
let cachedProfile: any = null;

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [profile, setProfile] = useState<any>(cachedProfile);
  const [profileLoaded, setProfileLoaded] = useState(!!cachedProfile);

  useEffect(() => {
    // If we already have the profile cached, don't fetch again
    if (cachedProfile) {
      setProfile(cachedProfile);
      setProfileLoaded(true);
      return;
    }

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (data) {
          cachedProfile = data; // save to cache
          setProfile(data);
        }
      }
      setProfileLoaded(true);
    };

    getUser();
  }, []);

  const handleLogout = async () => {
    cachedProfile = null; // clear cache on logout
    await supabase.auth.signOut();
    router.push('/login');
  };

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/live', label: 'Live', icon: Radio },
    { href: '/clips', label: 'Clips', icon: Video },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/messages', label: 'Messages', icon: MessageCircle },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const desktopMoreItems = [
    { href: '/account', label: 'My Account', icon: User },
    { href: '/discover', label: 'Discover', icon: Search },
    { href: '/shop', label: 'Shop', icon: ShoppingBag },
    { href: '/subscriptions', label: 'Subscriptions', icon: Heart },
    { href: '/library', label: 'My Library', icon: BookOpen },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  const mobileMoreItems = [
    { href: '/clips', label: 'Clips', icon: Video },
    { href: '/account', label: 'My Account', icon: User },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/discover', label: 'Discover', icon: Search },
    { href: '/shop', label: 'Shop', icon: ShoppingBag },
    { href: '/subscriptions', label: 'Subscriptions', icon: Heart },
    { href: '/library', label: 'My Library', icon: BookOpen },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/blocked', label: 'Blocked', icon: Ban },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-64 bg-zinc-900 border-r border-zinc-800 flex-col h-screen sticky top-0">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-zinc-800">
          <div className="w-9 h-9 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-2xl">♕</span>
          </div>
          <span className="font-bold text-2xl bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
            Only Dommes
          </span>
        </div>

        <div className="px-3 py-4 flex-1 overflow-y-auto sidebar-scroll">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition ${
                    isActive(item.href)
                      ? 'bg-pink-600 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <Icon size={20} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-2">
            <p className="px-4 py-2 text-xs font-semibold text-zinc-500 tracking-wider">MORE</p>
            <div className="space-y-1">
              {desktopMoreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition ${
                      isActive(item.href)
                        ? 'bg-pink-600 text-white'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <Icon size={20} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom section - Profile + Logout */}
        <div className="p-4 border-t border-zinc-800 space-y-3">
          {profileLoaded && profile ? (
            <Link
              href="/account"
              className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-800 transition"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>
                    {(profile.display_name || profile.username || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile.display_name || profile.username || 'User'}
                </p>
                <p className="text-xs text-zinc-400 truncate">
                  @{profile.username || 'username'}
                </p>
              </div>
            </Link>
          ) : (
            <div className="h-[52px]" /> 
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800">
        <div className="flex justify-around items-center h-16 px-2 pb-safe">
          <Link
            href="/"
            className={`flex flex-col items-center justify-center flex-1 ${
              isActive('/') ? 'text-pink-500' : 'text-zinc-400'
            }`}
          >
            <Home size={22} />
            <span className="text-[10px] mt-1">Home</span>
          </Link>
          <Link
            href="/live"
            className={`flex flex-col items-center justify-center flex-1 ${
              isActive('/live') ? 'text-pink-500' : 'text-zinc-400'
            }`}
          >
            <Radio size={22} />
            <span className="text-[10px] mt-1">Live</span>
          </Link>
          <Link
            href="/dashboard"
            className={`flex flex-col items-center justify-center flex-1 ${
              isActive('/dashboard') ? 'text-pink-500' : 'text-zinc-400'
            }`}
          >
            <LayoutDashboard size={22} />
            <span className="text-[10px] mt-1">Dashboard</span>
          </Link>
          <Link
            href="/messages"
            className={`flex flex-col items-center justify-center flex-1 ${
              isActive('/messages') ? 'text-pink-500' : 'text-zinc-400'
            }`}
          >
            <MessageCircle size={22} />
            <span className="text-[10px] mt-1">Messages</span>
          </Link>
          <button
            onClick={() => setShowMoreMenu(true)}
            className="flex flex-col items-center justify-center flex-1 text-zinc-400"
          >
            <Menu size={22} />
            <span className="text-[10px] mt-1">More</span>
          </button>
        </div>
      </div>

      {/* Mobile More Menu */}
      {showMoreMenu && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700 rounded-t-3xl p-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-xl font-semibold">More</h2>
              <button onClick={() => setShowMoreMenu(false)} className="text-zinc-400">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {mobileMoreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMoreMenu(false)}
                    className="flex flex-col items-center justify-center bg-zinc-800 rounded-2xl p-4 active:bg-zinc-700 transition"
                  >
                    <Icon size={26} className="text-white mb-2" />
                    <span className="text-xs text-white text-center font-medium leading-tight">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-700">
              <button
                onClick={() => {
                  setShowMoreMenu(false);
                  handleLogout();
                }}
                className="w-full flex items-center justify-center gap-2 py-4 text-red-400 active:bg-zinc-800 rounded-2xl transition text-base font-medium"
              >
                <span className="text-lg">↪</span> Logout
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}