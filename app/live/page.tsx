'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Radio, Loader2, Users, Video, X, ImagePlus } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

type LiveCard = {
  id: string;
  title: string;
  status: string;
  viewer_count?: number;
  tip_goal_gbp?: number;
  tip_raised_gbp?: number;
  thumbnail_url?: string | null;
  creator?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

async function compressThumb(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxW = 1280;
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not process image'))),
      'image/jpeg',
      0.82
    );
  });
}

export default function LiveIndexPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState<LiveCard[]>([]);
  const [error, setError] = useState('');
  const [isCreator, setIsCreator] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [liveTitle, setLiveTitle] = useState('');
  const [tipGoal, setTipGoal] = useState('');
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('account_type, display_name, username, avatar_url')
        .eq('id', user.id)
        .single();
      setIsCreator(data?.account_type === 'creator');
      if (data?.display_name || data?.username) {
        setLiveTitle(`${data.display_name || data.username} is live`);
      }
      // Soft default preview from avatar
      if (data?.avatar_url && !thumbPreview) {
        setThumbPreview(data.avatar_url);
      }
    })();
  }, []);

  const onPickThumb = (file: File | null) => {
    if (thumbPreview && thumbPreview.startsWith('blob:')) {
      URL.revokeObjectURL(thumbPreview);
    }
    if (!file) {
      setThumbFile(null);
      setThumbPreview(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Thumbnail must be an image');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Thumbnail max 8MB');
      return;
    }
    setError('');
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
  };

  const goLive = async () => {
    const title = liveTitle.trim() || 'Live now';
    if (title.length < 2) {
      setError('Add a title for your live');
      return;
    }
    setGoingLive(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || !userId) {
        throw new Error('Please log in again');
      }

      let thumbnailUrl: string | null = null;

      if (thumbFile) {
        const blob = await compressThumb(thumbFile);
        const form = new FormData();
        form.append(
          'file',
          new File([blob], 'live-thumb.jpg', { type: 'image/jpeg' })
        );
        const upRes = await fetch('/api/live/upload-thumb', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: form,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok) {
          throw new Error(upData.error || 'Thumbnail upload failed');
        }
        thumbnailUrl = upData.url;
      } else if (thumbPreview && !thumbPreview.startsWith('blob:')) {
        // existing avatar URL used as soft default
        thumbnailUrl = thumbPreview;
      }

      const res = await fetch('/api/live/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title,
          tip_goal_gbp: tipGoal ? Number(tipGoal) : 0,
          thumbnail_url: thumbnailUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not go live');
      setShowSetup(false);
      router.push(data.watchPath || `/live/${data.stream?.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed');
      setGoingLive(false);
    }
  };

  const load = async () => {
    try {
      const res = await fetch('/api/live/active');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load lives');
      setStreams(data.streams || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
          <div className="p-4 lg:p-8 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
                  <Radio className="text-pink-500" size={28} />
                  Live
                </h1>
                <p className="text-zinc-500 text-sm mt-1">
                  Creators broadcasting right now
                </p>
              </div>
              {isCreator && (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setShowSetup(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 font-semibold text-sm transition min-h-[48px]"
                >
                  <Video size={18} />
                  Go live
                </button>
              )}
            </div>

            {error && !showSetup && (
              <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-pink-500" size={28} />
              </div>
            ) : streams.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <Radio className="mx-auto text-zinc-600 mb-3" size={36} />
                <p className="text-zinc-200 font-medium text-lg">No one is live</p>
                <p className="text-sm text-zinc-500 mt-2">
                  When creators go live, they’ll show up here.
                </p>
                {isCreator && (
                  <button
                    type="button"
                    onClick={() => setShowSetup(true)}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-sm font-semibold"
                  >
                    <Video size={16} /> Be the first
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {streams.map((s) => {
                  const name =
                    s.creator?.display_name ||
                    (s.creator?.username
                      ? `@${s.creator.username}`
                      : 'Creator');
                  const cover =
                    s.thumbnail_url || s.creator?.avatar_url || null;
                  return (
                    <Link
                      key={s.id}
                      href={`/live/${s.id}`}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-pink-500/40 transition group active:scale-[0.99]"
                    >
                      <div className="aspect-video bg-zinc-800 relative">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-pink-950/30 flex items-center justify-center">
                            <Radio className="text-zinc-600" size={40} />
                          </div>
                        )}
                        <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                        <span className="absolute bottom-3 right-3 text-[11px] bg-black/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Users size={12} />
                          {s.viewer_count || 0}
                        </span>
                      </div>
                      <div className="p-4">
                        <p className="font-semibold truncate group-hover:text-pink-300 transition">
                          {s.title}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {s.creator?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.creator.avatar_url}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-zinc-700" />
                          )}
                          <span className="text-sm text-zinc-400 truncate">
                            {name}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Go live setup modal */}
        {showSetup && (
          <div className="fixed inset-0 z-[200] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden"
              style={{
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Video className="text-pink-500" size={20} /> Go live
                </h2>
                <button
                  type="button"
                  onClick={() => !goingLive && setShowSetup(false)}
                  className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-5 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* Thumbnail */}
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Cover image
                  </label>
                  <p className="text-[11px] text-zinc-500 mb-2">
                    Shown on the homepage and Live page. Use a clear photo of
                    you / your setup.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      onPickThumb(e.target.files?.[0] || null)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full aspect-video rounded-2xl border border-dashed border-zinc-600 bg-zinc-800/60 overflow-hidden relative group"
                  >
                    {thumbPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbPreview}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-2">
                        <ImagePlus size={28} />
                        <span className="text-sm font-medium">
                          Add cover photo
                        </span>
                      </div>
                    )}
                    {thumbPreview && (
                      <span className="absolute bottom-2 right-2 text-[11px] bg-black/70 px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition">
                        Change
                      </span>
                    )}
                  </button>
                  {thumbFile && (
                    <button
                      type="button"
                      onClick={() => onPickThumb(null)}
                      className="mt-2 text-xs text-zinc-400 hover:text-white"
                    >
                      Remove photo
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Stream title
                  </label>
                  <input
                    value={liveTitle}
                    onChange={(e) => setLiveTitle(e.target.value.slice(0, 80))}
                    placeholder="What are you streaming?"
                    maxLength={80}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1 text-right">
                    {liveTitle.length}/80
                  </p>
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Tip goal (optional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                      £
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={tipGoal}
                      onChange={(e) => setTipGoal(e.target.value)}
                      placeholder="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-3 text-sm outline-none focus:border-pink-500"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Fans will see a progress bar on your live.
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={goLive}
                  disabled={goingLive || !liveTitle.trim()}
                  className="w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {goingLive ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Starting…
                    </>
                  ) : (
                    <>
                      <Radio size={18} /> Start live
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Your browser will ask for camera & microphone
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
