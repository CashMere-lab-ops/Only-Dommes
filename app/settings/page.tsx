'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, User, Lock, Bell, Shield, Camera, Save, Eye, EyeOff, Link2, Unlink, Heart
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<any>(null);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [xUsername, setXUsername] = useState('');
  const [tempXUsername, setTempXUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false);
  const [subscriptionPrice, setSubscriptionPrice] = useState('9.99');

  // Message privacy: everyone | subscribers | nobody
  const [messagePrivacy, setMessagePrivacy] = useState('everyone');

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

      setUserEmail(user.email || '');

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
        setXUsername(data.x_username || '');
        setSubscriptionsEnabled(!!data.subscriptions_enabled);
        setSubscriptionPrice(
          data.subscription_price != null
            ? String(data.subscription_price)
            : '9.99'
        );
        setMessagePrivacy(data.message_privacy || 'everyone');
      }

      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    setError('');
    setMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      setMessage('Profile picture updated successfully');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updates: any = {
        display_name: displayName,
        username: username.toLowerCase(),
        bio: bio,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      setMessage('Profile updated successfully');
      setProfile({ ...profile, ...updates });
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubscriptions = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const price = parseFloat(subscriptionPrice);
      if (isNaN(price) || price < 0) {
        setError('Enter a valid subscription price');
        setSaving(false);
        return;
      }

      const updates = {
        subscriptions_enabled: subscriptionsEnabled,
        subscription_price: price,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      setProfile({ ...profile, ...updates });
      setMessage('Subscription settings saved');
    } catch (err: any) {
      setError(err.message || 'Failed to save subscription settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrivacy = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ message_privacy: messagePrivacy })
        .eq('id', user.id);

      if (error) throw error;

      setProfile({ ...profile, message_privacy: messagePrivacy });
      setMessage('Privacy settings saved');
    } catch (err: any) {
      setError(err.message || 'Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkX = async () => {
    if (!tempXUsername.trim()) {
      setError('Please enter your X username');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const cleanUsername = tempXUsername.replace('@', '').trim();

      const { error } = await supabase
        .from('profiles')
        .update({ x_username: cleanUsername })
        .eq('id', user.id);

      if (error) throw error;

      setXUsername(cleanUsername);
      setTempXUsername('');
      setProfile({ ...profile, x_username: cleanUsername });
      setMessage('X account linked successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to link X account');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkX = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ x_username: null })
        .eq('id', user.id);

      if (error) throw error;

      setXUsername('');
      setProfile({ ...profile, x_username: null });
      setMessage('X account unlinked');
    } catch (err: any) {
      setError(err.message || 'Failed to unlink X account');
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
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
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

            {/* PROFILE — same as before, shortened in mind: keep full structure */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <User size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Profile</h2>
              </div>

              <div className="flex items-center gap-5 mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-3xl font-bold overflow-hidden">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl transition disabled:opacity-50"
                  >
                    <Camera size={16} />
                    {uploading ? 'Uploading...' : 'Change Photo'}
                  </button>
                  <p className="text-xs text-zinc-500 mt-2">JPG or PNG. Max 5MB.</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500"
                />
              </div>

              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-8 pr-4 outline-none focus:border-pink-500"
                  />
                </div>
              </div>

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

              {isCreator && (
                <div className="mb-6">
                  <label className="text-sm text-zinc-400 mb-2 block">Linked Accounts</label>
                  {xUsername ? (
                    <div className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-black flex items-center justify-center">
                          <span className="text-white font-bold text-lg">𝕏</span>
                        </div>
                        <div>
                          <p className="font-medium">@{xUsername}</p>
                          <p className="text-xs text-zinc-400">X (Twitter)</p>
                        </div>
                      </div>
                      <button
                        onClick={handleUnlinkX}
                        disabled={saving}
                        className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition"
                      >
                        <Unlink size={15} /> Unlink
                      </button>
                    </div>
                  ) : (
                    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
                          <input
                            type="text"
                            value={tempXUsername}
                            onChange={(e) => setTempXUsername(e.target.value.replace('@', ''))}
                            placeholder="yourxusername"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500 text-sm"
                          />
                        </div>
                        <button
                          onClick={handleLinkX}
                          disabled={saving || !tempXUsername.trim()}
                          className="flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 px-4 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50"
                        >
                          <Link2 size={15} /> Link
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-6">
                <label className="text-sm text-zinc-400 mb-1.5 block">Date of Birth</label>
                <input
                  type="text"
                  value={profile?.date_of_birth || 'Not set'}
                  disabled
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl py-3 px-4 text-zinc-500 cursor-not-allowed"
                />
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

            {isCreator && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
                <div className="flex items-center gap-2 mb-6">
                  <Heart size={20} className="text-pink-400" />
                  <h2 className="text-lg font-semibold">Subscriptions</h2>
                </div>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="font-medium">Enable subscriptions</p>
                    <p className="text-sm text-zinc-400">Show a Subscribe button on your profile</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={subscriptionsEnabled}
                      onChange={() => setSubscriptionsEnabled(!subscriptionsEnabled)}
                    />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>
                <div className="mb-5">
                  <label className="text-sm text-zinc-400 mb-1.5 block">Monthly price (£)</label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">£</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={subscriptionPrice}
                      onChange={(e) => setSubscriptionPrice(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 pl-8 pr-4 outline-none focus:border-pink-500"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveSubscriptions}
                  disabled={saving}
                  className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Subscription Settings'}
                </button>
              </div>
            )}

            {/* ACCOUNT */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <Lock size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Account</h2>
              </div>
              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={userEmail || 'Not available'}
                  disabled
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl py-3 px-4 text-zinc-500 cursor-not-allowed"
                />
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

            {/* PRIVACY — wired up */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <Shield size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Privacy & Safety</h2>
              </div>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-medium">Who can message you</p>
                    <p className="text-sm text-zinc-400">Control who can send you direct messages</p>
                  </div>
                  <select
                    value={messagePrivacy}
                    onChange={(e) => setMessagePrivacy(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl py-2 px-3 text-sm outline-none focus:border-pink-500"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="subscribers">Subscribers only</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>
                <button
                  onClick={handleSavePrivacy}
                  disabled={saving}
                  className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Privacy Settings'}
                </button>
              </div>
            </div>

            {/* NOTIFICATIONS */}
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
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}