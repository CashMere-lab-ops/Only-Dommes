'use client';

import Link from 'next/link';
import { ArrowLeft, User, Settings, CreditCard, LogOut, Bell, Shield } from 'lucide-react';

export default function MyAccountPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <Link href="/live" className="text-zinc-400">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-semibold">My Account</h1>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        
        {/* Profile Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-4xl font-bold mb-4">
            SB
          </div>
          <h2 className="text-2xl font-bold">Scarlet Bloom</h2>
          <p className="text-pink-400">@scarletbloom</p>
          <p className="text-sm text-zinc-400 mt-1">Creator • Joined Jan 2025</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link 
            href="/settings" 
            className="flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-2xl transition"
          >
            <Settings className="text-pink-400" size={22} />
            <div>
              <div className="font-medium">Edit Profile</div>
              <div className="text-xs text-zinc-400">Update your info</div>
            </div>
          </Link>

          <Link 
            href="/earnings" 
            className="flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-2xl transition"
          >
            <CreditCard className="text-pink-400" size={22} />
            <div>
              <div className="font-medium">Earnings</div>
              <div className="text-xs text-zinc-400">View payouts</div>
            </div>
          </Link>
        </div>

        {/* Account Options */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 divide-y divide-zinc-800">
          <Link href="/settings" className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-800 transition">
            <Settings size={20} className="text-zinc-400" />
            <span>Account Settings</span>
          </Link>
          
          <Link href="/notifications" className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-800 transition">
            <Bell size={20} className="text-zinc-400" />
            <span>Notifications</span>
          </Link>
          
          <Link href="/blocked" className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-800 transition">
            <Shield size={20} className="text-zinc-400" />
            <span>Blocked Users</span>
          </Link>
        </div>

        {/* Logout */}
        <button 
          onClick={() => alert('Logout feature coming soon')}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-red-400 py-4 rounded-2xl font-medium transition"
        >
          <LogOut size={20} /> Logout
        </button>

        <p className="text-center text-xs text-zinc-500 mt-4">
          Only Dommes v1.0 • Need help? Contact support
        </p>
      </div>
    </div>
  );
}