'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, User, Lock, Bell, Shield, Camera, Save, Eye, EyeOff
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notification toggles
  const [emailTips, setEmailTips] = useState(true);
  const [emailMessages, setEmailMessages] = useState(true);
  const [emailLives, setEmailLives] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
        setUsername(data.username || '');
        setBio(data.bio || '');
      }
      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          username: username.toLowerCase(),
          bio: bio,
        })
        .eq('id', user.id);

      if (error) throw error;

      setMessage('Profile updated successfully');
      setProfile({ ...profile, display_name: displayName, username, bio });
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setMessage('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-zinc-400">Loading settings...</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const isCreator = profile?.account_type === 'creator';
  const initial = (profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          {/* Mobile Top Bar */}
          <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/account" className="text-zinc-400 hover:text-white">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold">Settings</h1>
          </div>

          <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">

            <div className="mb-8">
              <h1 className="text-3xl font-bold hidden lg:block">Settings</h1>
              <p className="text-zinc-400 mt-1">Manage your profile and account preferences</p>
            </div>

            {/* Success / Error Messages */}
            {message && (
              <div className="mb-6 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3">
                {message}
              </div>
            )}
            {error && (
              <div className="mb-6 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* ==================== PROFILE SECTION ==================== */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <User size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Profile</h2>
              </div>

              {/* Avatar */}
              <div className="flex items-center gap-5 mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-3xl font-bold overflow-hidden">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <div>
                  <button className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl transition">
                    <Camera size={16} /> Change Photo
                  </button>
                  <p className="text-xs text-zinc-500 mt-2">JPG or PNG. Max 5MB.</p>
                </div>
              </div>

              {/* Display Name */}
              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500"
                />
                <p className="text-xs text-zinc-500 mt-1.5">You can change this once every 24 hours</p>
              </div>

              {/* Username */}
              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-8 pr-4 outline-none focus:border-pink-500"
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1.5">You can change this once every 30 days</p>
              </div>

              {/* Bio */}
              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder="Tell people about yourself..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500 resize-none"
                />
              </div>

              {/* Date of Birth (Locked) */}
              <div className="mb-6">
                <label className="text-sm text-zinc-400 mb-1.5 block">Date of Birth</label>
                <input
                  type="text"
                  value={profile?.date_of_birth || 'Not set'}
                  disabled
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl py-3 px-4 text-zinc-500 cursor-not-allowed"
                />
                <p className="text-xs text-zinc-500 mt-1.5">Date of birth cannot be changed</p>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>

            {/* ==================== ACCOUNT SECTION ==================== */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <Lock size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Account</h2>
              </div>

              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={profile?.email || 'Loading...'}
                  disabled
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl py-3 px-4 text-zinc-500 cursor-not-allowed"
                />
                <p className="text-xs text-zinc-500 mt-1.5">Email changes require password confirmation + verification</p>
              </div>

              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Account Type</label>
                <input
                  type="text"
                  value={isCreator ? 'Creator' : 'Sub'}
                  disabled
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl py-3 px-4 text-zinc-500 cursor-not-allowed capitalize"
                />
              </div>

              {/* Change Password */}
              <div className="border-t border-zinc-800 pt-5 mt-5">
                <h3 className="font-medium mb-4">Change Password</h3>

                <div className="mb-4">
                  <label className="text-sm text-zinc-400 mb-1.5 block">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 pr-12 outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-sm text-zinc-400 mb-1.5 block">Confirm New Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500"
                  />
                </div>

                <button
                  onClick={handleChangePassword}
                  disabled={saving || !newPassword}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50"
                >
                  Update Password
                </button>
              </div>
            </div>

            {/* ==================== PRIVACY SECTION ==================== */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <Shield size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Privacy & Safety</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Who can message you</p>
                    <p className="text-sm text-zinc-400">Control who can send you direct messages</p>
                  </div>
                  <select className="bg-zinc-800 border border-zinc-700 rounded-xl py-2 px-3 text-sm outline-none">
                    <option>Everyone</option>
                    <option>Subscribers only</option>
                    <option>Nobody</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                  <div>
                    <p className="font-medium">Show online status</p>
                    <p className="text-sm text-zinc-400">Let others see when you’re online</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* ==================== NOTIFICATIONS ==================== */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <Bell size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Notifications</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Tips & Purchases</p>
                    <p className="text-sm text-zinc-400">Get notified when you receive tips</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={emailTips} onChange={() => setEmailTips(!emailTips)} />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                  <div>
                    <p className="font-medium">New Messages</p>
                    <p className="text-sm text-zinc-400">Email me when I receive a message</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={emailMessages} onChange={() => setEmailMessages(!emailMessages)} />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                  <div>
                    <p className="font-medium">Live Stream Alerts</p>
                    <p className="text-sm text-zinc-400">Notify me when creators I follow go live</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={emailLives} onChange={() => setEmailLives(!emailLives)} />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Creator-only section */}
            {isCreator && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold">Creator Settings</h2>
                </div>
                <p className="text-sm text-zinc-400 mb-4">
                  More creator options (subscription price, tip menu, private show rates) will appear here soon.
                </p>
                <Link href="/dashboard" className="text-sm text-pink-400 hover:text-pink-300">
                  Go to Creator Dashboard →
                </Link>
              </div>
            )}

          </div>
        </main>
      </div>
    </AuthGuard>
  );
}