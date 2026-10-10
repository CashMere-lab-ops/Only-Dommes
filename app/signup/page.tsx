'use client';

import { useState } from 'react';
import { createClient } from '../../lib/supabase';
import Link from 'next/link';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setLoading(true);
    setMessage('');

    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Success! Check your email to confirm your account.');
      }
    } catch (err) {
      setMessage('Something went wrong. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center -mb-4">
          <img
            src="/logo-icon.png"
            alt="World of Dommes"
            className="w-52 h-52 object-contain"
          />
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">
          World of <span className="text-pink-500">Dommes</span>
        </h1>
        <p className="text-zinc-400 text-center mb-8">Create your free account</p>

        <div className="bg-zinc-900 p-8 rounded-3xl">
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            className="w-full p-4 mb-5 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="block text-sm font-medium mb-2">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full p-4 mb-6 bg-zinc-800 rounded-2xl text-white placeholder-zinc-500 border border-transparent focus:border-pink-500 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-700 py-4 rounded-2xl text-lg font-semibold transition"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          {message && (
            <p className="mt-5 text-center p-3 bg-zinc-800 rounded-2xl text-sm">
              {message}
            </p>
          )}
        </div>

        <p className="text-center mt-8 text-zinc-400">
          Already have an account?{' '}
          <Link href="/login" className="text-pink-500 hover:underline font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
