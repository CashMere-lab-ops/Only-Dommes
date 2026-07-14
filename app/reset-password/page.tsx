'use client';

import { useState } from 'react';
import { createClient } from '../../lib/supabase';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleUpdate = async () => {
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Password updated successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-pink-500 rounded-2xl flex items-center justify-center">
            <Crown className="w-7 h-7 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">
          Only <span className="gradient-text">Dommes</span>
        </h1>
        <p className="text-zinc-400 text-center mb-8">Set a new password</p>

        <div className="bg-zinc-900 p-8 rounded-3xl">
          <label className="block text-sm font-medium mb-2">New Password</label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full p-4 mb-6 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleUpdate}
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-700 py-4 rounded-2xl text-lg font-semibold transition"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>

          {message && (
            <p className="mt-5 text-center p-3 bg-zinc-800 rounded-2xl text-sm">
              {message}
            </p>
          )}
        </div>

        <p className="text-center mt-8 text-zinc-400">
          <Link href="/login" className="text-pink-500 hover:underline font-medium">
            Back to Log in
          </Link>
        </p>
      </div>
    </div>
  );
}