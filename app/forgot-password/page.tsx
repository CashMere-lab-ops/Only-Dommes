'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { Crown } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://only-dommes.vercel.app/reset-password',
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for the password reset link.');
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
        <p className="text-zinc-400 text-center mb-8">Reset your password</p>

        <div className="bg-zinc-900 p-8 rounded-3xl">
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            className="w-full p-4 mb-6 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button
            onClick={handleReset}
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-700 py-4 rounded-2xl text-lg font-semibold transition"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
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