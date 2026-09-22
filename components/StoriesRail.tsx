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
  Pause,
  Send,
  Eye,
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
  const [draft, setDraft] = useState<{
    file: File;
    url: string;
    kind: 'image' | 'video';
    duration: number;
  } | null>(null);
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

    setDraft({
      file,
      url: URL.createObjectURL(file),
      kind: isImage ? 'image' : 'video',
      duration,
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const publishDraft = async () => {
    if (!draft || !userId || uploading) return;
    setUploading(true);
    setError('');
    try {
      const stamp = Date.now();
      const ext = (
        draft.file.name.split('.').pop() || (draft.kind === 'image' ? 'jpg' : 'mp4')
      ).toLowerCase();
      const path = `${userId}/stories/${stamp}.${ext}`;
      const { error: upErr } = await supabase.storage.from('posts').upload(path, draft.file, {
        contentType: draft.file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;
      const publicUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;

      let thumb: string | null = null;
      if (draft.kind === 'image') {
        try {
          const t = await createImageThumbnail(draft.file, 640, 0.7);
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
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insErr) throw insErr;
      URL.revokeObjectURL(draft.url);
      setDraft(null);
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
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-zinc-200">Stories</p>
        {showAdd && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs font-medium text-pink-400 hover:text-pink-300"
          >
            Add story
          </button>
        )}
      </div>
      <div className="flex items-start gap-3.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
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
            className="flex-shrink-0 w-[78px] text-center"
          >
            <div className="relative mx-auto w-[72px] h-[72px]">
              <div
                className={`w-[72px] h-[72px] rounded-full p-[2.5px] ${
                  myGroup?.unseen
                    ? 'bg-gradient-to-br from-pink-400 via-rose-500 to-amber-400'
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
              <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-pink-600 border-[2.5px] border-zinc-950 flex items-center justify-center shadow-lg">
                {uploading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={13} strokeWidth={2.5} />
                )}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-zinc-300 truncate font-medium">Your story</p>
          </button>
        )}

        {loading && groups.length === 0 && (
          <div className="flex items-center text-zinc-500 text-sm py-6 px-2">
            <Loader2 size={16} className="animate-spin mr-2" />
            Stories
          </div>
        )}

        {others.map((g) => {
          const gi = groups.findIndex((x) => x.creator.id === g.creator.id);
          return (
            <button
              key={g.creator.id}
              type="button"
              onClick={() => setOpen({ groupIndex: gi, storyIndex: 0 })}
              className="flex-shrink-0 w-[78px] text-center"
            >
              <div
                className={`mx-auto w-[72px] h-[72px] rounded-full p-[2.5px] ${
                  g.unseen
                    ? 'bg-gradient-to-br from-pink-400 via-rose-500 to-amber-400'
                    : 'bg-zinc-600'
                }`}
              >
                <div className="w-full h-full rounded-full bg-zinc-950 p-[2.5px] overflow-hidden">
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
              <p className="mt-2 text-[11px] text-zinc-300 truncate">
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

      {draft && (
        <StoryComposer
          draft={draft}
          uploading={uploading}
          onCancel={() => {
            URL.revokeObjectURL(draft.url);
            setDraft(null);
          }}
          onShare={() => void publishDraft()}
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

function StoryComposer({
  draft,
  uploading,
  onCancel,
  onShare,
}: {
  draft: { file: File; url: string; kind: 'image' | 'video'; duration: number };
  uploading: boolean;
  onCancel: () => void;
  onShare: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[240] bg-black flex flex-col select-none [-webkit-user-select:none] [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative flex-1 min-h-0">
        {draft.kind === 'video' ? (
          <video
            src={draft.url}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={draft.url}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none select-none [-webkit-touch-callout:none]"
          />
        )}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
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
      <div className="relative z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <p className="text-[11px] text-zinc-400 mb-3 text-center">
          Visible for 24 hours · {draft.kind === 'video' ? `${draft.duration}s video` : 'Photo'}
        </p>
        <button
          type="button"
          onClick={onShare}
          disabled={uploading}
          className="w-full h-12 rounded-2xl bg-pink-600 hover:bg-pink-500 disabled:opacity-60 font-semibold flex items-center justify-center gap-2"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : null}
          {uploading ? 'Posting…' : 'Share story'}
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
    { id: string; name: string; username?: string | null; avatar?: string | null; at: string }[]
  >([]);
  const [showViewers, setShowViewers] = useState(false);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

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
      setSi((n) => n + 1);
      setProgress(0);
      return;
    }
    if (gi + 1 < groups.length) {
      setGi((n) => n + 1);
      setSi(0);
      setProgress(0);
      return;
    }
    onClose();
  }, [group, si, gi, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) {
      setSi((n) => n - 1);
      setProgress(0);
      return;
    }
    if (gi > 0) {
      const prev = groups[gi - 1];
      setGi((n) => n - 1);
      setSi(Math.max(0, (prev?.stories.length || 1) - 1));
      setProgress(0);
    }
  }, [si, gi, groups]);

  useEffect(() => {
    setProgress(0);
    setPaused(false);
    setDrag({ x: 0, y: 0 });
    setReply('');
    setReplySent(false);
    setReplyOpen(false);
    setShowViewers(false);
  }, [story?.id]);

  useEffect(() => {
    if (replyOpen || showViewers) setPaused(true);
  }, [replyOpen, showViewers]);

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
    if (story.media_type === 'video') return;
    const total = Math.max(3, Number(story.duration_seconds || PHOTO_SECS)) * 1000;
    let start = Date.now();
    let acc = progress;
    const iv = setInterval(() => {
      const p = Math.min(1, acc + (Date.now() - start) / total);
      setProgress(p);
      if (p >= 1) {
        clearInterval(iv);
        goNext();
      }
    }, 40);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, story?.media_type, paused, goNext]);

  const removeStory = async () => {
    if (!story || !isOwn) return;
    if (!confirm('Delete this story?')) return;
    await supabase.from('stories').delete().eq('id', story.id);
    onClose();
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
      }
    }, 160);
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
      setDrag({ x: 0, y: 0 });
      return;
    }
    if (mode === 'vert' && dy > 80) {
      onClose();
      return;
    }
    if (mode === 'horiz') {
      setDrag({ x: 0, y: 0 });
      if (dx < -48) goNext();
      else if (dx > 48) goPrev();
      return;
    }
    setDrag({ x: 0, y: 0 });
    if (!moved && dt < 320) {
      const w = window.innerWidth || 1;
      if (e.clientX < w * 0.34) goPrev();
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
          transform: `translate(${drag.x * 0.35}px, ${drag.y}px) scale(${Math.max(
            0.86,
            1 - drag.y / 1400
          )})`,
          opacity: Math.max(0.35, 1 - drag.y / 520),
          transition: drag.x === 0 && drag.y === 0 ? 'transform 180ms ease, opacity 180ms ease' : 'none',
        }}
      >
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
          className="absolute inset-0 w-full h-full object-contain z-[1] pointer-events-none select-none [-webkit-touch-callout:none]"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
      </div>

      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/75 via-black/25 to-transparent z-[2] pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent z-[2] pointer-events-none" />

      <div className="relative z-30 px-3 pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="flex gap-1 mb-3">
          {group.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-[2.5px] rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{
                  width:
                    i < si ? '100%' : i === si ? `${Math.round(progress * 100)}%` : '0%',
                }}
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
                {timeAgo(story.created_at)} · {hoursLeft(story.expires_at)} left
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
            {isOwn && onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center"
                title="Add story"
              >
                <Plus size={16} />
              </button>
            )}
            {isOwn && (
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

      {!replyOpen && !showViewers && (
        <div
          className="absolute left-0 right-0 top-16 bottom-24 z-20 touch-none select-none [-webkit-touch-callout:none]"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={onGestureDown}
          onPointerMove={onGestureMove}
          onPointerUp={onGestureUp}
          onPointerCancel={onGestureUp}
        />
      )}

      {paused && (
        <div className="absolute inset-0 z-[15] pointer-events-none flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/45 backdrop-blur flex items-center justify-center">
            <Pause size={22} fill="white" />
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-30 px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2">
        {isOwn ? (
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
          replySent ? (
            <p className="text-sm text-pink-300 font-medium">Reply sent</p>
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
              className="w-full h-11 rounded-full border border-white/20 bg-white/8 text-left px-4 text-sm text-white/70"
            >
              Reply to {label}…
            </button>
          )
        ) : null}
      </div>

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
