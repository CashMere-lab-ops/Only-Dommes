'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Radio,
  Video,
  Trophy,
  MessageCircle,
  LayoutDashboard,
  Search,
  ShoppingBag,
  Heart,
  Settings,
  LogOut,
  X,
  Bell,
  BookOpen,
  HelpCircle,
  User,
  Crown,
} from 'lucide-react';
import { createClient } from '../lib/supabase';
import WalletBalance from './WalletBalance';

/** Shared profile cache — stops flash on every navigation */
let cachedProfile: {
  username?: string;
  display_name?: string;
  avatar_url?: string;
  account_type?: string;
  balance_gbp?: number;
} | null = null;

export function setCachedBalance(balance: number) {
  if (cachedProfile) {
    cachedProfile = { ...cachedProfile, balance_gbp: balance };
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('wod-balance-updated', { detail: balance })
    );
  }
}

export function clearCachedProfile() {
  cachedProfile = null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [profile, setProfile] = useState<typeof cachedProfile>(cachedProfile);
  const [profileLoaded, setProfileLoaded] = useState(!!cachedProfile);
  const [balance, setBalance] = useState<number | null>(
    cachedProfile?.balance_gbp != null
      ? Number(cachedProfile.balance_gbp)
      : null
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [loggedIn, setLoggedIn] = useState(!!cachedProfile);

  const refreshBalance = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('balance_gbp')
      .eq('id', userId)
      .single();
    if (data && data.balance_gbp != null) {
      const n = Number(data.balance_gbp);
      setBalance(n);
      setCachedBalance(n);
    }
  }, [supabase]);

  useEffect(() => {
    if (cachedProfile) {
      setProfile(cachedProfile);
      setProfileLoaded(true);
      setLoggedIn(true);
      if (cachedProfile.balance_gbp != null) {
        setBalance(Number(cachedProfile.balance_gbp));
      }
    }

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfileLoaded(true);
        setLoggedIn(false);
        setBalance(null);
        return;
      }
      setLoggedIn(true);

      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, account_type, balance_gbp')
        .eq('id', user.id)
        .single();

      if (data) {
        cachedProfile = data;
        setProfile(data);
        setBalance(Number(data.balance_gbp ?? 0));
      }
      setProfileLoaded(true);

      // Unread messages
      try {
        const { data: convos } = await supabase
          .from('conversations')
          .select('id')
          .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`);
        if (convos && convos.length > 0) {
          const ids = convos.map((c) => c.id);
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', ids)
            .neq('sender_id', user.id)
            .eq('is_read', false);
          setUnreadCount(count || 0);
        }
      } catch {
        /* optional columns may differ */
      }

      // Unread notifications
      try {
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false);
        setNotifCount(count || 0);
      } catch {
        /* optional */
      }
    };

    load();

    const onBalance = (e: Event) => {
      const n = (e as CustomEvent).detail;
      if (typeof n === 'number') setBalance(n);
    };
    window.addEventListener('wod-balance-updated', onBalance);

    // Soft refresh when tab becomes visible (after top-up in another flow)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) refreshBalance(user.id);
        });
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('wod-balance-updated', onBalance);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [supabase, refreshBalance]);

  // Refresh balance when route changes (after wallet / tip pages)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) refreshBalance(user.id);
    });
  }, [pathname, refreshBalance, supabase.auth]);

  const handleLogout = async () => {
    clearCachedProfile();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (path: string) =>
    path === '/'
      ? pathname === '/'
      : pathname === path || pathname.startsWith(path + '/');

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/live', label: 'Live', icon: Radio },
    { href: '/clips', label: 'Clips', icon: Video },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/messages', label: 'Messages', icon: MessageCircle, badge: unreadCount },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const isCreator = profile?.account_type === 'creator';

  const desktopMoreItems = [
    { href: '/account', label: 'My Account', icon: User },
    { href: '/discover', label: 'Discover', icon: Search },
    { href: '/shop', label: 'Shop', icon: ShoppingBag },
    ...(!isCreator
      ? [{ href: '/subscriptions', label: 'Subscriptions', icon: Heart }]
      : []),
    { href: '/library', label: 'My Library', icon: BookOpen },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: notifCount },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  const mobileMoreItems = [
    { href: '/account', label: 'My Account', icon: User },
    { href: '/discover', label: 'Discover', icon: Search },
    { href: '/shop', label: 'Shop', icon: ShoppingBag },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(!isCreator
      ? [{ href: '/subscriptions', label: 'Subscriptions', icon: Heart }]
      : []),
    { href: '/library', label: 'My Library', icon: BookOpen },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: notifCount },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  const mobileNav = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/live', label: 'Live', icon: Radio },
    { href: '/clips', label: 'Clips', icon: Video },
    { href: '/messages', label: 'Messages', icon: MessageCircle, badge: unreadCount },
    { href: '#more', label: 'More', icon: null },
  ];

  const displayName = profile?.display_name || profile?.username || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const isSub = profile?.account_type === 'sub';

  const linkClass = (path: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-sm ${
      isActive(path)
        ? 'bg-pink-600/20 text-pink-400 font-medium'
        : 'text-zinc-300 hover:bg-zinc-800'
    }`;

  // Hide chrome on pure auth pages
  const hideChrome =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/');

  if (hideChrome) return null;

  return (
    <>
      {/* ── Mobile top bar: logo + balance + avatar ── */}
      {loggedIn && (
        <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm truncate">
              <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                World of Dommes
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            <WalletBalance
              balance={profileLoaded ? balance : null}
              compact
              showTopUpHint={isSub}
              from="account"
            />
            <Link
              href="/account"
              className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-xs font-bold overflow-hidden"
            >
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                initial
              )}
            </Link>
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex w-64 bg-zinc-900 border-r border-zinc-800 flex-col h-screen sticky top-0 flex-shrink-0">
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
            World of Dommes
          </span>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                <span className="relative">
                  <Icon size={20} />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-pink-500 text-[9px] font-bold flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            );
          })}

          <div className="pt-5 pb-2 px-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            More
          </div>

          {desktopMoreItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                <span className="relative">
                  <Icon size={20} />
                  {'badge' in item && item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-pink-500 text-[9px] font-bold flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Profile + balance + logout */}
        <div className="p-3 border-t border-zinc-800 space-y-2">
          {loggedIn && (
            <WalletBalance
              balance={profileLoaded ? balance : null}
              showTopUpHint={isSub}
              from="account"
            />
          )}
          {loggedIn && profileLoaded && (
            <Link
              href="/account"
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-800 transition"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{displayName}</p>
                <p className="text-xs text-zinc-500 truncate">
                  @{profile?.username || 'user'}
                </p>
              </div>
            </Link>
          )}
          {loggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-950/30 transition"
            >
              <LogOut size={18} /> Logout
            </button>
          )}
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950 border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-14">
          {mobileNav.map((item) => {
            if (item.href === '#more') {
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setShowMoreMenu(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 text-zinc-400 text-[10px]"
                >
                  <span className="text-lg leading-none">☰</span>
                  More
                </button>
              );
            }
            const Icon = item.icon!;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] relative ${
                  active ? 'text-pink-400' : 'text-zinc-400'
                }`}
              >
                <span className="relative">
                  <Icon size={22} />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 px-0.5 rounded-full bg-pink-500 text-[8px] font-bold flex items-center justify-center text-white">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile More sheet ── */}
      {showMoreMenu && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/70"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-zinc-900 border-t border-zinc-700 rounded-t-3xl p-5 pb-10 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">More</h2>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="text-zinc-400"
              >
                <X size={24} />
              </button>
            </div>

            {loggedIn && (
              <div className="mb-4">
                <WalletBalance
                  balance={profileLoaded ? balance : null}
                  showTopUpHint={isSub}
                  from="account"
                />
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              {mobileMoreItems.map((item) => {
                const Icon = item.icon;
                const isNotif = item.href === '/notifications';
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMoreMenu(false)}
                    className="relative flex flex-col items-center justify-center bg-zinc-800 rounded-2xl p-4 active:bg-zinc-700 transition"
                  >
                    <div className="relative">
                      <Icon size={26} className="text-white mb-2" />
                      {isNotif && notifCount > 0 && (
                        <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-pink-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {notifCount > 9 ? '9+' : notifCount}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-white text-center font-medium leading-tight">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-700">
              <button
                type="button"
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
