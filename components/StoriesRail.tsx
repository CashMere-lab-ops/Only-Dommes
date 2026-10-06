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
  MoreHorizontal,
  Crop,
  Lock,
  Palette,
  ChevronLeft,
  ChevronRight,
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

type CropAspect = '9:16' | 'original' | '1:1' | '4:5' | '16:9';

function aspectValue(mode: CropAspect, imgW: number, imgH: number) {
  if (mode === '1:1') return 1;
  if (mode === '4:5') return 4 / 5;
  if (mode === '16:9') return 16 / 9;
  if (mode === 'original') return imgW / imgH || 9 / 16;
  return 9 / 16;
}

async function cropToStoryFrame(
  url: string,
  panX: number,
  panY: number,
  zoom: number,
  mode: CropAspect = '9:16',
  bg?: string | null
) {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not load image'));
    el.src = url;
  });
  const z = Math.max(0.35, Math.min(3, zoom || 1));
  const outW = 1080;
  const outH = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Crop failed');
  const solid = bg && bg.startsWith('#') ? bg : '';
  ctx.fillStyle = solid || '#111';
  ctx.fillRect(0, 0, outW, outH);
  if (!solid) {
    const cover = Math.max(outW / img.width, outH / img.height) * 1.15;
    ctx.filter = 'blur(48px)';
    ctx.drawImage(
      img,
      (outW - img.width * cover) / 2,
      (outH - img.height * cover) / 2,
      img.width * cover,
      img.height * cover
    );
    ctx.filter = 'none';
  }
  const contain = Math.min(outW / img.width, outH / img.height) * z;
  const dw = img.width * contain;
  const dh = img.height * contain;
  const dx = (outW - dw) / 2 + panX * outW;
  const dy = (outH - dh) / 2 + panY * outH;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  );
  if (!blob) throw new Error('Crop failed');
  return new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

function captionLook(style?: string | null) {
  const parts = (style || 'classic').split('|');
  const font = parts[0] || 'classic';
  const color = parts[1] && parts[1].startsWith('#') ? parts[1] : '#ffffff';
  const scale = Math.max(0.6, Math.min(2.8, Number(parts[2]) || 1));
  const rotate = Number(parts[3]) || 0;
  const family =
    font === 'modern'
      ? 'Avenir Next, Helvetica Neue, sans-serif'
      : font === 'serif'
        ? 'Georgia, Times New Roman, serif'
        : font === 'type'
          ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
          : font === 'strong'
            ? 'Arial Black, Impact, sans-serif'
            : font === 'script'
              ? 'Segoe Script, Brush Script MT, cursive'
              : font === 'condensed'
                ? 'Arial Narrow, Helvetica Neue, sans-serif'
                : font === 'poster'
                  ? 'Impact, Arial Black, sans-serif'
                  : font === 'hand'
                    ? 'Segoe Print, Bradley Hand, cursive'
                    : font === 'soft'
                      ? 'Trebuchet MS, Gill Sans, sans-serif'
                      : 'system-ui, sans-serif';
  const weight = font === 'modern' ? 300 : font === 'strong' || font === 'poster' ? 800 : 700;
  return { font, color, scale, rotate, family, weight };
}

function packCaption(font: string, color: string, scale: number, rotate: number) {
  return `${font}|${color}|${Number(scale.toFixed(2))}|${Math.round(rotate)}`;
}

function stickerKind(raw?: string | null) {
  const kind = (raw || '').split('|')[0];
  return kind === 'subscribe' || kind === 'live' || kind === 'shop' ? kind : null;
}

function stickerPlace(raw?: string | null) {
  const parts = (raw || '').split('|');
  return {
    kind: stickerKind(raw),
    x: Number(parts[1]) || 50,
    y: Number(parts[2]) || 78,
    scale: Math.max(0.6, Math.min(2.8, Number(parts[3]) || 1)),
    rotate: Number(parts[4]) || 0,
  };
}

function packSticker(
  kind: 'subscribe' | 'live' | 'shop' | null,
  x: number,
  y: number,
  scale: number,
  rotate: number
) {
  if (!kind) return null;
  return `${kind}|${x.toFixed(1)}|${y.toFixed(1)}|${scale.toFixed(2)}|${Math.round(rotate)}`;
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
    captionStyle: string;
    captionColor: string;
    captionScale: number;
    captionRotate: number;
    sticker: 'subscribe' | 'live' | 'shop' | null;
    stickerX: number;
    stickerY: number;
    stickerScale: number;
    stickerRotate: number;
    cropX: number;
    cropY: number;
    cropZoom: number;
    bgColor: string | null;
    visibility: 'everyone' | 'followers' | 'subscribers';
    mirror?: boolean;
    fromLibrary?: boolean;
  } | null>(null);
  const [open, setOpen] = useState<{ groupIndex: number; storyIndex: number } | null>(
    null
  );
  const [queue, setQueue] = useState<File[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fromCamera, setFromCamera] = useState(false);
  const [deskCrop, setDeskCrop] = useState<{
    url: string;
    rest: File[];
  } | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [phoneOnlyOpen, setPhoneOnlyOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  const canCreateOnDevice = () => {
    if (typeof window === 'undefined') return false;
    const mouseLaptop =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      window.matchMedia('(min-width: 1024px)').matches;
    return !mouseLaptop;
  };

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => {
      setIsDesktop(mq.matches);
      setCanCreate(canCreateOnDevice());
    };
    apply();
    mq.addEventListener('change', apply);
    window.addEventListener('resize', apply);
    return () => {
      mq.removeEventListener('change', apply);
      window.removeEventListener('resize', apply);
    };
  }, []);

  const openAdd = () => {
    if (!canCreateOnDevice()) {
      setPhoneOnlyOpen(true);
      return;
    }
    setCameraOpen(true);
  };

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
      const t = window.setTimeout(() => {
        if (!canCreateOnDevice()) setPhoneOnlyOpen(true);
        else setCameraOpen(true);
      }, 250);
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
    captionColor: '#ffffff',
    captionScale: 1,
    captionRotate: 0,
      sticker: null,
      stickerX: 50,
      stickerY: 78,
      stickerScale: 1,
      stickerRotate: 0,
      cropX: 0,
      cropY: 0,
      cropZoom: 1,
      bgColor: '#000000',
      visibility: 'everyone' as const,
      mirror: false,
      fromLibrary: false,
    };
  };

  const onPickFiles = async (files: FileList | File[] | null) => {
    if (!files || !userId || uploading) return;
    setError('');
    const list = Array.from(files).slice(0, 10);
    if (!list.length) return;
    const first = list[0];
    if (
      isDesktop &&
      first.type.startsWith('image/') &&
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches
    ) {
      setDeskCrop({ url: URL.createObjectURL(first), rest: list.slice(1) });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const ready = await prepareFile(first);
    if (!ready) return;
    setQueue(list.slice(1));
    setDraft({ ...ready, fromLibrary: true });
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
          draft.cropZoom,
          '9:16',
          draft.bgColor
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
        caption_style: packCaption(
          draft.captionStyle,
          draft.captionColor,
          draft.captionScale,
          draft.captionRotate
        ),
        sticker: packSticker(
          draft.sticker,
          draft.stickerX,
          draft.stickerY,
          draft.stickerScale,
          draft.stickerRotate
        ),
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
  const showAdd = !!isCreator && !!userId && canCreate;
  const showMine = !!isCreator && !!userId && (!!myGroup || canCreate);

  if (!userId) return null;
  if (!loading && !showMine && groups.length === 0) return null;

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
        {showMine && (
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
              {showAdd && (
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
              )}
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
        onChange={(e) => {
          setAddOpen(false);
          void onPickFiles(e.target.files);
        }}
      />

      {phoneOnlyOpen && (
        <div
          className="fixed inset-0 z-[230] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setPhoneOnlyOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-pink-400">
              World of Dommes
            </p>
            <p className="text-lg font-medium mt-3">Create stories on your phone</p>
            <p className="text-sm text-zinc-400 mt-2">
              Stories can be posted from a phone or tablet so they look right. You can still watch
              them here.
            </p>
            <button
              type="button"
              onClick={() => setPhoneOnlyOpen(false)}
              className="mt-6 h-10 px-5 rounded-full bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {addOpen && !isDesktop && (
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
          onLibrary={(files) => {
            setFromCamera(true);
            setCameraOpen(false);
            void onPickFiles(files);
          }}
          onCapture={(file, info) => {
            setFromCamera(true);
            setDraft({
              file,
              url: URL.createObjectURL(file),
              kind: info?.kind || (file.type.startsWith('video') ? 'video' : 'image'),
              duration: info?.duration || PHOTO_SECS,
              caption: '',
              captionX: 50,
              captionY: 70,
              captionStyle: 'classic',
              captionColor: '#ffffff',
              captionScale: 1,
              captionRotate: 0,
              sticker: null,
              stickerX: 50,
              stickerY: 78,
              stickerScale: 1,
              stickerRotate: 0,
              cropX: 0,
              cropY: 0,
              cropZoom: 1,
              bgColor: '#000000',
              visibility: 'everyone',
              mirror: !!info?.mirror,
            });
            setCameraOpen(false);
          }}
        />
      )}

      {deskCrop && (
        <StoryCropDesk
          url={deskCrop.url}
          onBack={() => {
            URL.revokeObjectURL(deskCrop.url);
            setDeskCrop(null);
            setAddOpen(true);
          }}
          onNext={async (panX, panY, zoom, aspect) => {
            try {
              const baked = await cropToStoryFrame(deskCrop.url, panX, panY, zoom, aspect);
              URL.revokeObjectURL(deskCrop.url);
              const next = await prepareFile(baked);
              const rest = deskCrop.rest;
              setDeskCrop(null);
              if (!next) return;
              setQueue(rest);
              setDraft(next);
            } catch (e: any) {
              setError(e?.message || 'Could not crop');
            }
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
            if (fromCamera) setCameraOpen(true);
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
          onAdd={canCreate ? openAdd : undefined}
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

function StoryCreateDesk({
  onClose,
  onBrowse,
  onFiles,
}: {
  onClose: () => void;
  onBrowse: () => void;
  onFiles: (files: FileList | File[]) => void;
}) {
  const [over, setOver] = useState(false);

  const take = (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    onFiles(list);
  };

  return (
    <div
      className="fixed inset-0 z-[230] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-5 border-b border-white/10 flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-pink-400">
            World of Dommes
          </p>
          <p className="text-sm font-medium">Create New Story</p>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-zinc-400"
          >
            <X size={16} />
          </button>
        </div>
        <div
          className={`m-5 rounded-xl border border-dashed min-h-[320px] flex flex-col items-center justify-center px-8 text-center transition-colors ${
            over ? 'border-pink-400 bg-pink-500/10' : 'border-pink-500/25 bg-zinc-900/40'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
        >
          <div className="w-16 h-16 rounded-2xl border border-pink-500/30 bg-pink-500/10 flex items-center justify-center mb-5">
            <ImageIcon size={28} className="text-pink-300" strokeWidth={1.4} />
          </div>
          <p className="text-lg font-medium">Drop photos or videos here</p>
          <p className="text-sm text-zinc-500 mt-1.5 mb-6">
            Stories last 24 hours · video up to 60 seconds
          </p>
          <button
            type="button"
            onClick={onBrowse}
            className="h-10 px-5 rounded-full bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold"
          >
            Select from computer
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryCropDesk({
  url,
  onBack,
  onNext,
}: {
  url: string;
  onBack: () => void;
  onNext: (panX: number, panY: number, zoom: number, aspect: CropAspect) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aspect, setAspect] = useState<CropAspect>('original');
  const [menu, setMenu] = useState(false);
  const [nat, setNat] = useState({ w: 9, h: 16 });

  return (
    <div className="fixed inset-0 z-[232] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-[560px] bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-zinc-400"
          >
            <X size={16} />
          </button>
          <p className="text-sm font-medium">Create New Story</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onNext(panX, panY, zoom, aspect)).finally(() => setBusy(false));
            }}
            className="h-8 px-3 rounded-full bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? '…' : 'Next'}
          </button>
        </div>
        <div className="p-5 flex flex-col items-center">
          <div
            ref={stageRef}
            className={`relative bg-black overflow-hidden rounded-lg select-none ${
              aspect === '1:1'
                ? 'w-[280px] aspect-square'
                : aspect === '4:5'
                  ? 'w-[224px] aspect-[4/5]'
                  : aspect === '16:9'
                    ? 'w-full max-w-[420px] aspect-video'
                    : 'w-full max-w-[280px]'
            }`}
            style={
              aspect === 'original'
                ? { aspectRatio: `${nat.w} / ${nat.h}`, maxHeight: 420 }
                : undefined
            }
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
              setDragging(true);
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerMove={(e) => {
              if (!drag.current || !stageRef.current) return;
              const box = stageRef.current.getBoundingClientRect();
              const dx = (e.clientX - drag.current.x) / box.width;
              const dy = (e.clientY - drag.current.y) / box.height;
              setPanX(Math.max(-0.35, Math.min(0.35, drag.current.px + dx)));
              setPanY(Math.max(-0.35, Math.min(0.35, drag.current.py + dy)));
            }}
            onPointerUp={() => {
              drag.current = null;
              setDragging(false);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setNat({
                  w: e.currentTarget.naturalWidth || 9,
                  h: e.currentTarget.naturalHeight || 16,
                })
              }
              className="absolute inset-0 w-full h-full object-cover origin-center pointer-events-none"
              style={{
                transform: `translate(${panX * 100}%, ${panY * 100}%) scale(${zoom})`,
              }}
            />
            {dragging && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
              </div>
            )}
          </div>
          <div className="w-full max-w-[420px] mt-4 flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                title="Select crop"
                onClick={() => setMenu((m) => !m)}
                className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center"
              >
                <Crop size={15} />
              </button>
              {menu && (
                <div className="absolute bottom-11 left-0 w-44 rounded-2xl bg-zinc-800 border border-white/10 py-1 shadow-xl z-10">
                  {(
                    [
                      ['original', 'Original'],
                      ['1:1', '1:1'],
                      ['4:5', '4:5'],
                      ['16:9', '16:9'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setAspect(id);
                        setPanX(0);
                        setPanY(0);
                        setMenu(false);
                      }}
                      className={`w-full h-10 px-3 flex items-center justify-between text-sm ${
                        aspect === id ? 'text-white' : 'text-zinc-400'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="w-5 h-5 flex items-center justify-center">
                        {id === 'original' ? (
                          <ImageIcon size={13} />
                        ) : (
                          <span
                            className={`border border-current rounded-[2px] ${
                              id === '1:1'
                                ? 'w-3 h-3'
                                : id === '4:5'
                                  ? 'w-2.5 h-3.5'
                                  : 'w-3.5 h-2'
                            }`}
                          />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[11px] text-zinc-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-pink-500"
            />
          </div>
        </div>
      </div>
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
  onLibrary: (files: FileList | File[]) => void;
  onCapture: (
    file: File,
    info?: { kind: 'image' | 'video'; duration: number; mirror?: boolean }
  ) => void;
}) {
  const libRef = useRef<HTMLInputElement | null>(null);
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
  const [handingOff, setHandingOff] = useState(false);
  const secsLive = useRef(0);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const applyOneX = async (stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as { zoom?: { min: number; max: number } };
    if (!track || !caps?.zoom) return;
    const z = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 1));
    await track.applyConstraints({ advanced: [{ zoom: z }] } as any).catch(() => {});
  };

  const startCam = useCallback(async (face: 'user' | 'environment') => {
    setError('');
    setReady(false);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: face },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      await applyOneX(stream);
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
        await applyOneX(stream);
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
    onCapture(new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' }), {
      kind: 'image',
      duration: PHOTO_SECS,
    });
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
      onCapture(new File([blob], `story-${Date.now()}.${ext}`, { type }), {
        kind: 'video',
        duration: Math.max(1, Math.min(MAX_VIDEO_SECS, secsLive.current || 1)),
        mirror: facing === 'user',
      });
    };
    recRef.current = rec;
    rec.start(200);
    setSecs(0);
    secsLive.current = 0;
    setRecording(true);
    tickRef.current = window.setInterval(() => {
      setSecs((n) => {
        const next = n + 1;
        secsLive.current = Math.min(MAX_VIDEO_SECS, next);
        if (next >= MAX_VIDEO_SECS) {
          stopRec();
          return MAX_VIDEO_SECS;
        }
        return next;
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
        className={`absolute inset-0 w-full h-full object-contain bg-black ${
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

      {handingOff && (
        <div className="absolute inset-0 z-20 bg-black flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-white/70" />
        </div>
      )}
      {error ? (
        <p className="relative z-10 text-center text-sm text-red-300 mt-4">{error}</p>
      ) : null}

      <div className="relative z-10 mt-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <input
          ref={libRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length) onLibrary(files);
            e.target.value = '';
          }}
        />
        <div className="flex items-center justify-center gap-8 mb-4">
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
        <div className="px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => libRef.current?.click()}
            title="Photo library"
            className="w-11 h-11 rounded-full bg-black/35 border border-white/15 flex items-center justify-center text-white/90"
          >
            <ImageIcon size={18} strokeWidth={1.6} />
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
    captionStyle: string;
    captionColor: string;
    captionScale: number;
    captionRotate: number;
    sticker: 'subscribe' | 'live' | 'shop' | null;
    stickerX: number;
    stickerY: number;
    stickerScale: number;
    stickerRotate: number;
    cropX: number;
    cropY: number;
    cropZoom: number;
    bgColor: string | null;
    visibility: 'everyone' | 'followers' | 'subscribers';
    mirror?: boolean;
    fromLibrary?: boolean;
  };
  uploading: boolean;
  onCancel: () => void;
  onShare: () => void;
  onMeta: (patch: {
    caption?: string;
    captionX?: number;
    captionY?: number;
    captionStyle?: string;
    captionColor?: string;
    captionScale?: number;
    captionRotate?: number;
    sticker?: 'subscribe' | 'live' | 'shop' | null;
    stickerX?: number;
    stickerY?: number;
    stickerScale?: number;
    stickerRotate?: number;
    cropX?: number;
    cropY?: number;
    cropZoom?: number;
    bgColor?: string | null;
    visibility?: 'everyone' | 'followers' | 'subscribers';
  }) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const ptsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const liveRef = useRef({ x: 0, y: 0, z: 1 });

  const textPts = useRef(new Map<number, { x: number; y: number }>());
  const textPinch = useRef<{ dist: number; angle: number; scale: number; rot: number } | null>(null);
  const textLive = useRef({ x: 50, y: 70, scale: 1, rot: 0 });

  const paintText = () => {
    const el = document.querySelector('[data-story-text="1"]') as HTMLElement | null;
    if (!el) return;
    const { x, y, scale, rot } = textLive.current;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.transform = `translate3d(-50%, -50%, 0) rotate(${rot}deg) scale(${scale})`;
  };

  const onTextDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-text-ui]')) return;
    e.stopPropagation();
    textLive.current = {
      x: draft.captionX,
      y: draft.captionY,
      scale: draft.captionScale || 1,
      rot: draft.captionRotate || 0,
    };
    textPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (textPts.current.size >= 2) {
      const pts = [...textPts.current.values()];
      textPinch.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        angle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
        scale: textLive.current.scale,
        rot: textLive.current.rot,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onTextMove = (e: React.PointerEvent) => {
    if (!textPts.current.has(e.pointerId) || !stageRef.current) return;
    e.preventDefault();
    textPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (textPinch.current && textPts.current.size >= 2) {
      const pts = [...textPts.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      textLive.current.scale = Math.max(
        0.6,
        Math.min(2.8, textPinch.current.scale * (dist / textPinch.current.dist))
      );
      textLive.current.rot = textPinch.current.rot + ((angle - textPinch.current.angle) * 180) / Math.PI;
      paintText();
      return;
    }
    if (!dragRef.current) return;
    const moved = Math.hypot(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y);
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' && moved < 8) return;
    if (moved >= 8) (e.target as HTMLElement).blur?.();
    const box = stageRef.current.getBoundingClientRect();
    textLive.current.x = Math.max(
      8,
      Math.min(92, textLive.current.x + ((e.clientX - dragRef.current.x) / box.width) * 100)
    );
    textLive.current.y = Math.max(
      10,
      Math.min(88, textLive.current.y + ((e.clientY - dragRef.current.y) / box.height) * 100)
    );
    dragRef.current = { x: e.clientX, y: e.clientY };
    paintText();
  };
  const onTextUp = (e: React.PointerEvent) => {
    textPts.current.delete(e.pointerId);
    if (textPts.current.size < 2) textPinch.current = null;
    if (textPts.current.size === 0) {
      dragRef.current = null;
      onMeta({
        captionX: textLive.current.x,
        captionY: textLive.current.y,
        captionScale: textLive.current.scale,
        captionRotate: textLive.current.rot,
      });
    }
  };

  const stickerPts = useRef(new Map<number, { x: number; y: number }>());
  const stickerPinch = useRef<{
    dist: number;
    angle: number;
    scale: number;
    rot: number;
    cx: number;
    cy: number;
    x: number;
    y: number;
  } | null>(null);
  const stickerDrag = useRef<{ x: number; y: number } | null>(null);
  const stickerLive = useRef({ x: 50, y: 78, scale: 1, rot: 0 });
  const stickerIgnoreDrag = useRef(false);

  const paintSticker = () => {
    const el = document.querySelector('[data-story-sticker="1"]') as HTMLElement | null;
    const inner = document.querySelector('[data-story-sticker-inner="1"]') as HTMLElement | null;
    if (!el) return;
    const { x, y, scale, rot } = stickerLive.current;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    if (inner) inner.style.transform = `rotate(${rot}deg) scale(${scale})`;
  };
  const onStickerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (stickerPts.current.size === 0) {
      stickerLive.current = {
        x: draft.stickerX ?? 50,
        y: draft.stickerY ?? 78,
        scale: draft.stickerScale || 1,
        rot: draft.stickerRotate || 0,
      };
    }
    stickerPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (stickerPts.current.size >= 2) {
      const pts = [...stickerPts.current.values()];
      stickerPinch.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        angle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
        scale: stickerLive.current.scale,
        rot: stickerLive.current.rot,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
        x: stickerLive.current.x,
        y: stickerLive.current.y,
      };
      stickerDrag.current = null;
      stickerIgnoreDrag.current = true;
      return;
    }
    if (!stickerIgnoreDrag.current) stickerDrag.current = { x: e.clientX, y: e.clientY };
  };
  const onStickerMove = (e: React.PointerEvent) => {
    if (!stickerPts.current.has(e.pointerId) || !stageRef.current) return;
    e.preventDefault();
    stickerPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const box = stageRef.current.getBoundingClientRect();
    if (stickerPinch.current && stickerPts.current.size >= 2) {
      const pts = [...stickerPts.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const ratio = dist / stickerPinch.current.dist;
      const eased = 1 + (ratio - 1) * 0.9;
      stickerLive.current.scale = Math.max(0.55, Math.min(2.6, stickerPinch.current.scale * eased));
      let deg = ((angle - stickerPinch.current.angle) * 180) / Math.PI;
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      stickerLive.current.rot = stickerPinch.current.rot + deg;
      stickerLive.current.x = Math.max(
        12,
        Math.min(88, stickerPinch.current.x + ((cx - stickerPinch.current.cx) / box.width) * 100)
      );
      stickerLive.current.y = Math.max(
        14,
        Math.min(86, stickerPinch.current.y + ((cy - stickerPinch.current.cy) / box.height) * 100)
      );
      paintSticker();
      return;
    }
    if (stickerIgnoreDrag.current || !stickerDrag.current) return;
    stickerLive.current.x = Math.max(
      12,
      Math.min(88, stickerLive.current.x + ((e.clientX - stickerDrag.current.x) / box.width) * 100)
    );
    stickerLive.current.y = Math.max(
      14,
      Math.min(86, stickerLive.current.y + ((e.clientY - stickerDrag.current.y) / box.height) * 100)
    );
    stickerDrag.current = { x: e.clientX, y: e.clientY };
    paintSticker();
  };
  const onStickerUp = (e: React.PointerEvent) => {
    stickerPts.current.delete(e.pointerId);
    if (stickerPts.current.size < 2) stickerPinch.current = null;
    if (stickerPts.current.size === 0) {
      stickerDrag.current = null;
      stickerIgnoreDrag.current = false;
      onMeta({
        stickerX: stickerLive.current.x,
        stickerY: stickerLive.current.y,
        stickerScale: stickerLive.current.scale,
        stickerRotate: stickerLive.current.rot,
      });
    }
  };

  const [tool, setTool] = useState<'none' | 'text' | 'crop' | 'sticker' | 'audience'>('none');
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [textPanel, setTextPanel] = useState<'none' | 'fonts' | 'colours'>('none');

  const finishText = () => {
    setTextPanel('none');
    setTool('none');
    if (!draft.caption.trim()) onMeta({ caption: '' });
  };

  useEffect(() => {
    if (tool === 'text') textRef.current?.focus();
  }, [tool]);

  return (
    <div
      className="fixed inset-0 z-[240] bg-black select-none [-webkit-user-select:none] [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`.wod-noscroll::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
      <div
        ref={stageRef}
        className="absolute inset-0 overflow-hidden"
        onPointerDown={(e) => {
          if (tool !== 'text') return;
          const t = e.target as HTMLElement;
          if (t.closest('[data-story-text]') || t.closest('[data-text-ui]') || t.closest('button')) return;
          finishText();
        }}
      >
        {(() => {
          const canFrame = !!draft.fromLibrary || tool === 'crop';
          const canMove = tool === 'crop' && draft.kind === 'image';
          const fit = draft.fromLibrary || canMove ? 'object-cover' : 'object-contain';
          const paint = (x: number, y: number, z: number) => {
            liveRef.current = { x, y, z };
            if (frameRef.current) {
              frameRef.current.style.transform = `translate3d(-50%, -50%, 0) translate(${x * 70}%, ${y * 70}%) scale(${z})`;
            }
          };
          const onFrameDown = (e: React.PointerEvent) => {
            if (!canFrame || tool === 'text') return;
            if ((e.target as HTMLElement).closest('[data-story-text]')) return;
            liveRef.current = { x: draft.cropX, y: draft.cropY, z: draft.cropZoom };
            ptsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            if (ptsRef.current.size >= 2) {
              const pts = [...ptsRef.current.values()];
              const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
              pinchRef.current = { dist: dist || 1, zoom: liveRef.current.z };
              panRef.current = null;
              return;
            }
            if (canMove) {
              panRef.current = {
                x: e.clientX,
                y: e.clientY,
                px: liveRef.current.x,
                py: liveRef.current.y,
              };
            }
          };
          const onFrameMove = (e: React.PointerEvent) => {
            if (!ptsRef.current.has(e.pointerId)) return;
            ptsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinchRef.current && ptsRef.current.size >= 2) {
              const pts = [...ptsRef.current.values()];
              const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
              const next = Math.max(
                draft.kind === 'image' ? 0.35 : 1,
                Math.min(3, pinchRef.current.zoom * (dist / pinchRef.current.dist))
              );
              if (draft.kind === 'image') paint(liveRef.current.x, liveRef.current.y, next);
              else {
                liveRef.current = { x: 0, y: 0, z: next };
                onMeta({ cropZoom: next, cropX: 0, cropY: 0 });
              }
              return;
            }
            if (!canMove || !panRef.current || !stageRef.current) return;
            const box = stageRef.current.getBoundingClientRect();
            const dx = (e.clientX - panRef.current.x) / box.width;
            const dy = (e.clientY - panRef.current.y) / box.height;
            paint(
              Math.max(-0.45, Math.min(0.45, panRef.current.px + dx)),
              Math.max(-0.45, Math.min(0.45, panRef.current.py + dy)),
              liveRef.current.z
            );
          };
          const onFrameUp = (e: React.PointerEvent) => {
            ptsRef.current.delete(e.pointerId);
            if (ptsRef.current.size < 2) pinchRef.current = null;
            if (ptsRef.current.size === 0) {
              panRef.current = null;
              onMeta({
                cropX: liveRef.current.x,
                cropY: liveRef.current.y,
                cropZoom: liveRef.current.z,
              });
            }
          };
          const onFrameWheel = (e: React.WheelEvent) => {
            if (!canFrame || tool === 'text') return;
            e.preventDefault();
            const next = draft.cropZoom + (e.deltaY < 0 ? 0.08 : -0.08);
            onMeta({
              cropZoom: Math.max(draft.kind === 'image' ? 0.35 : 1, Math.min(3, Number(next.toFixed(3)))),
              ...(draft.kind === 'video' ? { cropX: 0, cropY: 0 } : {}),
            });
          };
          const frameStyle = {
            transform:
              draft.kind === 'image'
                ? `translate3d(-50%, -50%, 0) translate(${draft.cropX * 70}%, ${draft.cropY * 70}%) scale(${draft.cropZoom})`
                : `translate3d(0, 0, 0) scale(${draft.cropZoom})`,
            transformOrigin: 'center',
            touchAction: 'none' as const,
            backfaceVisibility: 'hidden' as const,
            WebkitBackfaceVisibility: 'hidden' as const,
          };
          return draft.kind === 'video' ? (
            <video
              src={draft.url}
              autoPlay
              loop
              muted
              playsInline
              className={`absolute inset-0 w-full h-full ${fit} bg-black origin-center ${
                draft.mirror ? 'scale-x-[-1]' : ''
              } ${canFrame ? '' : 'pointer-events-none'}`}
              style={frameStyle}
              onPointerDown={onFrameDown}
              onPointerMove={onFrameMove}
              onPointerUp={onFrameUp}
              onPointerCancel={onFrameUp}
              onWheel={onFrameWheel}
            />
          ) : (
            <>
              <div className="absolute inset-0 pointer-events-none" style={{ background: draft.bgColor || '#000000' }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.url}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-full max-h-full w-auto h-auto select-none [-webkit-touch-callout:none] will-change-transform"
                style={frameStyle}
                ref={frameRef}
                onPointerDown={onFrameDown}
                onPointerMove={onFrameMove}
                onPointerUp={onFrameUp}
                onPointerCancel={onFrameUp}
                onWheel={onFrameWheel}
              />
            </>
          );
        })()}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
        {(tool === 'text' || draft.caption.trim()) && (
          <div
            data-story-text="1"
            className="absolute z-20 max-w-[86%] text-center"
            style={{
              left: `${draft.captionX}%`,
              top: `${draft.captionY}%`,
              transform: `translate3d(-50%, -50%, 0) rotate(${draft.captionRotate || 0}deg) scale(${draft.captionScale || 1})`,
              color: draft.captionColor || '#ffffff',
              touchAction: 'none',
            }}
            onPointerDown={onTextDown}
            onPointerMove={onTextMove}
            onPointerUp={onTextUp}
            onPointerCancel={onTextUp}
          >
            {tool === 'text' ? (
              <textarea
                ref={textRef}
                value={draft.caption}
                onChange={(e) => {
                  onMeta({ caption: e.target.value.slice(0, 180) });
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                maxLength={180}
                rows={1}
                placeholder=""
                className="w-[72vw] max-w-[280px] bg-transparent outline-none text-center text-2xl caret-white resize-none overflow-hidden whitespace-pre-wrap break-words leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
                style={{
                  color: draft.captionColor || '#ffffff',
                  fontFamily: captionLook(draft.captionStyle).family,
                  fontWeight: captionLook(draft.captionStyle).weight,
                }}
              />
            ) : (
              <p
                className="text-2xl leading-tight whitespace-pre-wrap break-words drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
                style={{
                  fontFamily: captionLook(draft.captionStyle).family,
                  fontWeight: captionLook(draft.captionStyle).weight,
                }}
              >
                {draft.caption}
              </p>
            )}
          </div>
        )}
        {draft.sticker ? (
          <div
            data-story-sticker="1"
            className="absolute z-20 touch-none"
            style={{
              left: `${draft.stickerX ?? 50}%`,
              top: `${draft.stickerY ?? 78}%`,
              transform: 'translate3d(-50%, -50%, 0)',
            }}
            onPointerDown={onStickerDown}
            onPointerMove={onStickerMove}
            onPointerUp={onStickerUp}
            onPointerCancel={onStickerUp}
          >
            <span
              data-story-sticker-inner="1"
              className="inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-black/55 backdrop-blur-md border border-[#d4b483]/80 text-[11px] uppercase tracking-[0.22em] text-[#f4efe6] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              style={{
                transform: `rotate(${draft.stickerRotate || 0}deg) scale(${draft.stickerScale || 1})`,
                transformOrigin: 'center center',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2d87]" />
              {draft.sticker === 'subscribe'
                ? 'Subscribe'
                : draft.sticker === 'live'
                  ? 'Live'
                  : 'Shop'}
            </span>
          </div>
        ) : null}
        <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-[max(0.7rem,env(safe-area-inset-top))] flex items-start justify-between pointer-events-none">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="pointer-events-auto w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
          <div className="pointer-events-auto flex flex-col items-center gap-3.5 mt-8">
            <button
              type="button"
              aria-label="Fonts"
              onClick={() => {
                setTool('text');
                setTextPanel((p) => (p === 'fonts' ? 'none' : 'fonts'));
              }}
              className={`w-10 h-10 flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                textPanel === 'fonts' ? 'text-[#ff2d87]' : 'text-white'
              }`}
            >
              <span className="font-serif text-[20px] leading-none tracking-tight">Aa</span>
            </button>
            <button
              type="button"
              aria-label="Colours"
              onClick={() => {
                setTool('text');
                setTextPanel((p) => (p === 'colours' ? 'none' : 'colours'));
              }}
              className={`w-10 h-10 flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                textPanel === 'colours' ? 'text-[#ff2d87]' : 'text-white'
              }`}
            >
              <Palette size={22} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Sticker"
              onClick={() => {
                setTextPanel('none');
                setTool((t) => (t === 'sticker' ? 'none' : 'sticker'));
              }}
              className={`w-10 h-10 flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                tool === 'sticker' ? 'text-[#ff2d87]' : 'text-white'
              }`}
            >
              <Bookmark size={22} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Crop"
              disabled={draft.kind !== 'image'}
              onClick={() => {
                setTextPanel('none');
                setTool((t) => (t === 'crop' ? 'none' : 'crop'));
              }}
              className={`w-10 h-10 flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] disabled:opacity-30 ${
                tool === 'crop' ? 'text-[#ff2d87]' : 'text-white'
              }`}
            >
              <Crop size={22} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Audience"
              onClick={() => {
                setTextPanel('none');
                setTool((t) => (t === 'audience' ? 'none' : 'audience'));
              }}
              className={`w-10 h-10 flex items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                tool === 'audience' ? 'text-[#ff2d87]' : 'text-white'
              }`}
            >
              <Lock size={20} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        {tool === 'text' && (textPanel === 'fonts' || textPanel === 'colours') && (
          <div
            data-text-ui="1"
            className="absolute left-3 right-16 top-[max(4.4rem,calc(env(safe-area-inset-top)+3.4rem))] z-30"
          >
            {textPanel === 'fonts' && (
              <div
                className="wod-noscroll flex gap-2 overflow-x-auto px-1"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-x',
                  overscrollBehaviorX: 'contain',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                {(
                  [
                    ['classic', 'Classic'],
                    ['modern', 'Modern'],
                    ['serif', 'Serif'],
                    ['type', 'Type'],
                    ['strong', 'Strong'],
                    ['script', 'Script'],
                    ['condensed', 'Narrow'],
                    ['poster', 'Poster'],
                    ['hand', 'Hand'],
                    ['soft', 'Soft'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onMeta({ captionStyle: id })}
                    className={`h-10 min-w-[5.2rem] px-4 rounded-full border text-[13px] tracking-wide shrink-0 backdrop-blur-md ${
                      draft.captionStyle === id
                        ? 'bg-[#ff2d87] text-white border-[#ff2d87]'
                        : 'bg-black/50 text-white border-white/15'
                    }`}
                    style={{ fontFamily: captionLook(id).family, fontWeight: captionLook(id).weight }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {textPanel === 'colours' && (
              <div
                className="wod-noscroll flex gap-3 overflow-x-auto px-2"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', overscrollBehaviorX: 'contain', scrollbarWidth: 'none' }}
              >
                {['#ffffff', '#000000', '#f4efe6', '#c6a15b', '#ff2d87', '#7a2430', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2'].map(
                  (c) => {
                    const on = draft.captionColor === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onMeta({ captionColor: c })}
                        aria-label={c}
                        className="relative w-9 h-9 shrink-0 rounded-full overflow-hidden border-0 p-0 appearance-none"
                        style={{ backgroundColor: '#ffffff', WebkitAppearance: 'none' }}
                      >
                        <span
                          className="absolute rounded-full"
                          style={{ inset: on ? 3 : 0, backgroundColor: c }}
                        />
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>
        )}
        {tool === 'crop' && draft.kind === 'image' && (
          <div className="absolute left-3 right-16 top-[max(4.4rem,calc(env(safe-area-inset-top)+3.4rem))] z-20">
            <div
              className="wod-noscroll flex gap-3 overflow-x-auto px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x' }}
            >
              {['#000000', '#ffffff', '#ff2d87', '#f4efe6', '#c6a15b', '#7a2430', '#1a1030', '#0a84ff'].map((c) => {
                const on = (draft.bgColor || '#000000') === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => onMeta({ bgColor: c })}
                    className="relative w-9 h-9 shrink-0 rounded-full overflow-hidden border-0 p-0 appearance-none"
                    style={{ backgroundColor: '#ffffff', WebkitAppearance: 'none' }}
                  >
                    <span
                      className="absolute rounded-full"
                      style={{ inset: on ? 3 : 0, backgroundColor: c }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {tool === 'sticker' && (
          <div className="absolute left-3 right-16 top-[max(4.4rem,calc(env(safe-area-inset-top)+3.4rem))] z-20">
            <div
              className="wod-noscroll flex gap-2.5 overflow-x-auto px-1"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-x',
                overscrollBehaviorX: 'contain',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {(
                [
                  [null, 'None'],
                  ['subscribe', 'Subscribe'],
                  ['live', 'Live'],
                  ['shop', 'Shop'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onMeta({ sticker: id })}
                  className={`h-11 min-w-[6.2rem] px-4 rounded-full border text-[11px] uppercase tracking-[0.18em] shrink-0 backdrop-blur-md ${
                    draft.sticker === id
                      ? 'bg-[#f4efe6] text-[#1a140c] border-[#d4b483]'
                      : 'bg-black/45 text-[#f4efe6] border-white/15'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {tool === 'audience' && (
          <div className="absolute left-3 right-20 bottom-[max(4.6rem,calc(env(safe-area-inset-bottom)+3.6rem))] z-30 flex gap-2">
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
                onClick={() => {
                  onMeta({ visibility: id });
                  setTool('none');
                }}
                className={`h-8 px-3 rounded-full text-[11px] ${
                  draft.visibility === id ? 'bg-white text-black' : 'bg-black/55 text-white/85'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="absolute left-3 right-3 bottom-[max(0.85rem,env(safe-area-inset-bottom))] z-30 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setTextPanel('none');
              setTool((t) => (t === 'audience' ? 'none' : 'audience'));
            }}
            className="h-11 pl-1.5 pr-4 rounded-full bg-black/55 border border-[#ff2d87]/50 flex items-center gap-2 text-white"
          >
            <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <Lock size={14} />
            </span>
            <span className="text-[13px] font-medium">
              {draft.visibility === 'followers'
                ? 'Followers'
                : draft.visibility === 'subscribers'
                  ? 'Subscribers'
                  : 'Your story'}
            </span>
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={uploading}
            aria-label="Share story"
            className="h-11 px-5 rounded-full bg-[#ff2d87] text-white text-sm font-semibold tracking-wide shadow-[0_6px_18px_rgba(255,45,135,0.45)] disabled:opacity-60 active:scale-95 transition-transform"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : 'Share Now'}
          </button>
        </div>
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
  const wantSound = useRef(true);
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
  const [replyFocus, setReplyFocus] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const [highlights, setHighlights] = useState<{ id: string; title: string; cover_url?: string | null }[]>(
    []
  );
  const [hlTitle, setHlTitle] = useState('');
  const [hlBusy, setHlBusy] = useState(false);
  const [hlSaved, setHlSaved] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
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
    if (!story || stickerKind(story.sticker) !== 'live') return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('live_streams')
        .select('id')
        .eq('creator_id', story.creator_id)
        .in('status', ['live', 'active', 'idle_ready'])
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
    setReplyFocus(false);
    setShowViewers(false);
    setManageOpen(false);
    return () => window.cancelAnimationFrame(id);
  }, [story?.id, si]);

  useEffect(() => {
    const blocked = replyFocus || showViewers || hlOpen || manageOpen;
    setPaused(blocked);
  }, [replyFocus, showViewers, hlOpen, manageOpen]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted, story?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) {
      v.pause();
      return;
    }
    v.muted = muted;
    const play = v.play();
    if (play && typeof play.catch === 'function') {
      play.catch(() => {
        v.muted = true;
        setMuted(true);
        void v.play().catch(() => {});
      });
    }
  }, [paused, muted, story?.id]);

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
      const typing =
        replyOpen ||
        replyFocus ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') {
        if (replyOpen) {
          setReplyOpen(false);
          setReply('');
          return;
        }
        onClose();
      }
      if (typing) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goNext, goPrev, replyOpen, replyFocus]);

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
    if (wantSound.current && muted && story.media_type === 'video') {
      setMuted(false);
      const v = videoRef.current;
      if (v) {
        v.muted = false;
        void v.play().catch(() => {});
      }
    }
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
        className="absolute inset-0 z-[1] flex items-center justify-center will-change-transform"
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
      <div className="relative w-full h-full lg:h-[min(92vh,880px)] lg:w-[min(100%,calc(min(92vh,880px)*9/16))] lg:rounded-2xl overflow-hidden bg-black">
      {story.media_type === 'video' ? (
        <video
          ref={videoRef}
          key={story.id}
          src={story.media_url}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-contain z-[1] pointer-events-none select-none [-webkit-touch-callout:none]"
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
          className="absolute inset-0 w-full h-full object-contain z-[1] pointer-events-none select-none [-webkit-touch-callout:none]"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
      </div>
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
          className={`absolute z-[16] max-w-[80%] text-center text-2xl leading-tight whitespace-pre-wrap break-words pointer-events-none transition-opacity duration-200 ${
            holdUi ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            left: `${Number(story.caption_x ?? 50)}%`,
            top: `${Number(story.caption_y ?? 72)}%`,
            color: captionLook(story.caption_style).color,
            fontFamily: captionLook(story.caption_style).family,
            fontWeight: captionLook(story.caption_style).weight,
            transform: `translate(-50%, -50%) rotate(${captionLook(story.caption_style).rotate}deg) scale(${captionLook(story.caption_style).scale})`,
            textShadow: '0 2px 8px rgba(0,0,0,0.85)',
          }}
        >
          {story.caption}
        </p>
      ) : null}

      <button
        type="button"
        onClick={goPrev}
        className="hidden lg:flex absolute left-0 top-16 bottom-24 w-[22%] z-[28] items-center justify-start pl-4"
        aria-label="Previous story"
      >
        <span className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/90">
          <ChevronLeft size={22} />
        </span>
      </button>
      <button
        type="button"
        onClick={goNext}
        className="hidden lg:flex absolute right-0 top-16 bottom-24 w-[22%] z-[28] items-center justify-end pr-4"
        aria-label="Next story"
      >
        <span className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/90">
          <ChevronRight size={22} />
        </span>
      </button>

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
        <div className="flex items-center gap-2">
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
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-[11px] font-semibold">
                {label[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate leading-tight">{label}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-white/55">
                <span>{permanent ? 'Highlight' : timeAgo(story.created_at)}</span>
                {isOwn && !permanent ? (
                  <>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void openViewers();
                      }}
                    >
                      {viewsCount == null ? 'Seen' : `${viewsCount} seen`}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-0.5">
            {story.media_type === 'video' && (
              <button
                type="button"
                onClick={() =>
                  setMuted((m) => {
                    wantSound.current = m;
                    return !m;
                  })
                }
                className="w-9 h-9 flex items-center justify-center text-white/80"
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            {isOwn && !permanent && (
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="w-9 h-9 flex items-center justify-center text-white/80"
              >
                <MoreHorizontal size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center text-white/90"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {replyOpen && (
        <button
          type="button"
          className="absolute inset-0 z-20"
          aria-label="Close reply"
          onClick={() => {
            setReplyOpen(false);
            setReply('');
          }}
        />
      )}

      {!replyOpen && !showViewers && !hlOpen && !manageOpen && (
        <div
          className="absolute left-0 right-0 top-16 bottom-24 z-20 touch-none select-none [-webkit-touch-callout:none]"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onGestureDown}
          onPointerMove={onGestureMove}
          onPointerUp={onGestureUp}
          onPointerCancel={onGestureUp}
        />
      )}

      {stickerKind(story.sticker) && (
        <div
          className={`absolute z-[25] transition-opacity duration-200 ${
            holdUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          style={{
            left: `${stickerPlace(story.sticker).x}%`,
            top: `${stickerPlace(story.sticker).y}%`,
            transform: `translate3d(-50%, -50%, 0) rotate(${stickerPlace(story.sticker).rotate}deg) scale(${stickerPlace(story.sticker).scale})`,
          }}
        >
          <Link
            href={
              stickerKind(story.sticker) === 'live'
                ? liveHref || `/${group.creator.username || ''}?offline=1`
                : stickerKind(story.sticker) === 'shop'
                  ? `/shop?creator=${encodeURIComponent(group.creator.username || '')}`
                  : `/${group.creator.username || ''}?subscribe=1`
            }
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-10 pl-3 pr-4 rounded-full bg-black/55 backdrop-blur-md border border-[#d4b483]/80 text-[11px] uppercase tracking-[0.22em] text-[#f4efe6] flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff2d87]" />
            {stickerKind(story.sticker) === 'subscribe'
              ? 'Subscribe'
              : stickerKind(story.sticker) === 'live'
                ? 'Live'
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
          <p className="text-[13px] text-white/60">Saved</p>
        ) : isOwn && !permanent ? (
          <div className="h-2" />
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
                onFocus={() => setReplyFocus(true)}
                onBlur={() => {
                  setReplyFocus(false);
                  window.setTimeout(() => {
                    setReplyOpen(false);
                  }, 180);
                }}
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
                  setReplyFocus(false);
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
                setReplyFocus(true);
              }}
              className="w-full h-10 rounded-full border border-white/15 bg-black/20 text-left px-4 text-[13px] text-white/60"
            >
              Reply to {label}…
            </button>
          )}
          </div>
        ) : null}
      </div>

      {manageOpen && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-end">
          <div className="w-full rounded-t-3xl bg-zinc-950 border-t border-white/10 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" />
            {onAdd && (
              <button
                type="button"
                onClick={() => {
                  setManageOpen(false);
                  onAdd();
                }}
                className="w-full h-12 rounded-2xl bg-zinc-900 text-sm font-medium mb-2 flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                Add story
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setManageOpen(false);
                setHlOpen(true);
                void loadHighlights();
              }}
              className="w-full h-12 rounded-2xl bg-zinc-900 text-sm font-medium mb-2 flex items-center justify-center gap-2"
            >
              <Bookmark size={16} />
              Highlight
            </button>
            <button
              type="button"
              onClick={() => {
                setManageOpen(false);
                void removeStory();
              }}
              className="w-full h-12 rounded-2xl bg-zinc-900 text-sm font-medium text-red-400 mb-2 flex items-center justify-center gap-2"
            >
              <Trash2 size={16} />
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                setManageOpen(false);
                setPaused(false);
              }}
              className="w-full h-11 text-sm text-zinc-500"
            >
              Close
            </button>
          </div>
        </div>
      )}

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
