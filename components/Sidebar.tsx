'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Radio, Video, Trophy, MessageCircle, LayoutDashboard,
  TrendingUp, Search, ShoppingBag, Users, Heart, Settings,
  LogOut, Menu, X
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/live', label: 'Live', icon: Radio },
    { href: '/clips', label: 'Clips', icon: Video },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/messages', label: 'Messages', icon: MessageCircle },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const moreItems = [
    { href: '/earnings', label: 'Earnings', icon: TrendingUp },
    { href: '/discover', label: 'Discover', icon: Search },
    { href: '/shop', label: 'Shop', icon: ShoppingBag },
    { href: '/following', label: 'Following', icon: Users },
    { href: '/subscriptions', label: 'Subscriptions', icon: Heart },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">♕</span>
          </div>
          <span className="font-bold text-xl bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
            Only Dommes
          </span>
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-white">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-64 bg-zinc-900 border-r border-zinc-800 flex-col h-screen sticky top-0">
        <SidebarContent 
          navItems={navItems} 
          moreItems={moreItems} 
          isActive={isActive} 
        />
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsOpen(false)} />
          <div className="relative w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">♕</span>
                </div>
                <span className="font-bold text-xl bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                  Only Dommes
                </span>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2">
                <X size={22} />
              </button>
            </div>

            <SidebarContent 
              navItems={navItems} 
              moreItems={moreItems} 
              isActive={isActive} 
              onLinkClick={() => setIsOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ==================== MOBILE BOTTOM NAV (Safe Area) ==================== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800">
        <div className="flex justify-around items-center h-16 px-2 pb-safe">
          <Link 
            href="/" 
            className={`flex flex-col items-center justify-center flex-1 ${isActive('/') ? 'text-pink-500' : 'text-zinc-400'}`}
          >
            <Home size={22} />
            <span className="text-[10px] mt-1">Home</span>
          </Link>

          <Link 
            href="/live" 
            className={`flex flex-col items-center justify-center flex-1 ${isActive('/live') ? 'text-pink-500' : 'text-zinc-400'}`}
          >
            <Radio size={22} />
            <span className="text-[10px] mt-1">Live</span>
          </Link>

          <Link 
            href="/clips" 
            className={`flex flex-col items-center justify-center flex-1 ${isActive('/clips') ? 'text-pink-500' : 'text-zinc-400'}`}
          >
            <Video size={22} />
            <span className="text-[10px] mt-1">Clips</span>
          </Link>

          <Link 
            href="/messages" 
            className={`flex flex-col items-center justify-center flex-1 ${isActive('/messages') ? 'text-pink-500' : 'text-zinc-400'}`}
          >
            <MessageCircle size={22} />
            <span className="text-[10px] mt-1">Messages</span>
          </Link>

          <button 
            onClick={() => setIsOpen(true)} 
            className="flex flex-col items-center justify-center flex-1 text-zinc-400"
          >
            <Menu size={22} />
            <span className="text-[10px] mt-1">More</span>
          </button>
        </div>
      </div>
    </>
  );
}

// Reusable Sidebar Content
function SidebarContent({ 
  navItems, 
  moreItems, 
  isActive, 
  onLinkClick 
}: { 
  navItems: any[]; 
  moreItems: any[]; 
  isActive: (href: string) => boolean;
  onLinkClick?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo - Desktop only */}
      <div className="hidden lg:flex items-center gap-3 px-6 py-6 border-b border-zinc-800">
        <div className="w-9 h-9 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center">
          <span className="text-white font-bold text-2xl">♕</span>
        </div>
        <span className="font-bold text-2xl bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          Only Dommes
        </span>
      </div>

      {/* Navigation */}
      <div className="px-3 py-4 flex-1 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onLinkClick}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
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

        {/* More Section */}
        <div className="mt-8 px-4">
          <p className="text-xs font-semibold text-zinc-500 mb-3 px-2">MORE</p>
          <div className="space-y-1">
            {moreItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onLinkClick}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive(item.href)
                      ? 'bg-pink-600 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="p-4 border-t border-zinc-800">
        <button 
          onClick={() => alert('Logout feature coming soon')}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  );
}s