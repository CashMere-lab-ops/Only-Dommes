'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState('Confirming your email...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const token_hash = url.searchParams.get('token_hash');
        const type = url.searchParams.get('type');

        // Method 1: PKCE code flow
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // Method 2: Token hash (email confirmation links)
        else if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });
          if (error) throw error;
        }
        // Method 3: Check if session already exists from URL hash
        else {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('No session found');
          }
        }

        // Success → go to dashboard
        setMessage('Email confirmed! Logging you in...');
        setTimeout(() => {
          router.push('/dashboard');
        }, 800);
      } catch (err: any) {
        console.error('Auth callback error:', err);
        setMessage('Something went wrong. Redirecting to login...');
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-400">{message}</p>
      </div>
    </div>
  );
}