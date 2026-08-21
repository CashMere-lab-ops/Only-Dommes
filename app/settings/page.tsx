'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, User, Lock, Bell, Camera, Save, Eye, EyeOff,
  Link2, Unlink, Heart, MessageCircle, Bot, DollarSign, Unlock, Phone, Radio
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
  const [minTipGbp, setMinTipGbp] = useState('2');
  const [subscriptionPrice, setSubscriptionPrice] = useState('9.99');
  const [messagePrice, setMessagePrice] = useState('0');

  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyMessage, setAutoReplyMessage] = useState('');
  const [autoReplyTipEnabled, setAutoReplyTipEnabled] = useState(false);
  const [autoReplyTipMessage, setAutoReplyTipMessage] = useState('');
  const [autoReplyUnlockEnabled, setAutoReplyUnlockEnabled] = useState(false);
  const [autoReplyUnlockMessage, setAutoReplyUnlockMessage] = useState('');

  // Voice calls
  const [voiceCallsEnabled, setVoiceCallsEnabled] = useState(false);
  const [voiceRate, setVoiceRate] = useState('3.00');
  const [voiceMinMinutes, setVoiceMinMinutes] = useState('3');
  const [voiceDndEnabled, setVoiceDndEnabled] = useState(false);
  const [voiceDndStart, setVoiceDndStart] = useState('22:00');
  const [voiceDndEnd, setVoiceDndEnd] = useState('08:00');
  const [voiceMaxMinutes, setVoiceMaxMinutes] = useState('30');
  const [voiceAway, setVoiceAway] = useState(false);

  // Live private
  const [livePrivateEnabled, setLivePrivateEnabled] = useState(true);
  const [livePrivateRate, setLivePrivateRate] = useState('8.00');
  const [livePrivateMinMinutes, setLivePrivateMinMinutes] = useState('5');

  const [emailTips, setEmailTips] = useState(true);
  const [emailMessages, setEmailMessages] = useState(true);
  const [emailLives, setEmailLives] = useState(true);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        setTempXUsername(data.x_username || '');
        setSubscriptionsEnabled(!!data.subscriptions_enabled);
        setSubscriptionPrice(String(data.subscription_price ?? 9.99));
        setMinTipGbp(String(data.min_tip_gbp ?? 2));
        setMessagePrice(String(data.message_price ?? 0));
        setAutoReplyEnabled(!!data.auto_reply_enabled);
        setAutoReplyMessage(data.auto_reply_message || '');
        setAutoReplyTipEnabled(!!data.auto_reply_tip_enabled);
        setAutoReplyTipMessage(data.auto_reply_tip_message || '');
        setAutoReplyUnlockEnabled(!!data.auto_reply_unlock_enabled);
        setAutoReplyUnlockMessage(data.auto_reply_unlock_message || '');
        setVoiceCallsEnabled(!!data.voice_calls_enabled);
        setVoiceRate(String(data.voice_rate_per_minute ?? 3));
        setVoiceMinMinutes(String(data.voice_min_minutes ?? 3));
        setVoiceDndEnabled(!!data.voice_dnd_enabled);
        setVoiceDndStart(data.voice_dnd_start || '22:00');
        setVoiceDndEnd(data.voice_dnd_end || '08:00');
        setVoiceMaxMinutes(String(data.voice_max_minutes ?? 30));
        setVoiceAway(!!data.voice_away);
        setLivePrivateEnabled(data.live_private_enabled !== false);
        setLivePrivateRate(
          String(
            data.live_private_rate_per_minute ??
              data.voice_rate_per_minute ??
              8
          )
        );
        setLivePrivateMinMinutes(
          String(
            data.live_private_min_minutes ?? data.voice_min_minutes ?? 5
          )
        );
        setEmailTips(data.email_tips !== false);
        setEmailMessages(data.email_messages !== false);
        setEmailLives(data.email_lives !== false);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Max 5MB for profile photo');
      return;
    }
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${profile.id}/avatar.${ext}`;
      const { error: upError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upError) throw upError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', profile.id);
      if (updateError) throw updateError;
      setProfile({ ...profile, avatar_url: url });
      setMessage('Photo updated');
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updates: any = {
        display_name: displayName.trim(),
        bio: bio.trim(),
        x_username: xUsername.trim() || null,
      };
      if (profile.account_type === 'creator') {
        updates.subscriptions_enabled = subscriptionsEnabled;
        updates.subscription_price = parseFloat(subscriptionPrice) || 0;
        const mt = parseFloat(minTipGbp);
        updates.min_tip_gbp = Number.isFinite(mt)
          ? Math.min(500, Math.max(2, Math.round(mt * 100) / 100))
          : 2;
        updates.message_price = parseFloat(messagePrice) || 0;
        updates.auto_reply_enabled = autoReplyEnabled;
        updates.auto_reply_message = autoReplyMessage.trim();
        updates.auto_reply_tip_enabled = autoReplyTipEnabled;
        updates.auto_reply_tip_message = autoReplyTipMessage.trim();
        updates.auto_reply_unlock_enabled = autoReplyUnlockEnabled;
        updates.auto_reply_unlock_message = autoReplyUnlockMessage.trim();

        const rate = parseFloat(voiceRate);
        let minMins = parseInt(voiceMinMinutes, 10);
        if (Number.isNaN(minMins) || minMins < 1) minMins = 1;
        if (minMins > 15) minMins = 15;
        updates.voice_calls_enabled = voiceCallsEnabled;
        updates.voice_rate_per_minute =
          Number.isNaN(rate) || rate < 0 ? 0 : Math.round(rate * 100) / 100;
        updates.voice_min_minutes = minMins;
        updates.voice_dnd_enabled = voiceDndEnabled;
        updates.voice_dnd_start = voiceDndStart || '22:00';
        updates.voice_dnd_end = voiceDndEnd || '08:00';
        let maxMins = parseInt(voiceMaxMinutes, 10);
        if (Number.isNaN(maxMins) || maxMins < 1) maxMins = 30;
        if (maxMins > 120) maxMins = 120;
        updates.voice_max_minutes = maxMins;
        updates.voice_away = voiceAway;

        const lpRate = parseFloat(livePrivateRate);
        let lpMin = parseInt(livePrivateMinMinutes, 10);
        if (Number.isNaN(lpMin) || lpMin < 1) lpMin = 1;
        if (lpMin > 30) lpMin = 30;
        updates.live_private_enabled = livePrivateEnabled;
        updates.live_private_rate_per_minute =
          Number.isNaN(lpRate) || lpRate < 0
            ? 0
            : Math.round(lpRate * 100) / 100;
        updates.live_private_min_minutes = lpMin;
      }
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);
      if (updateError) throw updateError;
      setProfile({ ...profile, ...updates });
      setVoiceMinMinutes(String(updates.voice_min_minutes ?? voiceMinMinutes));
      setMessage('Settings saved');
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkX = () => {
    const clean = tempXUsername.replace('@', '').trim();
    setXUsername(clean);
    setTempXUsername(clean);
  };

  const handleUnlinkX = () => {
    setXUsername('');
    setTempXUsername('');
  };

  const handlePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const { error: pwError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (pwError) {
      setError(pwError.message);
    } else {
      setMessage('Password updated');
      setNewPassword('');
      setConfirmPassword('');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <p className="text-zinc-400">Loading settings...</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const isCreator = profile?.account_type === 'creator';
  const initial = (displayName || username || 'U').charAt(0).toUpperCase();
  const minHoldPreview = (() => {
    const rate = parseFloat(voiceRate) || 0;
    const mins = parseInt(voiceMinMinutes, 10) || 3;
    return (rate * mins).toFixed(2);
  })();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="lg:hidden sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/account" className="text-zinc-400">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold">Settings</h1>
          </div>
          <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8 space-y-8">
            <div className="hidden lg:block">
              <h1 className="text-3xl font-bold mb-1">Settings</h1>
              <p className="text-zinc-400">Manage your profile and preferences</p>
            </div>
            {(message || error) && (
              <div
                className={`rounded-xl px-4 py-3 text-sm ${
                  error
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-pink-500/10 border border-pink-500/30 text-pink-400'
                }`}
              >
                {error || message}
              </div>
            )}

            {/* Avatar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Camera size={18} className="text-pink-500" /> Profile photo
              </h2>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-2xl font-bold">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatar}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Change photo'}
                  </button>
                  <p className="text-xs text-zinc-500 mt-2">JPG, PNG or WebP · Max 5MB</p>
                </div>
              </div>
            </div>

            {/* Profile */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <User size={18} className="text-pink-500" /> Profile
              </h2>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Username</label>
                <input
                  value={username}
                  disabled
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-500 cursor-not-allowed"
                />
                <p className="text-xs text-zinc-500 mt-1">Username can only be changed every 30 days</p>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500 resize-none"
                  placeholder="Tell people about yourself..."
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">X (Twitter)</label>
                {xUsername ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://x.com/${xUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-pink-400 hover:border-pink-500 transition"
                    >
                      <Link2 size={16} /> @{xUsername}
                    </a>
                    <button
                      type="button"
                      onClick={handleUnlinkX}
                      className="px-3 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500 transition"
                    >
                      <Unlink size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={tempXUsername}
                      onChange={(e) => setTempXUsername(e.target.value)}
                      placeholder="username"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={handleLinkX}
                      className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-sm font-medium transition"
                    >
                      Link
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
                <input
                  value={userEmail}
                  disabled
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-500 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Subscriptions */}
            {isCreator && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Heart size={18} className="text-pink-500" /> Subscriptions
                </h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable subscriptions</p>
                    <p className="text-sm text-zinc-400">Let fans subscribe monthly</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={subscriptionsEnabled}
                      onChange={() => setSubscriptionsEnabled(!subscriptionsEnabled)}
                    />
                    <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                  </label>
                </div>
                {subscriptionsEnabled && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Monthly price (£)</label>
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      value={subscriptionPrice}
                      onChange={(e) => setSubscriptionPrice(e.target.value)}
                      className="w-32 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Message price */}
            {isCreator && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <MessageCircle size={18} className="text-pink-500" /> Message price
                </h2>
                <p className="text-sm text-zinc-400">
                  Charge fans once to unlock messaging with you. Set to 0 for free messages.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-lg">£</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={messagePrice}
                    onChange={(e) => setMessagePrice(e.target.value)}
                    className="w-32 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500"
                  />
                </div>
              </div>
            )}

            
            {/* Minimum tip (creators) */}
            {profile?.account_type === 'creator' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={18} className="text-pink-500" />
                  <h2 className="font-semibold">Minimum tip</h2>
                </div>
                <p className="text-sm text-zinc-400">
                  Platform floor is £2. You can set higher so fans must tip at least this amount (live, chat, posts).
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">£</span>
                  <input
                    type="number"
                    min={2}
                    max={500}
                    step={1}
                    value={minTipGbp}
                    onChange={(e) => setMinTipGbp(e.target.value)}
                    className="w-28 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-pink-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[2, 5, 10, 20].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMinTipGbp(String(v))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                        Number(minTipGbp) === v
                          ? 'bg-pink-600 border-pink-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      £{v}
                    </button>
                  ))}
                </div>
              </div>
            )}

{/* Voice calls */}
            {isCreator && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Phone size={18} className="text-pink-500" /> Voice calls
                </h2>
                <p className="text-sm text-zinc-400">
                  Let subs request paid voice calls from chat. You’re charged on actual time, with a
                  minimum hold upfront.
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable voice calls</p>
                    <p className="text-sm text-zinc-400">Subs can request a call when this is on</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={voiceCallsEnabled}
                      onChange={() => setVoiceCallsEnabled(!voiceCallsEnabled)}
                    />
                    <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                  </label>
                </div>
                {voiceCallsEnabled && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-zinc-400 mb-1.5 block">
                          Price per minute (£)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                            £
                          </span>
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={voiceRate}
                            onChange={(e) => setVoiceRate(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-3 outline-none focus:border-pink-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400 mb-1.5 block">
                          Minimum minutes
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="15"
                          value={voiceMinMinutes}
                          onChange={(e) => setVoiceMinMinutes(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-3 outline-none focus:border-pink-500"
                        />
                        <p className="text-xs text-zinc-500 mt-1">Between 1 and 15</p>
                      </div>
                    </div>
                    <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-300">
                      Subs will see:{' '}
                      <span className="text-pink-400 font-medium">
                        £{parseFloat(voiceRate || '0').toFixed(2)}/min
                      </span>
                      {' · '}
                      minimum{' '}
                      <span className="text-pink-400 font-medium">
                        {voiceMinMinutes || 3} min (£{minHoldPreview} hold)
                      </span>
                    </div>

                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">
                        Maximum call length (minutes)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={voiceMaxMinutes}
                        onChange={(e) => setVoiceMaxMinutes(e.target.value)}
                        className="w-32 bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-3 outline-none focus:border-pink-500"
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Call auto-ends at this limit (5–120). Default 30.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                      <div>
                        <p className="font-medium">Away mode</p>
                        <p className="text-sm text-zinc-400">
                          One-tap: block all voice calls until you turn this off
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={voiceAway}
                          onChange={() => setVoiceAway(!voiceAway)}
                        />
                        <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                      </label>
                    </div>

                    {/* Do Not Disturb */}

                    <div className="pt-4 border-t border-zinc-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Do Not Disturb</p>
                          <p className="text-sm text-zinc-400">
                            Block new call requests during these hours
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={voiceDndEnabled}
                            onChange={() => setVoiceDndEnabled(!voiceDndEnabled)}
                          />
                          <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                        </label>
                      </div>
                      {voiceDndEnabled && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm text-zinc-400 mb-1.5 block">From</label>
                            <input
                              type="time"
                              value={voiceDndStart}
                              onChange={(e) => setVoiceDndStart(e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-3 outline-none focus:border-pink-500"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-zinc-400 mb-1.5 block">Until</label>
                            <input
                              type="time"
                              value={voiceDndEnd}
                              onChange={(e) => setVoiceDndEnd(e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-3 outline-none focus:border-pink-500"
                            />
                          </div>
                          <p className="col-span-2 text-xs text-zinc-500">
                            Overnight works (e.g. 22:00 → 08:00). Subs see “unavailable” if they
                            try to call during DND.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Auto-replies */}
            {isCreator && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Bot size={18} className="text-pink-500" /> Auto-replies
                </h2>
                <div className="space-y-3 pb-6 border-b border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Offline message reply</p>
                      <p className="text-sm text-zinc-400">
                        Once per chat when a fan messages you while offline
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={autoReplyEnabled}
                        onChange={() => setAutoReplyEnabled(!autoReplyEnabled)}
                      />
                      <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                    </label>
                  </div>
                  {autoReplyEnabled && (
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Message</label>
                      <textarea
                        value={autoReplyMessage}
                        onChange={(e) => setAutoReplyMessage(e.target.value)}
                        rows={3}
                        maxLength={300}
                        placeholder="Thanks for messaging! I'll reply as soon as I'm free 💕"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500 resize-none"
                      />
                      <p className="text-xs text-zinc-500 mt-1">{autoReplyMessage.length}/300</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3 pb-6 border-b border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-2">
                      <DollarSign size={18} className="text-pink-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Tip thank-you</p>
                        <p className="text-sm text-zinc-400">When someone tips you in chat</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={autoReplyTipEnabled}
                        onChange={() => setAutoReplyTipEnabled(!autoReplyTipEnabled)}
                      />
                      <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                    </label>
                  </div>
                  {autoReplyTipEnabled && (
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Thank-you message</label>
                      <textarea
                        value={autoReplyTipMessage}
                        onChange={(e) => setAutoReplyTipMessage(e.target.value)}
                        rows={3}
                        maxLength={300}
                        placeholder="Thank you so much for the tip! You're amazing 💕"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500 resize-none"
                      />
                      <p className="text-xs text-zinc-500 mt-1">{autoReplyTipMessage.length}/300</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-2">
                      <Unlock size={18} className="text-pink-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Unlock thank-you</p>
                        <p className="text-sm text-zinc-400">
                          When someone unlocks your locked photo or video
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={autoReplyUnlockEnabled}
                        onChange={() => setAutoReplyUnlockEnabled(!autoReplyUnlockEnabled)}
                      />
                      <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                    </label>
                  </div>
                  {autoReplyUnlockEnabled && (
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Thank-you message</label>
                      <textarea
                        value={autoReplyUnlockMessage}
                        onChange={(e) => setAutoReplyUnlockMessage(e.target.value)}
                        rows={3}
                        maxLength={300}
                        placeholder="Thank you for unlocking! Hope you enjoy 🔥"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500 resize-none"
                      />
                      <p className="text-xs text-zinc-500 mt-1">{autoReplyUnlockMessage.length}/300</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Password */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Lock size={18} className="text-pink-500" /> Password
              </h2>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-pink-500"
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
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Confirm password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500"
                />
              </div>
              <button
                type="button"
                onClick={handlePassword}
                disabled={saving || !newPassword}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50"
              >
                Update password
              </button>
            </div>


            {/* Live private */}
            {isCreator && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Radio size={18} className="text-pink-500" /> Live private
                </h2>
                <p className="text-sm text-zinc-400">
                  Let fans request a paid 1:1 during your public live. Public stream
                  pauses for everyone else while private runs.
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable private requests</p>
                    <p className="text-sm text-zinc-400">
                      Fans see a Private button on your lives
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={livePrivateEnabled}
                      onChange={() => setLivePrivateEnabled(!livePrivateEnabled)}
                    />
                    <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                  </label>
                </div>
                {livePrivateEnabled && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-zinc-400 mb-1.5 block">
                          Price per minute (£)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                            £
                          </span>
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={livePrivateRate}
                            onChange={(e) => setLivePrivateRate(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-3 outline-none focus:border-pink-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400 mb-1.5 block">
                          Minimum minutes
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={livePrivateMinMinutes}
                          onChange={(e) => setLivePrivateMinMinutes(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-3 outline-none focus:border-pink-500"
                        />
                        <p className="text-xs text-zinc-500 mt-1">Between 1 and 30</p>
                      </div>
                    </div>
                    <div className="bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-300">
                      Fans will see:{' '}
                      <span className="text-pink-400 font-medium">
                        £{parseFloat(livePrivateRate || '0').toFixed(2)}/min
                      </span>
                      {' · '}
                      minimum{' '}
                      <span className="text-pink-400 font-medium">
                        {livePrivateMinMinutes || 5} min
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notifications */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Bell size={18} className="text-pink-500" /> Notifications
              </h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Tips</p>
                  <p className="text-sm text-zinc-400">When someone tips you</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={emailTips}
                    onChange={() => setEmailTips(!emailTips)}
                  />
                  <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                </label>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                <div>
                  <p className="font-medium">Messages</p>
                  <p className="text-sm text-zinc-400">New direct messages</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={emailMessages}
                    onChange={() => setEmailMessages(!emailMessages)}
                  />
                  <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                </label>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                <div>
                  <p className="font-medium">Live alerts</p>
                  <p className="text-sm text-zinc-400">When creators you follow go live</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={emailLives}
                    onChange={() => setEmailLives(!emailLives)}
                  />
                  <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600" />
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 py-3.5 rounded-xl font-semibold transition disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
