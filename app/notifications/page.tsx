'use client';

import Sidebar from '../../components/Sidebar';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-8">
            <Bell className="text-pink-500" size={32} />
            Notifications
          </h1>

          <div className="bg-zinc-900 rounded-2xl p-10 text-center">
            <p className="text-zinc-400 text-lg">
              No notifications yet
            </p>
            <p className="text-zinc-500 mt-2">
              You will see tips, new subscribers and messages here
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}