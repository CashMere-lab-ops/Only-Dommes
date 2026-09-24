'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Plus,
  Trash2,
  X,
  Volume2,
  VolumeX,
  Send,
  Eye,
  Camera,
  Image as ImageIcon,
  SwitchCamera,
  Bookmark,
} from 'lucide-react';
import { createClient } from '../lib/supabase';
import { createImageThumbnail } from '../lib/createThumbnail';

export type StoryRow = {
  id: string;
  creator_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url?: string | null;
  duration_seconds?: number;
  caption?: string | null;
  caption_x?: number | null;
  caption_y?: number | null;
  caption_style?: 'classic' | 'neon' | 'box' | string | null;
  sticker?: 'subscribe' | 'live' | 'shop' | string | null;
  visibility?: 'everyone' | 'followers' | 'subscribers' | null;
  created_at: string;
  expires_at: string;
};

export type StoryCreator = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

export type StoryGroup = {
  creator: StoryCreator;
  stories: StoryRow[];
  unseen: number;
};

const PHOTO_SECS = 5;
const MAX_VIDEO_SECS = 60;
const MAX_STORY_FILE_MB = 80;

function nameOf(c: StoryCreator) {
  return c.display_name || (c.username ? `@${c.username}` : 'Creator');
}

export function queuePostToStory(post: {
  media_url?: string | null;
  thumbnail_url?: string | null;
  media_type?: string | null;
  content?: string | null;
}) {
  const url = post.media_url || post.thumbnail_url;
  if (!url) {
    alert('This post has no photo or video to add');
    return;
  }
  try {
    sessionStorage.setItem(
      'wod-story-share',
      JSON.stringify({
        url,
        thumb: post.thumbnail_url || url,
        kind: post.media_type === 'video' && post.media_url ? 'video' : 'image',
        caption: String(post.content || '').slice(0, 80),
      })
    );
  } catch {
    alert('Could not open story');
    return;
  }
  window.location.href = '/?addstory=1';
}

async function cropToStoryFrame(
  url: string,
  panX: number,
  panY: number,
  zoom: number
) {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not load image'));
    el.src = url;
  });
  const fw = 1080;
  const fh = 1920;
  const z = Math.max(1, Math.min(3, zoom || 1));
  const cover = Math.max(fw / img.width, fh / img.height) * z;
  const dw = img.width * cover;
  const dh = img.height * cover;
  const dx = (fw - dw) / 2 + panX * fw;
  const dy = (fh - dh) / 2 + panY * fh;
  const canvas = document.createElement('canvas');
  canvas.width = fw;
  canvas.height = fh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Crop failed');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, fw, fh);
  ctx.drawImage(img, dx, dy, dw, dh);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  );
  if (!blob) throw new Error('Crop failed');
  return new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

function captionClass(style?: string | null) {
  if (style === 'neon') {
    return 'text-pink-300 text-2xl font-black tracking-wide drop-shadow-[0_0_12px_rgba(244,114,182,0.85)]';
  }
  if (style === 'box') {
    return 'text-white text-lg font-semibold bg-black/70 px-3 py-1.5 rounded-xl';
  }
  return 'text-white text-xl font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]';
}

export default function StoriesRail({
  userId,
  isCreator,
  myProfile,
  followingIds,
}: {
  userId: string | null;
  isCreator?: boolean;
  myProfile?: StoryCreator | null;
  followingIds: string[];
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{
    file: File;
    url: string;
    kind: 'image' | 'video';
    duration: number;
    caption: string;
    captionX: number;
    captionY: number;
    captionStyle: 'classic' | 'neon' | 'box';
    sticker: 'subscribe' | 'live' | 'shop' | null;
    cropX: number;
    cropY: number;
    cropZoom: number;
    visibility: 'everyone' | 'followers' | 'subscribers';
  } | null>(null);
  const [open, setOpen] = useState<{ groupIndex: number; storyIndex: number } | null>(
    null
  );
  const [queue, setQueue] = useState<File[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const openAdd = () => setAddOpen(true);

  const load = useCallback(async () => {
    if (!userId) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ids = [...new Set([userId, ...followingIds])].filter(Boolean);
      if (!ids.length) {
        setGroups([]);
        return;
      }
      const { data: rows, error: qErr } = await supabase
        .from('stories')
        .select(
          'id, creator_id, media_url, media_type, thumbnail_url, duration_seconds, caption, caption_x, caption_y, caption_style, sticker, visibility, created_at, expires_at'
        )
        .in('creator_id', ids)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(200);
      if (qErr) throw qErr;
      const list = (rows || []) as StoryRow[];
      const creatorIds = [...new Set(list.map((s) => s.creator_id))];
      const people: Record<string, StoryCreator> = {};
      if (creatorIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', creatorIds);
        (profiles || []).forEach((p: any) => {
          people[p.id] = p;
        });
      }
      if (myProfile?.id) people[myProfile.id] = { ...people[myProfile.id], ...myProfile };

      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', userId);
      const seen = new Set((views || []).map((v: any) => v.story_id));

      const byCreator: Record<string, StoryRow[]> = {};
      list.forEach((s) => {
        if (!byCreator[s.creator_id]) byCreator[s.creator_id] = [];
        byCreator[s.creator_id].push(s);
      });

      const next: StoryGroup[] = Object.keys(byCreator).map((cid) => {
        const stories = byCreator[cid];
        const creator =
          people[cid] ||
          ({ id: cid, username: null, display_name: null, avatar_url: null } as StoryCreator);
        return {
          creator,
          stories,
          unseen: stories.filter((s) => !seen.has(s.id)).length,
        };
      });

      next.sort((a, b) => {
        if (a.creator.id === userId) return -1;
        if (b.creator.id === userId) return 1;
        if (a.unseen && !b.unseen) return -1;
        if (!a.unseen && b.unseen) return 1;
        const aT = a.stories[a.stories.length - 1]?.created_at || '';
        const bT = b.stories[b.stories.length - 1]?.created_at || '';
        return bT.localeCompare(aT);
      });
      setGroups(next);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, followingIds.join('|'), myProfile?.id, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isCreator || typeof window === 'undefined') return;
    const shareRaw = sessionStorage.getItem('wod-story-share');
    const wantAdd = new URLSearchParams(window.location.search).get('addstory') === '1';
    if (!shareRaw && !wantAdd) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (!shareRaw) {
      const t = window.setTimeout(() => setAddOpen(true), 250);
      return () => window.clearTimeout(t);
    }
    sessionStorage.removeItem('wod-story-share');
    let cancelled = false;
    (async () => {
      try {
        const parsed = JSON.parse(shareRaw) as {
          url: string;
          thumb?: string;
          kind?: string;
          caption?: string;
        };
        const tryUrl = parsed.kind === 'video' ? parsed.url : parsed.url;
        const res = await fetch(tryUrl);
        if (!res.ok) throw new Error('fetch');
        const blob = await res.blob();
        const file = new File(
          [blob],
          parsed.kind === 'video' ? 'share.mp4' : 'share.jpg',
          { type: blob.type || (parsed.kind === 'video' ? 'video/mp4' : 'image/jpeg') }
        );
        let next = await prepareFile(file);
        if (!next && parsed.thumb && parsed.thumb !== tryUrl) {
          const r2 = await fetch(parsed.thumb);
          const b2 = await r2.blob();
          next = await prepareFile(
            new File([b2], 'share.jpg', { type: b2.type || 'image/jpeg' })
          );
        }
        if (cancelled || !next) {
          setError('Could not add that post to a story');
          return;
        }
        next.caption = parsed.caption || '';
        setDraft(next);
      } catch {
        if (!cancelled) setError('Could not add that post to a story');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreator]);

  const prepareFile = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('Photo or video only');
      return null;
    }
    if (file.size > MAX_STORY_FILE_MB * 1024 * 1024) {
      setError(`Max ${MAX_STORY_FILE_MB}MB`);
      return null;
    }
    let duration = PHOTO_SECS;
    if (isVideo) {
      const ok = await new Promise<boolean>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          const d = Number(v.duration || 0);
          URL.revokeObjectURL(v.src);
          if (!Number.isFinite(d) || d <= 0) {
            setError('Could not read video');
            resolve(false);
            return;
          }
          if (d > MAX_VIDEO_SECS + 0.4) {
            setError(`Video stories can be up to ${MAX_VIDEO_SECS} seconds`);
            resolve(false);
            return;
          }
          duration = Math.max(1, Math.min(MAX_VIDEO_SECS, Math.ceil(d)));
          resolve(true);
        };
        v.onerror = () => {
          URL.revokeObjectURL(v.src);
          setError('Could not read video');
          resolve(false);
        };
        v.src = URL.createObjectURL(file);
      });
      if (!ok) return null;
    }
    return {
      file,
      url: URL.createObjectURL(file),
      kind: (isImage ? 'image' : 'video') as 'image' | 'video',
      duration,
      caption: '',
      captionX: 50,
      captionY: 70,
      captionStyle: 'classic' as const,
      sticker: null,
      cropX: 0,
      cropY: 0,
      cropZoom: 1,
      visibility: 'everyone' as const,
    };
  };

  const onPickFiles = async (files: FileList | File[] | null) => {
    if (!files || !userId || uploading) return;
    setError('');
    const list = Array.from(files).slice(0, 10);
    if (!list.length) return;
    const first = await prepareFile(list[0]);
    if (!first) return;
    setQueue(list.slice(1));
    setDraft(first);
    if (fileRef.current) fileRef.current.value = '';
  };

  const publishDraft = async () => {
    if (!draft || !userId || uploading) return;
    setUploading(true);
    setError('');
    try {
      const stamp = Date.now();
      let fileToUpload = draft.file;
      if (draft.kind === 'image') {
        fileToUpload = await cropToStoryFrame(
          draft.url,
          draft.cropX,
          draft.cropY,
          draft.cropZoom
        );
      }
      const ext = (
        fileToUpload.name.split('.').pop() || (draft.kind === 'image' ? 'jpg' : 'mp4')
      ).toLowerCase();
      const path = `${userId}/stories/${stamp}.${ext}`;
      const { error: upErr } = await supabase.storage.from('posts').upload(path, fileToUpload, {
        contentType: fileToUpload.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;
      const publicUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;

      let thumb: string | null = null;
      if (draft.kind === 'image') {
        try {
          const t = await createImageThumbnail(fileToUpload, 640, 0.7);
          const tPath = `${userId}/stories/thumb-${stamp}.jpg`;
          const { error: tErr } = await supabase.storage.from('posts').upload(tPath, t, {
            contentType: 'image/jpeg',
            upsert: false,
          });
          if (!tErr) {
            thumb = supabase.storage.from('posts').getPublicUrl(tPath).data.publicUrl;
          }
        } catch {
          /* optional */
        }
      }

      const { error: insErr } = await supabase.from('stories').insert({
        creator_id: userId,
        media_url: publicUrl,
        media_type: draft.kind,
        thumbnail_url: thumb,
        duration_seconds: draft.duration,
        caption: draft.caption || null,
        caption_x: draft.captionX,
        caption_y: draft.captionY,
        caption_style: draft.captionStyle,
        sticker: draft.sticker,
        visibility: draft.visibility || 'everyone',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insErr) throw insErr;
      URL.revokeObjectURL(draft.url);
      const rest = queue.slice();
      setQueue([]);
      if (rest.length) {
        const next = await prepareFile(rest[0]);
        setQueue(rest.slice(1));
        setDraft(next);
      } else {
        setDraft(null);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not post story');
    } finally {
      setUploading(false);
    }
  };

  const myGroup = groups.find((g) => g.creator.id === userId);
  const others = groups.filter((g) => g.creator.id !== userId);
  const showAdd = !!isCreator && !!userId;

  if (!userId) return null;
  if (!loading && !showAdd && groups.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3.5 px-0.5">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-zinc-500">
          Stories
        </p>
        {showAdd && (
          <button
            type="button"
            onClick={openAdd}
            className="text-[11px] font-medium tracking-wide text-zinc-400 hover:text-white transition-colors"
          >
            New
          </button>
        )}
      </div>
      <div className="flex items-start gap-4 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
        {showAdd && (
          <div className="flex-shrink-0 w-[74px] text-center">
            <div className="relative mx-auto w-[68px] h-[68px]">
            <button
              type="button"
              onClick={() => {
                if (myGroup && myGroup.stories.length) {
                  const idx = groups.findIndex((g) => g.creator.id === userId);
                  setOpen({ groupIndex: Math.max(0, idx), storyIndex: 0 });
                } else {
                  openAdd();
                }
              }}
              className="block w-full"
            >
              <div
                className={`w-[68px] h-[68px] rounded-full p-[2px] ${
                  myGroup?.unseen
                    ? 'bg-[conic-gradient(from_200deg,#f9a8d4,#fb7185,#fbbf24,#f9a8d4)]'
                    : myGroup
                      ? 'bg-zinc-600'
                      : 'bg-zinc-800'
                }`}
              >
                <div className="w-full h-full rounded-full bg-zinc-950 p-[2.5px] overflow-hidden">
                  {myProfile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={myProfile.avatar_url}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center font-bold">
                      {(nameOf(myProfile || { id: userId })[0] || 'Y').toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openAdd();
                }}
                className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-pink-600 border-[2.5px] border-zinc-950 flex items-center justify-center shadow-lg"
                title="Add another story"
              >
                {uploading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={13} strokeWidth={2.5} />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-400 truncate tracking-wide">Your story</p>
          </div>
        )}

        {loading && groups.length === 0 &&
          [0, 1, 2, 3].map((n) => (
            <div key={n} className="flex-shrink-0 w-[74px] text-center">
              <div className="mx-auto w-[68px] h-[68px] rounded-full bg-zinc-900 animate-pulse" />
              <div className="mx-auto mt-2 h-2 w-10 rounded bg-zinc-900 animate-pulse" />
            </div>
          ))}

        {others.map((g) => {
          const gi = groups.findIndex((x) => x.creator.id === g.creator.id);
          return (
            <button
              key={g.creator.id}
              type="button"
              onClick={() => setOpen({ groupIndex: gi, storyIndex: 0 })}
              className="flex-shrink-0 w-[74px] text-center"
            >
              <div
                className={`mx-auto w-[68px] h-[68px] rounded-full p-[2px] ${
                  g.unseen
                    ? 'bg-[conic-gradient(from_200deg,#f9a8d4,#fb7185,#fbbf24,#f9a8d4)]'
                    : 'bg-zinc-700'
                }`}
              >
                <div className="w-full h-full rounded-full bg-zinc-950 p-[2px] overflow-hidden">
                  {g.creator.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.creator.avatar_url}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center font-bold">
                      {nameOf(g.creator)[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-400 truncate tracking-wide">
                {nameOf(g.creator)}
              </p>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => void onPickFiles(e.target.files)}
      />

      {addOpen && (
        <div
          className="fixed inset-0 z-[230] bg-black/60 flex items-end sm:items-center justify-center"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="w-full sm:max-w-sm bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" />
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-zinc-500 mb-4 text-center">
              New story
            </p>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setCameraOpen(true);
              }}
              className="w-full h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3 px-4 mb-2"
            >
              <Camera size={18} className="text-pink-400" />
              <span className="text-sm font-medium">Camera</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                fileRef.current?.click();
              }}
              className="w-full h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3 px-4"
            >
              <ImageIcon size={18} className="text-pink-400" />
              <span className="text-sm font-medium">Photo library</span>
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="w-full h-11 mt-2 text-sm text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {cameraOpen && (
        <StoryCamera
          onClose={() => setCameraOpen(false)}
          onLibrary={() => {
            setCameraOpen(false);
            fileRef.current?.click();
          }}
          onCapture={(file) => {
            setCameraOpen(false);
            void onPickFiles([file]);
          }}
        />
      )}

      {draft && (
        <StoryComposer
          draft={draft}
          uploading={uploading}
          onCancel={() => {
            URL.revokeObjectURL(draft.url);
            setDraft(null);
          }}
          onShare={() => void publishDraft()}
          onMeta={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
        />
      )}

      {open && groups[open.groupIndex] && (
        <StoryViewer
          groups={groups}
          groupIndex={open.groupIndex}
          storyIndex={open.storyIndex}
          userId={userId}
          onClose={() => {
            setOpen(null);
            void load();
          }}
          onAdd={openAdd}
        />
      )}
    </div>
  );
}

export function ProfileStoryRing({
  profileId,
  userId,
  avatarUrl,
  name,
  username,
  live,
  children,
}: {
  profileId: string;
  userId: string | null;
  avatarUrl?: string | null;
  name: string;
  username?: string | null;
  live?: boolean;
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('stories')
        .select(
          'id, creator_id, media_url, media_type, thumbnail_url, duration_seconds, caption, caption_x, caption_y, caption_style, sticker, visibility, created_at, expires_at'
        )
        .eq('creator_id', profileId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (!alive) return;
      const list = (data || []) as StoryRow[];
      setStories(list);
      if (userId && list.length) {
        const { data: views } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', userId)
          .in(
            'story_id',
            list.map((s) => s.id)
          );
        const seen = new Set((views || []).map((v: any) => v.story_id));
        setUnseen(list.filter((s) => !seen.has(s.id)).length);
      } else {
        setUnseen(list.length);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileId, userId, supabase]);

  if (!stories.length) return <>{children}</>;

  const group: StoryGroup = {
    creator: {
      id: profileId,
      username,
      display_name: name,
      avatar_url: avatarUrl,
    },
    stories,
    unseen,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full p-[3px] ${
          live
            ? 'bg-red-500'
            : unseen
              ? 'bg-gradient-to-br from-pink-400 via-rose-500 to-amber-400'
              : 'bg-zinc-600'
        }`}
        title="View story"
      >
        {children}
      </button>
      {open && (
        <StoryViewer
          groups={[group]}
          groupIndex={0}
          storyIndex={0}
          userId={userId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function HighlightRail({
  profileId,
  userId,
  name,
  username,
  avatarUrl,
  isOwner,
}: {
  profileId: string;
  userId: string | null;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  isOwner?: boolean;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<{ id: string; title: string; cover_url?: string | null }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<StoryRow[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('story_highlights')
        .select('id, title, cover_url')
        .eq('creator_id', profileId)
        .order('created_at', { ascending: true });
      if (!alive) return;
      if (error) {
        setLoadError(error.message || 'Could not load highlights');
        setRows([]);
        return;
      }
      setLoadError('');
      setRows((data || []) as any);
    })();
    return () => {
      alive = false;
    };
  }, [profileId, supabase]);

  const openHighlight = async (id: string) => {
    const { data } = await supabase
      .from('story_highlight_items')
      .select(
        'id, media_url, media_type, thumbnail_url, caption, caption_x, caption_y, caption_style, sticker, duration_seconds, created_at'
      )
      .eq('highlight_id', id)
      .order('created_at', { ascending: true });
    const list: StoryRow[] = (data || []).map((r: any) => ({
      id: r.id,
      creator_id: profileId,
      media_url: r.media_url,
      media_type: r.media_type,
      thumbnail_url: r.thumbnail_url,
      caption: r.caption,
      caption_x: r.caption_x,
      caption_y: r.caption_y,
      caption_style: r.caption_style,
      sticker: r.sticker,
      duration_seconds: r.duration_seconds,
      created_at: r.created_at,
      expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    }));
    if (!list.length) return;
    setItems(list);
    setOpenId(id);
  };

  const removeHighlight = async (id: string) => {
    if (!isOwner) return;
    if (!confirm('Delete this highlight?')) return;
    await supabase.from('story_highlights').delete().eq('id', id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (!rows.length && !isOwner && !loadError) return null;

  const group: StoryGroup = {
    creator: {
      id: profileId,
      username,
      display_name: name,
      avatar_url: avatarUrl,
    },
    stories: items,
    unseen: 0,
  };

  return (
    <div className="mb-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-zinc-500 mb-3">
        Highlights
      </p>
      {loadError && (
        <p className="text-xs text-red-400 mb-2">
          {loadError.includes('does not exist')
            ? 'Run sql/story_highlights.sql in Supabase, then refresh.'
            : loadError}
        </p>
      )}
      {!rows.length && isOwner && !loadError && (
        <p className="text-sm text-zinc-500 mb-2">
          Open one of your stories and tap the bookmark to save a highlight here.
        </p>
      )}
      <div className="flex items-start gap-3.5 overflow-x-auto scrollbar-none pb-1">
        {rows.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => void openHighlight(h.id)}
            onContextMenu={(e) => {
              if (!isOwner) return;
              e.preventDefault();
              void removeHighlight(h.id);
            }}
            className="flex-shrink-0 w-[72px] text-center"
          >
            <div className="mx-auto w-[64px] h-[64px] rounded-full p-[2px] bg-zinc-700">
              <div className="w-full h-full rounded-full bg-zinc-950 p-[2px] overflow-hidden">
                {h.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.cover_url} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <div className="w-full h-full rounded-full bg-zinc-800" />
                )}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-300 truncate">{h.title}</p>
          </button>
        ))}
      </div>
      {isOwner && (
        <p className="text-[10px] text-zinc-600 mt-1">Hold a highlight to delete</p>
      )}
      {openId && items.length > 0 && (
        <StoryViewer
          groups={[group]}
          groupIndex={0}
          storyIndex={0}
          userId={userId}
          permanent
          onClose={() => {
            setOpenId(null);
            setItems([]);
          }}
        />
      )}
    </div>
  );
}

function pickRecorderMime() {
  const types = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function StoryCamera({
  onClose,
  onLibrary,
  onCapture,
}: {
  onClose: () => void;
  onLibrary: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCam = useCallback(async (face: 'user' | 'environment') => {
    setError('');
    setReady(false);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: face,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: face },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        setError('Camera permission needed');
      }
    }
  }, []);

  useEffect(() => {
    void startCam(facing);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopStream();
    };
  }, [facing, startCam]);

  const takePhoto = async () => {
    const v = videoRef.current;
    if (!v || !ready) return;
    const w = v.videoWidth || 1080;
    const h = v.videoHeight || 1920;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    if (!blob) return;
    stopStream();
    onCapture(new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  };

  const stopRec = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  };

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream || recording) return;
    const mime = pickRecorderMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      setError('Recording not supported on this browser');
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      stopStream();
      onCapture(new File([blob], `story-${Date.now()}.${ext}`, { type }));
    };
    recRef.current = rec;
    rec.start(200);
    setSecs(0);
    setRecording(true);
    tickRef.current = window.setInterval(() => {
      setSecs((n) => {
        if (n + 1 >= MAX_VIDEO_SECS) {
          stopRec();
          return MAX_VIDEO_SECS;
        }
        return n + 1;
      });
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-[245] bg-black flex flex-col">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${
          facing === 'user' ? 'scale-x-[-1]' : ''
        }`}
      />
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(0.8rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
        >
          <X size={18} />
        </button>
        <p className="text-sm font-semibold">
          {recording ? `${secs}s` : mode === 'photo' ? 'Photo' : 'Video'}
        </p>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
        >
          <SwitchCamera size={18} />
        </button>
      </div>

      {error ? (
        <p className="relative z-10 text-center text-sm text-red-300 mt-4">{error}</p>
      ) : null}

      <div className="relative z-10 mt-auto px-5 pb-[max(1.2rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-center gap-8 mb-5">
          <button
            type="button"
            onClick={() => !recording && setMode('photo')}
            className={`text-xs font-semibold ${
              mode === 'photo' ? 'text-white' : 'text-white/45'
            }`}
          >
            PHOTO
          </button>
          <button
            type="button"
            onClick={() => !recording && setMode('video')}
            className={`text-xs font-semibold ${
              mode === 'video' ? 'text-pink-400' : 'text-white/45'
            }`}
          >
            VIDEO
          </button>
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onLibrary}
            className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center"
          >
            <ImageIcon size={18} />
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (mode === 'photo') void takePhoto();
              else if (recording) stopRec();
              else startRec();
            }}
            className={`w-[74px] h-[74px] rounded-full border-[4px] flex items-center justify-center ${
              recording ? 'border-red-500' : 'border-white'
            }`}
          >
            <span
              className={`${
                recording
                  ? 'w-7 h-7 rounded-md bg-red-500'
                  : mode === 'video'
                    ? 'w-14 h-14 rounded-full bg-red-500'
                    : 'w-14 h-14 rounded-full bg-white'
              }`}
            />
          </button>
          <span className="w-11" />
        </div>
        <p className="text-[11px] text-white/50 text-center mt-3">
          {mode === 'photo' ? 'Tap to capture' : recording ? 'Tap to stop' : `Tap to record · max ${MAX_VIDEO_SECS}s`}
        </p>
      </div>
    </div>
  );
}

function StoryComposer({
  draft,
  uploading,
  onCancel,
  onShare,
  onMeta,
}: {
  draft: {
    file: File;
    url: string;
    kind: 'image' | 'video';
    duration: number;
    caption: string;
    captionX: number;
    captionY: number;
    captionStyle: 'classic' | 'neon' | 'box';
    sticker: 'subscribe' | 'live' | 'shop' | null;
    cropX: number;
    cropY: number;
    cropZoom: number;
    visibility: 'everyone' | 'followers' | 'subscribers';
  };
  uploading: boolean;
  onCancel: () => void;
  onShare: () => void;
  onMeta: (patch: {
    caption?: string;
    captionX?: number;
    captionY?: number;
    captionStyle?: 'classic' | 'neon' | 'box';
    sticker?: 'subscribe' | 'live' | 'shop' | null;
    cropX?: number;
    cropY?: number;
    cropZoom?: number;
    visibility?: 'everyone' | 'followers' | 'subscribers';
  }) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const onTextDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { x: e.clientX, y: e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onTextMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !stageRef.current) return;
    const box = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    onMeta({
      captionX: Math.max(8, Math.min(92, x)),
      captionY: Math.max(10, Math.min(88, y)),
    });
  };
  const onTextUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[240] bg-black flex flex-col select-none [-webkit-user-select:none] [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden">
        {draft.kind === 'video' ? (
          <video
            src={draft.url}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover bg-black pointer-events-none"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={draft.url}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover bg-black select-none [-webkit-touch-callout:none] origin-center"
            style={{
              transform: `translate(${draft.cropX * 100}%, ${draft.cropY * 100}%) scale(${draft.cropZoom})`,
            }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('[data-story-text]')) return;
              panRef.current = {
                x: e.clientX,
                y: e.clientY,
                px: draft.cropX,
                py: draft.cropY,
              };
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerMove={(e) => {
              if (!panRef.current || !stageRef.current) return;
              const box = stageRef.current.getBoundingClientRect();
              const dx = (e.clientX - panRef.current.x) / box.width;
              const dy = (e.clientY - panRef.current.y) / box.height;
              onMeta({
                cropX: Math.max(-0.35, Math.min(0.35, panRef.current.px + dx)),
                cropY: Math.max(-0.35, Math.min(0.35, panRef.current.py + dy)),
              });
            }}
            onPointerUp={() => {
              panRef.current = null;
            }}
            onPointerCancel={() => {
              panRef.current = null;
            }}
          />
        )}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        {draft.caption.trim() ? (
          <button
            type="button"
            data-story-text="1"
            className={`absolute z-20 max-w-[80%] px-1 text-center leading-tight ${captionClass(
              draft.captionStyle
            )}`}
            style={{
              left: `${draft.captionX}%`,
              top: `${draft.captionY}%`,
              transform: 'translate(-50%, -50%)',
              touchAction: 'none',
            }}
            onPointerDown={onTextDown}
            onPointerMove={onTextMove}
            onPointerUp={onTextUp}
            onPointerCancel={onTextUp}
          >
            {draft.caption}
          </button>
        ) : null}
        {draft.sticker ? (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 pointer-events-none">
            <span className="inline-flex items-center h-9 px-4 rounded-full bg-pink-600 text-sm font-semibold">
              {draft.sticker === 'subscribe'
                ? 'Subscribe'
                : draft.sticker === 'live'
                  ? 'Join live'
                  : 'Shop'}
            </span>
          </div>
        ) : null}
        <div className="absolute top-0 left-0 right-0 px-4 pt-[max(0.9rem,env(safe-area-inset-top))] flex items-center justify-between z-10">
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-full bg-black/45 backdrop-blur flex items-center justify-center"
          >
            <X size={18} />
          </button>
          <p className="text-sm font-semibold">New story</p>
          <span className="w-10" />
        </div>
      </div>
      <div className="relative z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 space-y-3">
        <input
          value={draft.caption}
          onChange={(e) => onMeta({ caption: e.target.value.slice(0, 80) })}
          maxLength={80}
          placeholder="Add text — then drag it on the photo"
          className="w-full h-11 rounded-xl bg-white/10 border border-white/15 px-3 text-sm outline-none placeholder:text-white/40"
        />
        <div className="flex gap-1.5">
          {(
            [
              ['classic', 'Classic'],
              ['neon', 'Neon'],
              ['box', 'Box'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onMeta({ captionStyle: id })}
              className={`flex-1 h-9 rounded-full text-xs font-medium ${
                draft.captionStyle === id
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ['everyone', 'Everyone'],
              ['followers', 'Followers'],
              ['subscribers', 'Subs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onMeta({ visibility: id })}
              className={`flex-1 h-9 rounded-full text-xs font-medium ${
                draft.visibility === id
                  ? 'bg-pink-600 text-white'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(
            [
              [null, 'No sticker'],
              ['subscribe', 'Subscribe'],
              ['live', 'Live'],
              ['shop', 'Shop'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => onMeta({ sticker: id })}
              className={`flex-1 h-9 rounded-full text-[11px] font-medium ${
                draft.sticker === id
                  ? 'bg-pink-600 text-white'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {draft.kind === 'image' && (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() =>
                onMeta({ cropZoom: Math.max(1, Number((draft.cropZoom - 0.15).toFixed(2))) })
              }
              className="w-9 h-9 rounded-full bg-white/10 text-lg"
            >
              −
            </button>
            <p className="text-[11px] text-zinc-400 w-24 text-center">
              Drag to crop · {Math.round(draft.cropZoom * 100)}%
            </p>
            <button
              type="button"
              onClick={() =>
                onMeta({ cropZoom: Math.min(3, Number((draft.cropZoom + 0.15).toFixed(2))) })
              }
              className="w-9 h-9 rounded-full bg-white/10 text-lg"
            >
              +
            </button>
          </div>
        )}
        <p className="text-[11px] text-zinc-400 text-center">
          Visible 24 hours ·{' '}
          {draft.kind === 'video'
            ? `${draft.duration}s video (max ${MAX_VIDEO_SECS}s)`
            : '9:16 photo'}
        </p>
        <button
          type="button"
          onClick={onShare}
          disabled={uploading}
          className="w-full h-12 rounded-2xl bg-pink-600 hover:bg-pink-500 disabled:opacity-60 font-semibold flex items-center justify-center gap-2"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : null}
          {uploading ? 'Posting' : 'Share'}
        </button>
      </div>
    </div>
  );
}

function StoryViewer({
  groups,
  groupIndex,
  storyIndex,
  userId,
  onClose,
  onAdd,
  permanent = false,
}: {
  groups: StoryGroup[];
  groupIndex: number;
  storyIndex: number;
  userId: string | null;
  onClose: () => void;
  onAdd?: () => void;
  permanent?: boolean;
}) {
  const supabase = createClient();
  const [gi, setGi] = useState(groupIndex);
  const [si, setSi] = useState(storyIndex);
  const [paused, setPaused] = useState(false);
  const [holdUi, setHoldUi] = useState(false);
  const barsWrapRef = useRef<HTMLDivElement | null>(null);
  const progressValue = useRef(0);

  const syncBars = (activeP = 0) => {
    const wrap = barsWrapRef.current;
    if (!wrap) return;
    wrap.querySelectorAll<HTMLElement>('[data-story-bar]').forEach((el) => {
      const state = el.getAttribute('data-story-bar');
      if (state === 'done') el.style.transform = 'scaleX(1)';
      else if (state === 'active') el.style.transform = `scaleX(${Math.max(0, Math.min(1, activeP))})`;
      else el.style.transform = 'scaleX(0)';
    });
  };

  const paintProgress = (p: number) => {
    progressValue.current = Math.max(0, Math.min(1, p));
    syncBars(progressValue.current);
  };
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdRef = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const gesture = useRef({
    id: 0,
    x: 0,
    y: 0,
    t: 0,
    moved: false,
    mode: 'none' as 'none' | 'hold' | 'vert' | 'horiz',
  });
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const group = groups[gi];
  const story = group?.stories[si];
  const isOwn = !!(userId && group && group.creator.id === userId);
  const [viewsCount, setViewsCount] = useState<number | null>(null);
  const [viewers, setViewers] = useState<
    {
      id: string;
      name: string;
      username?: string | null;
      avatar?: string | null;
      at: string;
    }[]
  >([]);
  const [showViewers, setShowViewers] = useState(false);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const [highlights, setHighlights] = useState<{ id: string; title: string; cover_url?: string | null }[]>(
    []
  );
  const [hlTitle, setHlTitle] = useState('');
  const [hlBusy, setHlBusy] = useState(false);
  const [hlSaved, setHlSaved] = useState(false);
  const [liveHref, setLiveHref] = useState<string | null>(null);

  const markViewed = useCallback(
    async (row: StoryRow) => {
      if (permanent || !userId || userId === row.creator_id) return;
      try {
        await supabase.from('story_views').upsert(
          { story_id: row.id, viewer_id: userId },
          { onConflict: 'story_id,viewer_id' }
        );
      } catch {
        /* ignore */
      }
    },
    [userId, supabase]
  );

  useEffect(() => {
    if (story) void markViewed(story);
  }, [story?.id, markViewed]);

  useEffect(() => {
    setLiveHref(null);
    if (!story || story.sticker !== 'live') return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('live_streams')
        .select('id')
        .eq('creator_id', story.creator_id)
        .eq('status', 'live')
        .maybeSingle();
      if (alive) setLiveHref(data?.id ? `/live/${data.id}` : '/live');
    })();
    return () => {
      alive = false;
    };
  }, [story?.id, story?.sticker, story?.creator_id, supabase]);

  useEffect(() => {
    if (!isOwn || !story) {
      setViewsCount(null);
      return;
    }
    void (async () => {
      const { count } = await supabase
        .from('story_views')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', story.id);
      setViewsCount(count || 0);
    })();
  }, [isOwn, story?.id, supabase]);

  const goNext = useCallback(() => {
    if (!group) return;
    if (si + 1 < group.stories.length) {
      setSi((n) => n + 1);
      return;
    }
    if (gi + 1 < groups.length) {
      setGi((n) => n + 1);
      setSi(0);
      return;
    }
    onClose();
  }, [group, si, gi, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) {
      setSi((n) => n - 1);
      return;
    }
    if (gi > 0) {
      const prev = groups[gi - 1];
      setGi((n) => n - 1);
      setSi(Math.max(0, (prev?.stories.length || 1) - 1));
    }
  }, [si, gi, groups]);

  useEffect(() => {
    progressValue.current = 0;
    const id = window.requestAnimationFrame(() => syncBars(0));
    setPaused(false);
    setHoldUi(false);
    setDrag({ x: 0, y: 0 });
    setReply('');
    setReplySent(false);
    setReplyOpen(false);
    setShowViewers(false);
    return () => window.cancelAnimationFrame(id);
  }, [story?.id, si]);

  useEffect(() => {
    if (replyOpen || showViewers || hlOpen) setPaused(true);
  }, [replyOpen, showViewers, hlOpen]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted, story?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else void v.play().catch(() => {});
  }, [paused, story?.id]);

  useEffect(() => {
    if (!story || paused) return;
    let raf = 0;
    let stopped = false;
    if (story.media_type === 'video') {
      const tick = () => {
        if (stopped) return;
        const v = videoRef.current;
        if (v && v.duration) paintProgress(v.currentTime / v.duration);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => {
        stopped = true;
        cancelAnimationFrame(raf);
      };
    }
    const total = Math.max(3, Number(story.duration_seconds || PHOTO_SECS)) * 1000;
    const from = progressValue.current;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (stopped) return;
      const p = Math.min(1, from + (now - t0) / total);
      paintProgress(p);
      if (p >= 1) {
        goNext();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [story?.id, story?.media_type, paused, goNext]);

  const removeStory = async () => {
    if (permanent || !story || !isOwn) return;
    if (!confirm('Delete this story?')) return;
    await supabase.from('stories').delete().eq('id', story.id);
    onClose();
  };

  const loadHighlights = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('story_highlights')
      .select('id, title, cover_url')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });
    setHighlights((data || []) as any);
  };

  const snapshotItem = (row: StoryRow) => ({
    media_url: row.media_url,
    media_type: row.media_type,
    thumbnail_url: row.thumbnail_url || null,
    caption: row.caption || null,
    caption_x: row.caption_x ?? 50,
    caption_y: row.caption_y ?? 72,
    caption_style: row.caption_style || 'classic',
    sticker: row.sticker || null,
    duration_seconds: row.duration_seconds || PHOTO_SECS,
  });

  const addToHighlight = async (highlightId: string) => {
    if (!story) return;
    setHlBusy(true);
    try {
      const { error } = await supabase.from('story_highlight_items').insert({
        highlight_id: highlightId,
        ...snapshotItem(story),
      });
      if (error) throw error;
      const hl = highlights.find((h) => h.id === highlightId);
      if (hl && !hl.cover_url) {
        await supabase
          .from('story_highlights')
          .update({ cover_url: story.thumbnail_url || story.media_url })
          .eq('id', highlightId);
      }
      setHlSaved(true);
      setHlOpen(false);
    } catch (e: any) {
      alert(e?.message || 'Could not add to highlight');
    } finally {
      setHlBusy(false);
    }
  };

  const createHighlight = async () => {
    const title = hlTitle.trim() || 'Highlights';
    if (!userId || !story) return;
    setHlBusy(true);
    try {
      const { data, error } = await supabase
        .from('story_highlights')
        .insert({
          creator_id: userId,
          title,
          cover_url: story.thumbnail_url || story.media_url,
        })
        .select('id')
        .single();
      if (error || !data) throw error || new Error('Could not create');
      await supabase.from('story_highlight_items').insert({
        highlight_id: data.id,
        ...snapshotItem(story),
      });
      setHlTitle('');
      setHlSaved(true);
      setHlOpen(false);
    } catch (e: any) {
      alert(e?.message || 'Could not create highlight');
    } finally {
      setHlBusy(false);
    }
  };

  const openViewers = async () => {
    if (!story || !isOwn) return;
    setShowViewers(true);
    setPaused(true);
    const { data: rows } = await supabase
      .from('story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', story.id)
      .order('viewed_at', { ascending: false })
      .limit(80);
    const ids = [...new Set((rows || []).map((r: any) => r.viewer_id))];
    let people: Record<string, any> = {};
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      (profiles || []).forEach((p: any) => {
        people[p.id] = p;
      });
    }
    setViewers(
      (rows || []).map((r: any) => {
        const p = people[r.viewer_id] || {};
        return {
          id: r.viewer_id,
          name: p.display_name || (p.username ? `@${p.username}` : 'Fan'),
          username: p.username,
          avatar: p.avatar_url || null,
          at: r.viewed_at,
        };
      })
    );
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !userId || !story || isOwn || replying) return;
    setReplying(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Login required');
      const res = await fetch('/api/stories/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ story_id: story.id, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send reply');
      setReply('');
      setReplySent(true);
      setReplyOpen(false);
      setPaused(false);
    } catch (e: any) {
      alert(e?.message || 'Could not send reply');
    } finally {
      setReplying(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goNext, goPrev]);

  if (!group || !story) return null;
  const label = nameOf(group.creator);

  const clearHoldTimer = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onGestureDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: Date.now(),
      moved: false,
      mode: 'none',
    };
    setDrag({ x: 0, y: 0 });
    clearHoldTimer();
    holdTimer.current = window.setTimeout(() => {
      if (gesture.current.mode === 'none' && !gesture.current.moved) {
        gesture.current.mode = 'hold';
        holdRef.current = true;
        setPaused(true);
        setHoldUi(true);
      }
    }, 140);
  };

  const onGestureMove = (e: React.PointerEvent) => {
    if (gesture.current.id !== e.pointerId) return;
    const dx = e.clientX - gesture.current.x;
    const dy = e.clientY - gesture.current.y;
    if (Math.hypot(dx, dy) < 12) return;
    gesture.current.moved = true;
    clearHoldTimer();
    if (gesture.current.mode === 'hold') {
      holdRef.current = false;
      setPaused(false);
      setHoldUi(false);
    }
    if (gesture.current.mode === 'none' || gesture.current.mode === 'hold') {
      gesture.current.mode = Math.abs(dy) > Math.abs(dx) * 1.1 ? 'vert' : 'horiz';
    }
    if (gesture.current.mode === 'vert') {
      setDrag({ x: 0, y: Math.max(0, dy) });
    } else if (gesture.current.mode === 'horiz') {
      setDrag({ x: dx, y: 0 });
    }
  };

  const onGestureUp = (e: React.PointerEvent) => {
    if (gesture.current.id !== e.pointerId) return;
    clearHoldTimer();
    const dx = e.clientX - gesture.current.x;
    const dy = e.clientY - gesture.current.y;
    const dt = Date.now() - gesture.current.t;
    const mode = gesture.current.mode;
    const moved = gesture.current.moved;
    gesture.current.id = 0;

    if (mode === 'hold') {
      holdRef.current = false;
      setPaused(false);
      setHoldUi(false);
      setDrag({ x: 0, y: 0 });
      return;
    }
    if (mode === 'vert') {
      setDrag({ x: 0, y: 0 });
      if (dy > 80) onClose();
      return;
    }
    if (mode === 'horiz') {
      setDrag({ x: 0, y: 0 });
      if (dx < -56) goNext();
      else if (dx > 56) goPrev();
      return;
    }
    setDrag({ x: 0, y: 0 });
    if (!moved && dt < 280) {
      const w = window.innerWidth || 1;
      if (e.clientX < w * 0.32) goPrev();
      else goNext();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[240] bg-black select-none [-webkit-user-select:none] [-webkit-touch-callout:none] overscroll-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute inset-0 bg-zinc-950" />
      <div
        className="absolute inset-0 z-[1] will-change-transform"
        style={{
          transform: `translate3d(${drag.x}px, ${
            drag.y > 0 ? drag.y : drag.y * 0.4
          }px, 0) scale(${
            drag.y > 0 ? Math.max(0.88, 1 - drag.y / 1800) : 1
          })`,
          borderRadius: drag.y > 8 ? 18 : 0,
          opacity: drag.y > 0 ? Math.max(0.4, 1 - drag.y / 600) : 1,
          transition:
            drag.x === 0 && drag.y === 0
              ? 'transform 220ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease, border-radius 220ms ease'
              : 'none',
        }}
      >
      {story.media_type === 'video' ? (
        <video
          ref={videoRef}
          key={story.id}
          src={story.media_url}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none select-none [-webkit-touch-callout:none]"
          controls={false}
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.duration) paintProgress(v.currentTime / v.duration);
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) paintProgress(v.currentTime / v.duration);
          }}
          onEnded={goNext}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={story.id}
          src={story.media_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none select-none [-webkit-touch-callout:none]"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
      </div>

      <div
        className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/75 via-black/25 to-transparent z-[2] pointer-events-none transition-opacity duration-200 ${
          holdUi ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent z-[2] pointer-events-none transition-opacity duration-200 ${
          holdUi ? 'opacity-0' : 'opacity-100'
        }`}
      />
      {story.caption ? (
        <p
          className={`absolute z-[16] max-w-[80%] text-center leading-tight pointer-events-none transition-opacity duration-200 ${
            holdUi ? 'opacity-0' : 'opacity-100'
          } ${captionClass(story.caption_style)}`}
          style={{
            left: `${Number(story.caption_x ?? 50)}%`,
            top: `${Number(story.caption_y ?? 72)}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {story.caption}
        </p>
      ) : null}

      <div
        className={`relative z-30 px-3 pt-[max(0.7rem,env(safe-area-inset-top))] transition-opacity duration-200 ${
          holdUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div ref={barsWrapRef} className="flex gap-[2px] mb-3">
          {group.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-[1.5px] rounded-full bg-white/25 overflow-hidden">
              <div
                data-story-bar={i === si ? 'active' : i < si ? 'done' : 'idle'}
                className="h-full w-full bg-white rounded-full origin-left"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href={group.creator.username ? `/${group.creator.username}` : '/'}
            className="flex items-center gap-2 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            {group.creator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.creator.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover ring-1 ring-white/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-pink-600 flex items-center justify-center text-xs font-bold">
                {label[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate leading-tight">{label}</p>
              <p className="text-[10px] text-white/70">
                {permanent ? 'Highlight' : `${timeAgo(story.created_at)} · ${hoursLeft(story.expires_at)} left`}
              </p>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {story.media_type === 'video' && (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center"
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            {isOwn && !permanent && onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center"
                title="Add story"
              >
                <Plus size={16} />
              </button>
            )}
            {isOwn && !permanent && (
              <button
                type="button"
                onClick={() => {
                  setHlOpen(true);
                  setPaused(true);
                  void loadHighlights();
                }}
                className="w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center"
                title="Highlight"
              >
                <Bookmark size={16} />
              </button>
            )}
            {isOwn && !permanent && (
              <button
                type="button"
                onClick={() => void removeStory()}
                className="w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center text-red-300"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {!replyOpen && !showViewers && !hlOpen && (
        <div
          className="absolute left-0 right-0 top-16 bottom-24 z-20 touch-none select-none [-webkit-touch-callout:none]"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onGestureDown}
          onPointerMove={onGestureMove}
          onPointerUp={onGestureUp}
          onPointerCancel={onGestureUp}
        />
      )}

      {story.sticker && !isOwn && (
        <div
          className={`absolute left-0 right-0 bottom-24 z-[25] flex justify-center transition-opacity duration-200 ${
            holdUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <Link
            href={
              story.sticker === 'live'
                ? liveHref || '/live'
                : story.sticker === 'shop'
                  ? '/shop'
                  : `/${group.creator.username || ''}`
            }
            onClick={onClose}
            className="h-10 px-5 rounded-full bg-pink-600 text-sm font-semibold flex items-center"
          >
            {story.sticker === 'subscribe'
              ? 'Subscribe'
              : story.sticker === 'live'
                ? 'Join live'
                : 'Shop'}
          </Link>
        </div>
      )}

      <div
        className={`absolute bottom-0 left-0 right-0 z-30 px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2 transition-opacity duration-200 ${
          holdUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {hlSaved ? (
          <p className="text-sm text-white/70">Saved to highlight</p>
        ) : isOwn && !permanent ? (
          <button
            type="button"
            onClick={() => void openViewers()}
            className="flex items-center gap-2 text-sm text-white/90"
          >
            <Eye size={16} />
            {viewsCount == null
              ? 'Views'
              : `${viewsCount} view${viewsCount === 1 ? '' : 's'}`}
          </button>
        ) : userId ? (
          <div>
          {replySent ? (
            <p className="text-sm text-white/70 text-center">Sent</p>
          ) : replyOpen ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void sendReply();
              }}
            >
              <input
                autoFocus
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={200}
                placeholder="Reply…"
                className="flex-1 h-11 rounded-full bg-white/10 border border-white/15 px-4 text-sm outline-none placeholder:text-white/40"
              />
              <button
                type="submit"
                disabled={!reply.trim() || replying}
                className="w-11 h-11 rounded-full bg-pink-600 disabled:opacity-40 flex items-center justify-center"
              >
                {replying ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplyOpen(false);
                  setPaused(false);
                }}
                className="text-xs text-white/60 px-1"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setReplyOpen(true);
                setPaused(true);
              }}
              className="w-full h-11 rounded-full border border-white/25 bg-black/25 backdrop-blur-md text-left px-4 text-sm text-white/75"
            >
              Reply to {label}…
            </button>
          )}
          </div>
        ) : null}
      </div>

      {hlOpen && (
        <div className="absolute inset-0 z-40 bg-black/55 flex items-end">
          <div className="w-full max-h-[70vh] rounded-t-3xl bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">Add to highlight</p>
              <button
                type="button"
                onClick={() => {
                  setHlOpen(false);
                  setPaused(false);
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={hlTitle}
                onChange={(e) => setHlTitle(e.target.value.slice(0, 24))}
                placeholder="New highlight name"
                className="flex-1 h-11 rounded-xl bg-zinc-900 border border-zinc-800 px-3 text-sm outline-none"
              />
              <button
                type="button"
                disabled={hlBusy}
                onClick={() => void createHighlight()}
                className="h-11 px-4 rounded-xl bg-pink-600 text-sm font-semibold disabled:opacity-50"
              >
                Create
              </button>
            </div>
            <div className="space-y-1 overflow-y-auto max-h-[40vh]">
              {highlights.length === 0 ? (
                <p className="text-sm text-zinc-500 py-6 text-center">No highlights yet</p>
              ) : (
                highlights.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    disabled={hlBusy}
                    onClick={() => void addToHighlight(h.id)}
                    className="w-full flex items-center gap-3 py-2.5 text-left"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-800">
                      {h.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <span className="text-sm font-medium truncate">{h.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showViewers && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-end">
          <div className="w-full max-h-[62vh] rounded-t-3xl bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">
                {viewsCount || viewers.length} view
                {(viewsCount || viewers.length) === 1 ? '' : 's'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowViewers(false);
                  setPaused(false);
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[50vh] space-y-1">
              {viewers.length === 0 ? (
                <p className="text-sm text-zinc-500 py-8 text-center">No views yet</p>
              ) : (
                viewers.map((v) => (
                  <Link
                    key={v.id + v.at}
                    href={v.username ? `/${v.username}` : '/'}
                    className="flex items-center gap-3 py-2.5"
                    onClick={onClose}
                  >
                    {v.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.avatar}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold">
                        {v.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{v.name}</p>
                      <p className="text-[11px] text-zinc-500">{timeAgo(v.at)}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(1, Math.floor(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function hoursLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '0h';
  const h = Math.max(1, Math.ceil(ms / 3600000));
  return `${h}h`;
}
