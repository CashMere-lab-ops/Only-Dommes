'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '../lib/supabase';
import { createImageThumbnail } from '../lib/createThumbnail';

export type StoryRow = {
  id: string;
  creator_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url?: string | null;
  duration_seconds?: number;
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
const MAX_VIDEO_SECS = 20;

function nameOf(c: StoryCreator) {
  return c.display_name || (c.username ? `@${c.username}` : 'Creator');
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
  const [open, setOpen] = useState<{ groupIndex: number; storyIndex: number } | null>(
    null
  );

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
          'id, creator_id, media_url, media_type, thumbnail_url, duration_seconds, created_at, expires_at'
        )
        .in('creator_id', ids)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(200);
      if (qErr) throw qErr;
      const list = (rows || []) as StoryRow[];
      const creatorIds = [...new Set(list.map((s) => s.creator_id))];
      let people: Record<string, StoryCreator> = {};
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

  const onPick = async (file: File | null) => {
    if (!file || !userId || uploading) return;
    setError('');
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('Photo or video only');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setError('Max 40MB');
      return;
    }

    let duration = PHOTO_SECS;
    if (isVideo) {
      const ok = await new Promise<boolean>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          const d = Number(v.duration || 0);
          URL.revokeObjectURL(v.src);
          if (d > MAX_VIDEO_SECS) {
            setError(`Videos must be ${MAX_VIDEO_SECS}s or less`);
            resolve(false);
            return;
          }
          duration = Math.max(1, Math.min(MAX_VIDEO_SECS, Math.ceil(d || PHOTO_SECS)));
          resolve(true);
        };
        v.onerror = () => {
          URL.revokeObjectURL(v.src);
          setError('Could not read video');
          resolve(false);
        };
        v.src = URL.createObjectURL(file);
      });
      if (!ok) return;
    }

    setUploading(true);
    try {
      const stamp = Date.now();
      const ext = (file.name.split('.').pop() || (isImage ? 'jpg' : 'mp4')).toLowerCase();
      const path = `${userId}/stories/${stamp}.${ext}`;
      const { error: upErr } = await supabase.storage.from('posts').upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from('posts').getPublicUrl(path);

      let thumb: string | null = null;
      if (isImage) {
        try {
          const t = await createImageThumbnail(file, 640, 0.7);
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
        media_type: isImage ? 'image' : 'video',
        thumbnail_url: thumb,
        duration_seconds: duration,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insErr) throw insErr;
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not post story');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const myGroup = groups.find((g) => g.creator.id === userId);
  const others = groups.filter((g) => g.creator.id !== userId);
  const showAdd = !!isCreator && !!userId;

  if (!userId) return null;
  if (!loading && !showAdd && groups.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
        {showAdd && (
          <button
            type="button"
            onClick={() => {
              if (myGroup && myGroup.stories.length) {
                const idx = groups.findIndex((g) => g.creator.id === userId);
                setOpen({ groupIndex: Math.max(0, idx), storyIndex: 0 });
              } else {
                fileRef.current?.click();
              }
            }}
            className="flex-shrink-0 w-[76px] text-center"
          >
            <div className="relative mx-auto w-[68px] h-[68px]">
              <div
                className={`w-[68px] h-[68px] rounded-full p-[2.5px] ${
                  myGroup?.unseen
                    ? 'bg-gradient-to-br from-pink-500 to-rose-500'
                    : myGroup
                      ? 'bg-zinc-600'
                      : 'bg-zinc-800'
                }`}
              >
                <div className="w-full h-full rounded-full bg-zinc-950 p-[2px] overflow-hidden">
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
              <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-pink-600 border-2 border-zinc-950 flex items-center justify-center">
                {uploading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-300 truncate">Your story</p>
          </button>
        )}

        {loading && groups.length === 0 && (
          <div className="flex items-center text-zinc-500 text-sm py-4 px-2">
            <Loader2 size={16} className="animate-spin mr-2" /> Stories
          </div>
        )}

        {others.map((g) => {
          const gi = groups.findIndex((x) => x.creator.id === g.creator.id);
          return (
            <button
              key={g.creator.id}
              type="button"
              onClick={() => setOpen({ groupIndex: gi, storyIndex: 0 })}
              className="flex-shrink-0 w-[76px] text-center"
            >
              <div
                className={`mx-auto w-[68px] h-[68px] rounded-full p-[2.5px] ${
                  g.unseen
                    ? 'bg-gradient-to-br from-pink-500 to-rose-500'
                    : 'bg-zinc-600'
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
              <p className="mt-1.5 text-[11px] text-zinc-300 truncate">
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
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0] || null)}
      />

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
          onAdd={() => fileRef.current?.click()}
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
          'id, creator_id, media_url, media_type, thumbnail_url, duration_seconds, created_at, expires_at'
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
              ? 'bg-gradient-to-br from-pink-500 to-rose-500'
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

function StoryViewer({
  groups,
  groupIndex,
  storyIndex,
  userId,
  onClose,
  onAdd,
}: {
  groups: StoryGroup[];
  groupIndex: number;
  storyIndex: number;
  userId: string | null;
  onClose: () => void;
  onAdd?: () => void;
}) {
  const supabase = createClient();
  const [gi, setGi] = useState(groupIndex);
  const [si, setSi] = useState(storyIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const group = groups[gi];
  const story = group?.stories[si];
  const isOwn = !!(userId && group && group.creator.id === userId);
  const [viewsCount, setViewsCount] = useState<number | null>(null);

  const markViewed = useCallback(
    async (row: StoryRow) => {
      if (!userId || userId === row.creator_id) return;
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
      setSi(si + 1);
      setProgress(0);
      return;
    }
    if (gi + 1 < groups.length) {
      setGi(gi + 1);
      setSi(0);
      setProgress(0);
      return;
    }
    onClose();
  }, [group, si, gi, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) {
      setSi(si - 1);
      setProgress(0);
      return;
    }
    if (gi > 0) {
      const prev = groups[gi - 1];
      setGi(gi - 1);
      setSi(Math.max(0, (prev?.stories.length || 1) - 1));
      setProgress(0);
    }
  }, [si, gi, groups]);

  useEffect(() => {
    setProgress(0);
  }, [story?.id]);

  useEffect(() => {
    if (!story || paused) return;
    if (story.media_type === 'video') return;
    const total = Math.max(3, Number(story.duration_seconds || PHOTO_SECS)) * 1000;
    const t0 = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / total);
      setProgress(p);
      if (p >= 1) {
        clearInterval(iv);
        goNext();
      }
    }, 50);
    return () => clearInterval(iv);
  }, [story?.id, story?.media_type, paused, goNext]);

  const removeStory = async () => {
    if (!story || !isOwn) return;
    if (!confirm('Delete this story?')) return;
    await supabase.from('stories').delete().eq('id', story.id);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goNext, goPrev]);

  if (!group || !story) return null;
  const label = nameOf(group.creator);

  return (
    <div className="fixed inset-0 z-[240] bg-black flex flex-col">
      <div className="absolute inset-0" onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)} />
      {story.media_type === 'video' ? (
        <video
          ref={videoRef}
          key={story.id}
          src={story.media_url}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-contain bg-black z-[1]"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          onEnded={goNext}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={story.id}
          src={story.media_url}
          alt=""
          className="absolute inset-0 w-full h-full object-contain bg-black z-[1]"
        />
      )}

      <div className="relative z-10 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex gap-1 mb-3">
          {group.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full bg-white"
                style={{
                  width:
                    i < si ? '100%' : i === si ? `${Math.round(progress * 100)}%` : '0%',
                }}
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
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-pink-600 flex items-center justify-center text-xs font-bold">
                {label[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{label}</p>
              <p className="text-[10px] text-zinc-300">
                {timeAgo(story.created_at)} · expires in{' '}
                {hoursLeft(story.expires_at)}
              </p>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {isOwn && (
              <>
                {onAdd && (
                  <button
                    type="button"
                    onClick={onAdd}
                    className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center"
                    title="Add story"
                  >
                    <Plus size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void removeStory()}
                  className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-red-300"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="absolute left-0 top-16 bottom-16 w-1/3 z-20"
        aria-label="Previous"
        onClick={goPrev}
      />
      <button
        type="button"
        className="absolute right-0 top-16 bottom-16 w-1/3 z-20"
        aria-label="Next"
        onClick={goNext}
      />

      <div className="relative z-10 mt-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-between text-xs text-zinc-300">
        <span className="flex items-center gap-1">
          <ChevronLeft size={14} />
          <ChevronRight size={14} />
          tap sides
        </span>
        {isOwn && viewsCount != null && (
          <span>
            {viewsCount} view{viewsCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
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