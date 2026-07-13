'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSignup = () => {
    setMessage('This is a test. Supabase will be connected next.');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="bg-zinc-900 p-8 rounded-3xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center">Join Only Dommes</h1>
        
        <input
          type="email"
          placeholder="Email"
          className="w-full p-4 mb-4 bg-zinc-800 rounded-2xl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-4 mb-6 bg-zinc-800 rounded-2xl"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={handleSignup}
          className="w-full bg-red-600 py-4 rounded-2xl text-lg font-semibold"
        >
          Create Account
        </button>
        {message && <p className="mt-4 text-center text-green-400">{message}</p>}
        <p className="text-center mt-6 text-zinc-400">
          <Link href="/" className="text-red-500">Back to Home</Link>
        </p>
      </div>
    </div>
  );
}