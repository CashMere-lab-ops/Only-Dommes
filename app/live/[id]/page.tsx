'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Radio,
  Users,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  DollarSign,
  X,
  Send,
  Lock,
  Unlock,
  Crown,
  Share2,
  Check,
  UserPlus,
  Sparkles,
  MoreHorizontal,
  Settings,
  Type,
} from 'lucide-react';
import { notifyBalanceUpdated } from '../../../lib/wallet';
import {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  createLocalAudioTrack,
  type LocalTrack,
} from 'livekit-client';
import Sidebar from '../../../components/Sidebar';
import AuthGuard from '../../../components/AuthGuard';
import { createClient } from '../../../lib/supabase';

type StreamRow = {
  id: string;
  creator_id: string;
  title: string;
  status: string;
  livekit_room?: string | null;
  tip_goal_gbp?: number;
  tip_goals?: { label: string; amount: number }[] | null;
  tip_raised_gbp?: number;
  viewer_count?: number;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  private_active?: boolean;
  private_user_id?: string | null;
  private_ends_at?: string | null;
  private_request_id?: string | null;
  private_end_by_creator?: boolean;
  private_end_by_fan?: boolean;
  show_join_messages?: boolean;
  slow_mode_seconds?: number;
  chat_block_links?: boolean;
  chat_require?: 'anyone' | 'followers' | 'subscribers';
  showcase_user_id?: string | null;
  showcase_amount_gbp?: number;
  showcase_name?: string | null;
  showcase_avatar_url?: string | null;
};

const LIVE_REACT_EMOJIS = ['🔥', '👏', '👑', '😍', '💎'] as const;

type FloatingReact = {
  id: string;
  emoji: string;
  left: number;
  drift?: string;
};

type PrivateReq = {
  id: string;
  stream_id: string;
  creator_id: string;
  requester_id: string;
  minutes: number;
  rate_per_minute: number;
  amount_gbp: number;
  status: string;
  profile?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type ChatMsg = {
  id: string;
  stream_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

const TIP_PRESETS = [5, 10, 20, 50];


function playPrivateChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24]].forEach(([freq, delay]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq as number;
      g.gain.setValueAtTime(0.0001, now + (delay as number));
      g.gain.exponentialRampToValueAtTime(0.08, now + (delay as number) + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (delay as number) + 0.28);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + (delay as number));
      o.stop(now + (delay as number) + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}


function playTipChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[880, 0], [1174.7, 0.1]].forEach(([freq, delay]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq as number;
      g.gain.setValueAtTime(0.0001, now + (delay as number));
      g.gain.exponentialRampToValueAtTime(0.06, now + (delay as number) + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (delay as number) + 0.35);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + (delay as number));
      o.stop(now + (delay as number) + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore */
  }
}

function playGoalChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[523.25, 0], [659.25, 0.15], [783.99, 0.3], [1046.5, 0.45]].forEach(
      ([freq, delay]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq as number;
        g.gain.setValueAtTime(0.0001, now + (delay as number));
        g.gain.exponentialRampToValueAtTime(0.09, now + (delay as number) + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + (delay as number) + 0.4);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + (delay as number));
        o.stop(now + (delay as number) + 0.45);
      }
    );
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* ignore */
  }
}

function playAnnounceChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Soft two-note “attention” chime
    [[440, 0, 0.12], [659.25, 0.12, 0.22]].forEach(([freq, delay, dur]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq as number;
      g.gain.setValueAtTime(0.0001, now + (delay as number));
      g.gain.exponentialRampToValueAtTime(
        0.07,
        now + (delay as number) + 0.02
      );
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        now + (delay as number) + (dur as number)
      );
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + (delay as number));
      o.stop(now + (delay as number) + (dur as number) + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

export default function LiveWatchPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [stream, setStream] = useState<StreamRow | null>(null);
  const [creator, setCreator] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const [myProfile, setMyProfile] = useState<any>(null);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const [liveStatus, setLiveStatus] = useState<
    'idle' | 'connecting' | 'live' | 'ended' | 'error'
  >('idle');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [endSummary, setEndSummary] = useState<any>(null);
  const [myTipTotal, setMyTipTotal] = useState(0);
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null);
  const liveStartedAtRef = useRef<number | null>(null);
  const joinAnnouncedRef = useRef(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [tipAmount, setTipAmount] = useState(5);
  const [tipNote, setTipNote] = useState('');
  const [creatorMinTip, setCreatorMinTip] = useState(2);
  const [customTip, setCustomTip] = useState('');
  const [tipping, setTipping] = useState(false);
  const [tipError, setTipError] = useState('');
  const [tipFlash, setTipFlash] = useState<string | null>(null);

  const [goalReachedFlash, setGoalReachedFlash] = useState(false);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [goalDraftLevels, setGoalDraftLevels] = useState<
    { label: string; amount: string }[]
  >([{ label: '', amount: '' }]);
  const [savingGoal, setSavingGoal] = useState(false);
  const [announceBanner, setAnnounceBanner] = useState<string | null>(null);
  const [goalMeterHidden, setGoalMeterHidden] = useState(false);
  const [showLiveSettings, setShowLiveSettings] = useState(false);
  // Personal live view prefs (this device only)
  const [chatTextSize, setChatTextSize] = useState<'s' | 'm' | 'l'>('m');
  const [hideEmojis, setHideEmojis] = useState(false);
  const [compactChat, setCompactChat] = useState(false);
  const [hideTopTipper, setHideTopTipper] = useState(false);
  /** Live mini leaderboard (this stream only) */
  type LiveTipper = {
    user_id: string;
    total_gbp: number;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    rank: number;
  };
  const [topTippers, setTopTippers] = useState<LiveTipper[]>([]);
  const [myTipRank, setMyTipRank] = useState<number | null>(null);
  const [leaderboardHidden, setLeaderboardHidden] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('wod-live-view-prefs');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.chatTextSize === 's' || p.chatTextSize === 'm' || p.chatTextSize === 'l') {
        setChatTextSize(p.chatTextSize);
      }
      if (typeof p.hideEmojis === 'boolean') setHideEmojis(p.hideEmojis);
      if (typeof p.compactChat === 'boolean') setCompactChat(p.compactChat);
      if (typeof p.hideTopTipper === 'boolean') setHideTopTipper(p.hideTopTipper);
      if (typeof p.goalMeterHidden === 'boolean') setGoalMeterHidden(p.goalMeterHidden);
      if (typeof p.leaderboardHidden === 'boolean') setLeaderboardHidden(p.leaderboardHidden);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'wod-live-view-prefs',
        JSON.stringify({
          chatTextSize,
          hideEmojis,
          compactChat,
          hideTopTipper,
          goalMeterHidden,
          leaderboardHidden,
        })
      );
    } catch {
      /* ignore */
    }
  }, [chatTextSize, hideEmojis, compactChat, hideTopTipper, goalMeterHidden, leaderboardHidden]);
  const [announceExiting, setAnnounceExiting] = useState(false);
  const [showAnnounceEditor, setShowAnnounceEditor] = useState(false);
  const [announceDraft, setAnnounceDraft] = useState('');
  /** ms; 0 = permanent until cleared */
  const [announceDurationMs, setAnnounceDurationMs] = useState(10000);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [milestoneFlash, setMilestoneFlash] = useState<number | null>(null);
  const prevGoalPct = useRef(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const prevRaised = useRef(0);

  // Private
  const [showPrivate, setShowPrivate] = useState(false);
  const [privateMinutes, setPrivateMinutes] = useState(5);
  const [privateRate, setPrivateRate] = useState(5);
  const [privateMin, setPrivateMin] = useState(1);
  const [requestingPrivate, setRequestingPrivate] = useState(false);
  const [privateError, setPrivateError] = useState('');
  const [myPendingPrivate, setMyPendingPrivate] = useState<PrivateReq | null>(null);
  const [incomingPrivates, setIncomingPrivates] = useState<PrivateReq[]>([]);
  const [privateBusy, setPrivateBusy] = useState(false);
  const [privateLockedOut, setPrivateLockedOut] = useState(false);
  const [privateEndsAt, setPrivateEndsAt] = useState<string | null>(null);
  const [privateCountdown, setPrivateCountdown] = useState('');
  const [privateEnabled, setPrivateEnabled] = useState(true);
  const [showJoinMessages, setShowJoinMessages] = useState(true);
  const showJoinsRef = useRef(true);
  const [slowModeSeconds, setSlowModeSeconds] = useState(0);
  const [chatBlockLinks, setChatBlockLinks] = useState(false);
  const [chatRequire, setChatRequire] = useState<
    'anyone' | 'followers' | 'subscribers'
  >('anyone');
  const slowModeRef = useRef(0);
  const [slowModeLeft, setSlowModeLeft] = useState(0);
  const lastChatSentAt = useRef(0);
  const [floatingReacts, setFloatingReacts] = useState<FloatingReact[]>([]);
  const lastReactAt = useRef(0);
  const spawnReactionRef = useRef<(emoji: string) => void>(() => {});
  const [privateReqLeft, setPrivateReqLeft] = useState<Record<string, number>>({});
  const privateTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState('');
  const [myModeration, setMyModeration] = useState<'mute' | 'ban' | null>(null);
  const [modTarget, setModTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [modBusy, setModBusy] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);

  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const isOwner = !!(userId && stream && stream.creator_id === userId);
  const isPrivateFan = !!(
    userId &&
    stream?.private_active &&
    stream.private_user_id === userId
  );
  const inPrivate = !!(stream?.private_active && (isOwner || isPrivateFan));

  const bumpViewers = (n: number) => {
    const v = Math.max(0, n);
    setViewerCount(v);
    setPeakViewers((p) => Math.max(p, v));
  };

  const cleanupRoom = useCallback(async () => {
    try {
      for (const t of localTracksRef.current) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      localTracksRef.current = [];
      if (roomRef.current) {
        roomRef.current.removeAllListeners();
        await roomRef.current.disconnect(true);
        roomRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    } catch {
      /* ignore */
    }
  }, []);

  const enrichMessages = async (rows: any[]): Promise<ChatMsg[]> => {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);
    const map = new Map((profiles || []).map((p: any) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      profile: map.get(r.user_id) || null,
    }));
  };

  const loadChat = async (streamId: string) => {
    const { data } = await supabase
      .from('live_chat_messages')
      .select('*')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: false })
      .limit(40);
    const rows = (data || []).reverse();
    const enriched = await enrichMessages(rows);
    setChatMessages(enriched);
  };

  const loadMeta = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    if (user) {
      const { data: me } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', user.id)
        .single();
      setMyProfile(me);
    }

    const { data, error: qErr } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', id)
      .single();

    if (qErr || !data) {
      setError('Stream not found');
      setLoading(false);
      return null;
    }

    setStream(data);
    prevRaised.current = Number(data.tip_raised_gbp || 0);
    const g0 = Number(data.tip_goal_gbp || 0);
    const r0 = Number(data.tip_raised_gbp || 0);
    prevGoalPct.current = g0 > 0 ? Math.min(100, (r0 / g0) * 100) : 0;
    const joinsOn = data.show_join_messages !== false;
    setShowJoinMessages(joinsOn);
    showJoinsRef.current = joinsOn;
    setSlowModeSeconds(Number(data.slow_mode_seconds || 0));
    setChatBlockLinks(!!data.chat_block_links);
    const req = data.chat_require;
    if (req === 'followers' || req === 'subscribers' || req === 'anyone') {
      setChatRequire(req);
    }
    try {
      const { data: cProf } = await supabase
        .from('profiles')
        .select('min_tip_gbp')
        .eq('id', data.creator_id)
        .maybeSingle();
      const mt = Number(cProf?.min_tip_gbp);
      const minT = Number.isFinite(mt) && mt > 2 ? mt : 2;
      setCreatorMinTip(minT);
      setTipAmount((prev) => (prev < minT ? minT : prev));
    } catch {
      setCreatorMinTip(2);
    }
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u && data.creator_id !== u.id) {
        const { data: mod } = await supabase
          .from('live_stream_moderation')
          .select('action')
          .eq('stream_id', data.id)
          .eq('user_id', u.id)
          .maybeSingle();
        if (mod?.action === 'mute' || mod?.action === 'ban') {
          setMyModeration(mod.action);
        } else {
          setMyModeration(null);
        }
      }
    } catch {
      /* ignore */
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', data.creator_id)
      .single();
    setCreator(profile);

    // Load this viewer's tip total on this stream
    if (user?.id && data.creator_id !== user.id) {
      try {
        const { data: mine } = await supabase
          .from('live_stream_tips')
          .select('total_gbp')
          .eq('stream_id', data.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (mine) setMyTipTotal(Number(mine.total_gbp || 0));
      } catch {
        /* ignore */
      }
    }

    if (data.status === 'ended') {
      setLiveStatus('ended');
      const started = data.started_at || data.created_at
        ? new Date(data.started_at || data.created_at).getTime()
        : Date.now();
      const endedTs = data.ended_at
        ? new Date(data.ended_at).getTime()
        : Date.now();
      let my_tip = 0;
      let tipper_count = 0;
      try {
        if (user?.id) {
          const { data: mine } = await supabase
            .from('live_stream_tips')
            .select('total_gbp')
            .eq('stream_id', data.id)
            .eq('user_id', user.id)
            .maybeSingle();
          my_tip = Number(mine?.total_gbp || 0);
          setMyTipTotal(my_tip);
        }
        const { count } = await supabase
          .from('live_stream_tips')
          .select('*', { count: 'exact', head: true })
          .eq('stream_id', data.id);
        tipper_count = count || 0;
      } catch {
        /* ignore */
      }
      setEndSummary({
        title: data.title,
        duration_seconds: Math.max(0, Math.floor((endedTs - started) / 1000)),
        tip_raised_gbp: Number(data.tip_raised_gbp || 0),
        tip_goal_gbp: Number(data.tip_goal_gbp || 0),
        peak_viewers: Number(data.viewer_count || 0),
        tipper_count,
        showcase_name: data.showcase_name,
        showcase_amount_gbp: data.showcase_amount_gbp,
        showcase_avatar_url: data.showcase_avatar_url,
        my_tip_gbp: my_tip,
        is_host: data.creator_id === user?.id,
      });
    }

    setLoading(false);

    // Private rate from creator live-private settings (fallback voice)
    const { data: creatorRates } = await supabase
      .from('profiles')
      .select(
        'live_private_enabled, live_private_rate_per_minute, live_private_min_minutes, voice_rate_per_minute, voice_min_minutes'
      )
      .eq('id', data.creator_id)
      .single();
    if (creatorRates) {
      setPrivateEnabled(creatorRates.live_private_enabled !== false);
      const rate = Number(
        creatorRates.live_private_rate_per_minute ??
          creatorRates.voice_rate_per_minute ??
          8
      );
      const minM = Math.max(
        1,
        Number(
          creatorRates.live_private_min_minutes ??
            creatorRates.voice_min_minutes ??
            5
        )
      );
      setPrivateRate(rate);
      setPrivateMin(minM);
      setPrivateMinutes(Math.max(minM, 5));
    }

    if (data.private_active) {
      setPrivateEndsAt(data.private_ends_at || null);
      if (
        user?.id &&
        data.creator_id !== user.id &&
        data.private_user_id !== user.id
      ) {
        setPrivateLockedOut(true);
      }
    }

    await loadChat(data.id);

    // My pending request
    if (user?.id && user.id !== data.creator_id) {
      const { data: mine } = await supabase
        .from('live_private_requests')
        .select('*')
        .eq('stream_id', data.id)
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();
      setMyPendingPrivate(mine || null);
    }

    // Creator: load pending incoming
    if (user?.id && user.id === data.creator_id) {
      const { data: incoming } = await supabase
        .from('live_private_requests')
        .select('*')
        .eq('stream_id', data.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      const list = incoming || [];
      if (list.length) {
        const ids = list.map((r: any) => r.requester_id);
        const { data: people } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', ids);
        const pmap = new Map((people || []).map((p: any) => [p.id, p]));
        const enriched = list.map((r: any) => ({
          ...r,
          profile: pmap.get(r.requester_id) || null,
        }));
        setIncomingPrivates(enriched);
        enriched.forEach((r: any) => {
          if (privateTimers.current[r.id]) return;
          const created = r.created_at ? new Date(r.created_at).getTime() : Date.now();
          const elapsed = Math.floor((Date.now() - created) / 1000);
          const left = Math.max(1, 60 - elapsed);
          setPrivateReqLeft((m) => ({ ...m, [r.id]: left }));
          privateTimers.current[r.id] = setInterval(() => {
            setPrivateReqLeft((m) => {
              const nleft = (m[r.id] ?? left) - 1;
              if (nleft <= 0) {
                clearInterval(privateTimers.current[r.id]);
                delete privateTimers.current[r.id];
                void respondPrivate(r.id, 'decline');
                return { ...m, [r.id]: 0 };
              }
              return { ...m, [r.id]: nleft };
            });
          }, 1000);
        });
      } else {
        setIncomingPrivates([]);
      }
    }

    return { stream: data, userId: user?.id || null };
  };

  const connectLive = async (streamRow: StreamRow, asCreator: boolean) => {
    setConnecting(true);
    setError('');
    setLiveStatus('connecting');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');

      const res = await fetch('/api/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ streamId: streamRow.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'PRIVATE_SESSION') {
          setPrivateLockedOut(true);
          setLiveStatus('idle');
          setConnecting(false);
          return;
        }
        throw new Error(data.error || 'Could not join live');
      }
      if (data.private_active) {
        setPrivateEndsAt(data.private_ends_at || null);
      }

      await cleanupRoom();

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
        }
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          (el as HTMLMediaElement).setAttribute('playsinline', 'true');
          document.body.appendChild(el);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        bumpViewers(Math.max(0, room.numParticipants - 1));
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        bumpViewers(Math.max(0, room.numParticipants - 1));
        if (!asCreator && room.remoteParticipants.size === 0) {
          setTimeout(() => {
            void finalizeRef.current();
          }, 300);
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        // Room closed / host ended → show end screen for viewers immediately
        if (!asCreator) {
          void finalizeRef.current();
        }
      });

      // Live settings broadcast (slow mode, etc.)
      room.on(RoomEvent.DataReceived, (payload, _participant) => {
        try {
          const text = new TextDecoder().decode(payload);
          const msg = JSON.parse(text);
          if (msg?.type === 'slow_mode') {
            const sec = Number(msg.seconds || 0);
            setSlowModeSeconds(sec);
            setStream((s) =>
              s ? { ...s, slow_mode_seconds: sec } : s
            );
          }
          if (msg?.type === 'join_messages') {
            const on = !!msg.enabled;
            setShowJoinMessages(on);
            showJoinsRef.current = on;
            setStream((s) =>
              s ? { ...s, show_join_messages: on } : s
            );
          }
          if (msg?.type === 'reaction' && msg.emoji) {
            spawnReactionRef.current(String(msg.emoji));
          }
          if (msg?.type === 'announce_clear') {
            setAnnounceExiting(true);
            if (announceTimerRef.current) {
              clearTimeout(announceTimerRef.current);
              announceTimerRef.current = null;
            }
            if (announceExitTimerRef.current) {
              clearTimeout(announceExitTimerRef.current);
            }
            announceExitTimerRef.current = setTimeout(() => {
              setAnnounceBanner(null);
              setAnnounceExiting(false);
              announceExitTimerRef.current = null;
            }, 380);
          }
          if (msg?.type === 'announce' && typeof msg.text === 'string') {
            const clean = String(msg.text).trim().slice(0, 120);
            if (clean) {
              const durationMs = Number(msg.durationMs);
              const ms =
                Number.isFinite(durationMs) && durationMs >= 0
                  ? durationMs
                  : 10000;
              if (announceTimerRef.current) {
                clearTimeout(announceTimerRef.current);
                announceTimerRef.current = null;
              }
              if (announceExitTimerRef.current) {
                clearTimeout(announceExitTimerRef.current);
                announceExitTimerRef.current = null;
              }
              setAnnounceExiting(false);
              setAnnounceBanner(clean);
              playAnnounceChime();
              if (ms > 0) {
                announceTimerRef.current = setTimeout(() => {
                  setAnnounceExiting(true);
                  announceExitTimerRef.current = setTimeout(() => {
                    setAnnounceBanner(null);
                    setAnnounceExiting(false);
                    announceExitTimerRef.current = null;
                  }, 380);
                  announceTimerRef.current = null;
                }, ms);
              }
            }
          }
          if (msg?.type === 'tip_goal') {
            const g = Number(msg.tip_goal_gbp);
            const r = Number(msg.tip_raised_gbp);
            const levels = Array.isArray(msg.tip_goals) ? msg.tip_goals : null;
            setStream((s) =>
              s
                ? {
                    ...s,
                    tip_goal_gbp: Number.isFinite(g) ? g : s.tip_goal_gbp,
                    tip_raised_gbp: Number.isFinite(r)
                      ? r
                      : s.tip_raised_gbp,
                    tip_goals: levels ?? s.tip_goals,
                  }
                : s
            );
            if (Number.isFinite(g) && g > 0 && Number.isFinite(r)) {
              prevGoalPct.current = Math.min(100, (r / g) * 100);
            }
          }
          if (msg?.type === 'chat_filters') {
            if (typeof msg.block_links === 'boolean') {
              setChatBlockLinks(msg.block_links);
              setStream((s) =>
                s ? { ...s, chat_block_links: msg.block_links } : s
              );
            }
            if (
              msg.require === 'anyone' ||
              msg.require === 'followers' ||
              msg.require === 'subscribers'
            ) {
              setChatRequire(msg.require);
              setStream((s) =>
                s ? { ...s, chat_require: msg.require } : s
              );
            }
          }
          if (msg?.type === 'moderation' && msg.user_id) {
            const me = userIdRef.current;
            if (me && String(msg.user_id) === me) {
              const act = msg.action;
              if (act === 'mute') {
                setMyModeration('mute');
              } else if (act === 'ban') {
                setMyModeration('ban');
                try {
                  room.disconnect();
                } catch {
                  /* ignore */
                }
                alert('You were banned from this live');
              } else if (act === 'clear') {
                setMyModeration(null);
              }
            }
          }
        } catch {
          /* ignore bad payloads */
        }
      });

      await room.connect(data.url, data.token);

      if (asCreator) {
        const videoTrack = await createLocalVideoTrack({
          facingMode: 'user',
        });
        const audioTrack = await createLocalAudioTrack();
        localTracksRef.current = [videoTrack, audioTrack];

        if (localVideoRef.current) {
          videoTrack.attach(localVideoRef.current);
        }

        await room.localParticipant.publishTrack(videoTrack);
        await room.localParticipant.publishTrack(audioTrack);
        setCamOn(true);
        setMicOn(true);

        await supabase
          .from('live_streams')
          .update({
            status: 'active',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', streamRow.id);

        // Notify followers (explicit + debugable in Network tab)
        try {
          const nRes = await fetch('/api/live/notify-followers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ streamId: streamRow.id }),
          });
          const nData = await nRes.json().catch(() => ({}));
          console.log('[live notify]', nData);
        } catch (ne) {
          console.error('[live notify] failed', ne);
        }
      } else {
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track && pub.track.kind === Track.Kind.Video) {
              if (remoteVideoRef.current)
                pub.track.attach(remoteVideoRef.current);
            }
            if (pub.track && pub.track.kind === Track.Kind.Audio) {
              const el = pub.track.attach();
              el.autoplay = true;
              document.body.appendChild(el);
            }
          });
        });

        // Viewer announces join once (skip if we just remounted within leave debounce)
        if (showJoinsRef.current && !joinAnnouncedRef.current) {
          joinAnnouncedRef.current = true;
          if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
          }
          void announceJoinLeave(streamRow.id, 'join');
        }
      }

      bumpViewers(Math.max(0, room.numParticipants - 1));
      setLiveStatus('live');
      setLiveStartedAt((prev) => {
        const v = prev || Date.now();
        liveStartedAtRef.current = v;
        return v;
      });
      setStream((s) => (s ? { ...s, status: 'active' } : s));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Could not connect');
      setLiveStatus('error');
      await cleanupRoom();
    } finally {
      setConnecting(false);
    }
  };

  const endFinalized = useRef(false);
  const finalizeRef = useRef<(partial?: Partial<StreamRow>) => Promise<void>>(
    async () => {}
  );

  const finalizeStreamEnded = useCallback(
    async (_partial?: Partial<StreamRow>) => {
      if (endFinalized.current) return;
      endFinalized.current = true;
      // Flip UI immediately so viewers never stay on a black LIVE screen
      setLiveStatus('ended');
      setStream((s) => (s ? { ...s, status: 'ended' } : s));

      const localElapsed = () => {
        const started = liveStartedAtRef.current;
        if (started) {
          return Math.max(0, Math.floor((Date.now() - started) / 1000));
        }
        return 0;
      };

      try {
        await cleanupRoom();
      } catch {
        /* ignore */
      }

      const applyStatus = (data: any) => {
        if (!data) return;
        if (data.stream) {
          setStream((s) =>
            s
              ? { ...s, ...data.stream, status: 'ended' }
              : { ...data.stream, status: 'ended' }
          );
        }
        const base =
          data.summary ||
          data.preview_summary ||
          (data.stream
            ? {
                title: data.stream?.title,
                duration_seconds: Number(data.duration_seconds || 0),
                tip_raised_gbp: Number(data.stream?.tip_raised_gbp || 0),
                tip_goal_gbp: Number(data.stream?.tip_goal_gbp || 0),
                peak_viewers: Number(
                  data.stream?.peak_viewers ||
                    data.stream?.viewer_count ||
                    0
                ),
                tipper_count: data.tipper_count || 0,
                showcase_name: data.stream?.showcase_name,
                showcase_amount_gbp: data.stream?.showcase_amount_gbp,
                showcase_avatar_url: data.stream?.showcase_avatar_url,
                my_tip_gbp: data.my_tip_gbp || 0,
                is_host: !!data.is_host,
              }
            : null);
        if (!base) return;

        const apiDur = Number(
          base.duration_seconds || data.duration_seconds || 0
        );
        const duration_seconds = Math.max(apiDur, localElapsed());

        const summary = { ...base, duration_seconds };
        setMyTipTotal(Number(summary.my_tip_gbp || 0));
        setEndSummary((prev: any) => {
          if (prev?.is_host) {
            // Host keeps own summary but still upgrade duration if higher
            return {
              ...prev,
              duration_seconds: Math.max(
                Number(prev.duration_seconds || 0),
                duration_seconds
              ),
            };
          }
          if (!prev) return summary;
          return {
            ...summary,
            duration_seconds: Math.max(
              Number(prev.duration_seconds || 0),
              duration_seconds
            ),
            tip_raised_gbp: Math.max(
              Number(prev.tip_raised_gbp || 0),
              Number(summary.tip_raised_gbp || 0)
            ),
            peak_viewers: Math.max(
              Number(prev.peak_viewers || 0),
              Number(summary.peak_viewers || 0)
            ),
          };
        });
      };

      const fetchStatus = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`/api/live/status?id=${id}`, {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
          cache: 'no-store',
        });
        return res.json().catch(() => ({}));
      };

      try {
        // Seed with local elapsed so viewers never flash 0:00
        setEndSummary((prev: any) => {
          if (prev?.is_host) return prev;
          if (prev && Number(prev.duration_seconds || 0) > 0) return prev;
          return {
            title: stream?.title,
            duration_seconds: localElapsed(),
            tip_raised_gbp: Number(stream?.tip_raised_gbp || 0),
            tip_goal_gbp: Number(stream?.tip_goal_gbp || 0),
            peak_viewers: peakViewers,
            tipper_count: 0,
            showcase_name: stream?.showcase_name,
            showcase_amount_gbp: stream?.showcase_amount_gbp,
            showcase_avatar_url: stream?.showcase_avatar_url,
            my_tip_gbp: myTipTotal,
            is_host: false,
          };
        });

        let data = await fetchStatus();
        applyStatus(data);

        // Retry until stored duration is available (host write may lag)
        for (let i = 0; i < 5; i++) {
          const dur = Number(
            data?.summary?.duration_seconds ||
              data?.duration_seconds ||
              data?.stream?.duration_seconds ||
              0
          );
          if (data?.status === 'ended' && dur > 0) break;
          await new Promise((r) => setTimeout(r, 600));
          data = await fetchStatus();
          applyStatus(data);
        }
      } catch (e) {
        console.error('finalize end', e);
        setEndSummary((prev: any) => {
          if (prev && Number(prev.duration_seconds || 0) > 0) return prev;
          return {
            title: stream?.title,
            duration_seconds: localElapsed(),
            tip_raised_gbp: Number(stream?.tip_raised_gbp || 0),
            tip_goal_gbp: Number(stream?.tip_goal_gbp || 0),
            peak_viewers: peakViewers,
            tipper_count: 0,
            showcase_name: stream?.showcase_name,
            showcase_amount_gbp: stream?.showcase_amount_gbp,
            showcase_avatar_url: stream?.showcase_avatar_url,
            my_tip_gbp: myTipTotal,
            is_host: false,
          };
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cleanupRoom, id, supabase]
  );

  finalizeRef.current = finalizeStreamEnded;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await loadMeta();
      if (cancelled || !meta?.stream) return;
      if (meta.stream.status === 'ended') return;
      const asCreator = meta.userId === meta.stream.creator_id;
      await connectLive(meta.stream, asCreator);
    })();

    const poll = setInterval(async () => {
      try {
        if (endFinalized.current) return;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/live/status?id=${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (data.stream) {
          setStream((s) => (s ? { ...s, ...data.stream } : s));
          if (typeof data.stream.show_join_messages === 'boolean') {
            setShowJoinMessages(data.stream.show_join_messages);
            showJoinsRef.current = data.stream.show_join_messages;
          }
          if (data.stream.slow_mode_seconds != null) {
            setSlowModeSeconds(Number(data.stream.slow_mode_seconds || 0));
          }
        }
        if (Array.isArray(data.top_tippers)) {
          setTopTippers(data.top_tippers);
        }
        if (data.my_rank != null) {
          setMyTipRank(Number(data.my_rank));
        } else if (data.my_rank === null) {
          setMyTipRank(null);
        }
        if (typeof data.my_tip_gbp === 'number') {
          setMyTipTotal(Number(data.my_tip_gbp));
        }
        if (data.status === 'ended' || data.stream?.status === 'ended') {
          void finalizeRef.current(data.stream);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 1500);

    // Realtime: instant end for viewers
    const statusCh = supabase
      .channel(`live-status-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_streams',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          setStream((s) => (s ? { ...s, ...row } : s));
          if (row.slow_mode_seconds != null) {
            setSlowModeSeconds(Number(row.slow_mode_seconds || 0));
          }
          if (typeof row.show_join_messages === 'boolean') {
            setShowJoinMessages(row.show_join_messages);
            showJoinsRef.current = row.show_join_messages;
          }
          if (row.status === 'ended') {
            void finalizeRef.current(row);
          }
        }
      )
      .subscribe();

    // Cancel any pending "left" from a quick remount (React strict / reconnect)
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }

    return () => {
      cancelled = true;
      clearInterval(poll);
      void supabase.removeChannel(statusCh);
      cleanupRoom();
      // Debounced leave: only post if still gone after 4s (avoids join→left→join glitch)
      if (showJoinsRef.current && id && joinAnnouncedRef.current) {
        leaveTimerRef.current = setTimeout(() => {
          void (async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) return;
              const { data: s } = await supabase
                .from('live_streams')
                .select('creator_id, show_join_messages, status')
                .eq('id', id)
                .maybeSingle();
              if (!s || s.creator_id === user.id) return;
              if (s.show_join_messages === false) return;
              if (s.status === 'ended') return;
              let label = 'Someone';
              const { data: prof } = await supabase
                .from('profiles')
                .select('display_name, username')
                .eq('id', user.id)
                .maybeSingle();
              if (prof?.display_name) label = prof.display_name;
              else if (prof?.username) label = `@${prof.username}`;
              await supabase.from('live_chat_messages').insert({
                stream_id: id,
                user_id: user.id,
                content: `__LEAVE__:${label}`.slice(0, 300),
              });
              joinAnnouncedRef.current = false;
            } catch {
              /* ignore */
            }
          })();
        }, 4000);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Realtime chat
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`live-chat-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `stream_id=eq.${id}`,
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row?.id) return;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                ...row,
                profile: null,
              },
            ].slice(-50);
          });

          // Enrich profile in background
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', row.user_id)
            .single();
          if (profile) {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === row.id ? { ...m, profile } : m
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  const chatNearBottom = useRef(true);

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    const onScroll = () => {
      const dist = box.scrollHeight - box.scrollTop - box.clientHeight;
      chatNearBottom.current = dist < 80;
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, [liveStatus]);

  useEffect(() => {
    if (!chatNearBottom.current) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Realtime private requests + stream private flag
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`live-private-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_private_requests',
          filter: `stream_id=eq.${id}`,
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.status === 'pending' && isOwner) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, display_name, avatar_url')
              .eq('id', row.requester_id)
              .single();
            setIncomingPrivates((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev;
              playPrivateChime();
              // 60s auto-decline countdown
              setPrivateReqLeft((m) => ({ ...m, [row.id]: 60 }));
              if (privateTimers.current[row.id]) {
                clearInterval(privateTimers.current[row.id]);
              }
              privateTimers.current[row.id] = setInterval(() => {
                setPrivateReqLeft((m) => {
                  const left = (m[row.id] ?? 60) - 1;
                  if (left <= 0) {
                    clearInterval(privateTimers.current[row.id]);
                    delete privateTimers.current[row.id];
                    void respondPrivate(row.id, 'decline');
                    return { ...m, [row.id]: 0 };
                  }
                  return { ...m, [row.id]: left };
                });
              }, 1000);
              return [...prev, { ...row, profile }];
            });
          }
          if (row.status !== 'pending') {
            setIncomingPrivates((prev) => prev.filter((p) => p.id !== row.id));
            if (privateTimers.current[row.id]) {
              clearInterval(privateTimers.current[row.id]);
              delete privateTimers.current[row.id];
            }
            setPrivateReqLeft((m) => {
              const n = { ...m };
              delete n[row.id];
              return n;
            });
            if (userId && row.requester_id === userId) {
              setMyPendingPrivate(null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_streams',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          setStream((s) => (s ? { ...s, ...row } : s));
          if (row.slow_mode_seconds != null) {
            setSlowModeSeconds(Number(row.slow_mode_seconds || 0));
          }
          setPrivateEndsAt(row.private_ends_at || null);
          if (!row.private_active) {
            setPrivateLockedOut(false);
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
      Object.values(privateTimers.current).forEach(clearInterval);
      privateTimers.current = {};
    };
  }, [id, supabase, isOwner, userId]);

  // Countdown timer for private
  useEffect(() => {
    if (!privateEndsAt || !stream?.private_active) {
      setPrivateCountdown('');
      return;
    }
    const tick = () => {
      const ms = new Date(privateEndsAt).getTime() - Date.now();
      if (ms <= 0) {
        setPrivateCountdown('0:00');
        // auto end
        void (async () => {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            await fetch('/api/live/private/end', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ stream_id: id, force_timer: true }),
            });
          } catch {
            /* ignore */
          }
        })();
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setPrivateCountdown(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [privateEndsAt, stream?.private_active, id, supabase]);

  useEffect(() => {
    if (liveStatus !== 'live' || !id) return;
    const push = () => {
      const n = roomRef.current
        ? Math.max(0, roomRef.current.numParticipants - (isOwner ? 1 : 0))
        : viewerCount;
      // Creator subtracts self; viewers report room size minus 1 (creator)
      let count = n;
      if (!isOwner && roomRef.current) {
        count = Math.max(0, roomRef.current.numParticipants - 1);
      }
      bumpViewers(count);
      if (isOwner) {
        void supabase
          .from('live_streams')
          .update({
            viewer_count: count,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }
    };
    push();
    const t = setInterval(push, 5000);
    return () => clearInterval(t);
  }, [isOwner, liveStatus, id, supabase]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toggleCam = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  };

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };


  const spawnReaction = (emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const left = 10 + Math.random() * 50;
    const drift = `${-8 - Math.random() * 36}px`;
    setFloatingReacts((prev) => [
      ...prev.slice(-14),
      { id, emoji, left, drift },
    ]);
    window.setTimeout(() => {
      setFloatingReacts((prev) => prev.filter((r) => r.id !== id));
    }, 2600);
  };
  spawnReactionRef.current = spawnReaction;

  const sendReaction = async (emoji: string) => {
    if (liveStatus !== 'live') return;
    if (Date.now() - lastReactAt.current < 400) return;
    lastReactAt.current = Date.now();
    spawnReaction(emoji);
    try {
      const room = roomRef.current;
      if (room?.localParticipant) {
        const data = new TextEncoder().encode(
          JSON.stringify({ type: 'reaction', emoji })
        );
        await room.localParticipant.publishData(data, { reliable: false });
      }
    } catch {
      /* ignore */
    }
  };

  const announceJoinLeave = async (
    streamId: string,
    kind: 'join' | 'leave'
  ) => {
    try {
      if (!showJoinsRef.current) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // Prefer latest profile name
      let label = 'Someone';
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', user.id)
        .maybeSingle();
      if (prof?.display_name) label = prof.display_name;
      else if (prof?.username) label = `@${prof.username}`;
      else if (myProfile?.display_name) label = myProfile.display_name;
      else if (myProfile?.username) label = `@${myProfile.username}`;

      const content =
        kind === 'join' ? `__JOIN__:${label}` : `__LEAVE__:${label}`;
      const { data: row } = await supabase
        .from('live_chat_messages')
        .insert({
          stream_id: streamId,
          user_id: user.id,
          content: content.slice(0, 300),
        })
        .select('id, stream_id, user_id, content, created_at')
        .single();

      // Optimistic so the sender also sees it if realtime is slow
      if (row) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [
            ...prev,
            {
              ...row,
              profile: {
                display_name: prof?.display_name,
                username: prof?.username,
              },
            },
          ];
        });
      }
    } catch (e) {
      console.error('join/leave announce', e);
    }
  };

  const moderateUser = async (
    targetUserId: string,
    action: 'mute' | 'ban' | 'clear'
  ) => {
    if (!stream || !isOwner || modBusy) return;
    setModBusy(true);
    setModTarget(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/live/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          stream_id: stream.id,
          user_id: targetUserId,
          action,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      try {
        const room = roomRef.current;
        if (room?.localParticipant) {
          const payload = new TextEncoder().encode(
            JSON.stringify({
              type: 'moderation',
              user_id: targetUserId,
              action,
            })
          );
          await room.localParticipant.publishData(payload, { reliable: true });
        }
      } catch {
        /* ignore */
      }
      if (action === 'ban') {
        alert('User banned from this live');
      } else if (action === 'mute') {
        alert('User muted for this live');
      } else {
        alert('Restriction cleared');
      }
    } catch (e: any) {
      alert(e.message || 'Could not update moderation');
    } finally {
      setModBusy(false);
    }
  };

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text || !userId || !stream || sendingChat) return;
    if (text.length > 300) return;

    if (myModeration === 'mute' || myModeration === 'ban') {
      alert(
        myModeration === 'ban'
          ? 'You are banned from this live'
          : 'You are muted and cannot chat in this live'
      );
      return;
    }

    // Slow mode — fans only (host always free)
    // Prefer live state (LiveKit broadcast) then stream row
    const slow = Number(
      slowModeRef.current ||
        slowModeSeconds ||
        stream.slow_mode_seconds ||
        0
    );
    if (!isOwner && slow > 0) {
      const elapsed = (Date.now() - lastChatSentAt.current) / 1000;
      if (elapsed < slow) {
        const left = Math.ceil(slow - elapsed);
        setSlowModeLeft(left);
        alert(`Slow mode: wait ${left}s before sending again`);
        return;
      }
    }

    setSendingChat(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/live/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          stream_id: stream.id,
          content: text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'MUTED') {
          setMyModeration('mute');
        }
        if (data.code === 'BANNED') {
          setMyModeration('ban');
        }
        throw new Error(data.error || 'Could not send');
      }
      setChatText('');
      if (!isOwner) {
        lastChatSentAt.current = Date.now();
        setSlowModeLeft(slow);
      }
      const row = data.message;
      if (row) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [
            ...prev,
            {
              ...row,
              profile: myProfile,
            },
          ].slice(-50);
        });
      }
    } catch (e: any) {
      alert(e.message || 'Could not send');
    } finally {
      setSendingChat(false);
    }
  };

  // Refresh mute/ban state while in live (backup if LiveKit data missed)
  useEffect(() => {
    if (!id || !userId || isOwner) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data: mod } = await supabase
          .from('live_stream_moderation')
          .select('action')
          .eq('stream_id', id)
          .eq('user_id', userId)
          .maybeSingle();
        if (cancelled) return;
        if (mod?.action === 'mute' || mod?.action === 'ban') {
          setMyModeration(mod.action);
          if (mod.action === 'ban') {
            try {
              roomRef.current?.disconnect();
            } catch {
              /* ignore */
            }
          }
        } else {
          setMyModeration(null);
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const iv = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [id, userId, isOwner, supabase]);



  useEffect(() => {
    slowModeRef.current = slowModeSeconds;
  }, [slowModeSeconds]);

  // Countdown label for slow mode
  useEffect(() => {
    if (isOwner || slowModeSeconds <= 0) {
      setSlowModeLeft(0);
      return;
    }
    const t = setInterval(() => {
      const elapsed = (Date.now() - lastChatSentAt.current) / 1000;
      const left = Math.max(0, Math.ceil(slowModeSeconds - elapsed));
      setSlowModeLeft(left);
    }, 250);
    return () => clearInterval(t);
  }, [isOwner, slowModeSeconds]);

  const clearAnnounceTimers = () => {
    if (announceTimerRef.current) {
      clearTimeout(announceTimerRef.current);
      announceTimerRef.current = null;
    }
    if (announceExitTimerRef.current) {
      clearTimeout(announceExitTimerRef.current);
      announceExitTimerRef.current = null;
    }
  };

  const hideAnnounceBanner = () => {
    if (!announceBanner || announceExiting) return;
    setAnnounceExiting(true);
    clearAnnounceTimers();
    announceExitTimerRef.current = setTimeout(() => {
      setAnnounceBanner(null);
      setAnnounceExiting(false);
      announceExitTimerRef.current = null;
    }, 380);
  };

  const showAnnounceBanner = (text: string, durationMs: number) => {
    const clean = text.trim().slice(0, 120);
    if (!clean) return;
    clearAnnounceTimers();
    setAnnounceExiting(false);
    setAnnounceBanner(clean);
    playAnnounceChime();
    // 0 = permanent (until host clears or new announce)
    if (durationMs > 0) {
      announceTimerRef.current = setTimeout(() => {
        hideAnnounceBanner();
      }, durationMs);
    }
  };

  const broadcastAnnounce = async (
    payload: Record<string, unknown>
  ) => {
    try {
      const room = roomRef.current;
      if (room?.localParticipant) {
        const data = new TextEncoder().encode(JSON.stringify(payload));
        await room.localParticipant.publishData(data, { reliable: true });
      }
    } catch {
      /* ignore */
    }
  };

  const sendAnnounce = async () => {
    if (!isOwner || !stream) return;
    const clean = announceDraft.trim().slice(0, 120);
    if (!clean) {
      alert('Write a short announcement');
      return;
    }
    const durationMs = announceDurationMs;
    showAnnounceBanner(clean, durationMs);
    setShowAnnounceEditor(false);
    setAnnounceDraft('');
    await broadcastAnnounce({
      type: 'announce',
      text: clean,
      durationMs,
    });
  };

  const clearAnnounceForAll = async () => {
    hideAnnounceBanner();
    if (isOwner) {
      await broadcastAnnounce({ type: 'announce_clear' });
    }
  };

    const openGoalEditor = () => {
    if (!isOwner || !stream) return;
    const existing = Array.isArray(stream.tip_goals) ? stream.tip_goals : [];
    if (existing.length) {
      setGoalDraftLevels(
        existing.map((g) => ({
          label: g.label || '',
          amount: String(g.amount ?? ''),
        }))
      );
    } else if (Number(stream.tip_goal_gbp || 0) > 0) {
      setGoalDraftLevels([
        {
          label: 'Tip goal',
          amount: String(Number(stream.tip_goal_gbp)),
        },
      ]);
    } else {
      setGoalDraftLevels([{ label: '', amount: '' }]);
    }
    setShowGoalEditor(true);
  };

  const saveTipGoal = async () => {
    if (!isOwner || !stream || savingGoal) return;
    const levels = goalDraftLevels
      .map((row) => ({
        label: row.label.trim(),
        amount: Number(row.amount),
      }))
      .filter((row) => row.label && Number.isFinite(row.amount) && row.amount > 0);

    // Empty = clear all goals
    setSavingGoal(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/live/tip-goal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          stream_id: stream.id,
          levels,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      const goal = Number(data.tip_goal_gbp || 0);
      const raised = Number(data.tip_raised_gbp || stream.tip_raised_gbp || 0);
      const tipGoals = Array.isArray(data.tip_goals) ? data.tip_goals : [];
      setStream((s) =>
        s
          ? {
              ...s,
              tip_goal_gbp: goal,
              tip_raised_gbp: raised,
              tip_goals: tipGoals,
            }
          : s
      );
      prevGoalPct.current =
        goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
      try {
        const room = roomRef.current;
        if (room?.localParticipant) {
          const payload = new TextEncoder().encode(
            JSON.stringify({
              type: 'tip_goal',
              tip_goal_gbp: goal,
              tip_raised_gbp: raised,
              tip_goals: tipGoals,
            })
          );
          await room.localParticipant.publishData(payload, { reliable: true });
        }
      } catch {
        /* ignore */
      }
      setShowGoalEditor(false);
    } catch (e: any) {
      alert(e.message || 'Could not update goal');
    } finally {
      setSavingGoal(false);
    }
  };

    const cycleSlowMode = async () => {
    if (!isOwner || !stream) return;
    const opts = [0, 5, 10, 30];
    const idx = opts.indexOf(slowModeSeconds);
    const next = opts[(idx < 0 ? 0 : idx + 1) % opts.length];
    setSlowModeSeconds(next);
    setStream((s) => (s ? { ...s, slow_mode_seconds: next } : s));

    // Instant to everyone in the room (does not wait for DB/poll)
    try {
      const room = roomRef.current;
      if (room?.localParticipant) {
        const data = new TextEncoder().encode(
          JSON.stringify({ type: 'slow_mode', seconds: next })
        );
        await room.localParticipant.publishData(data, { reliable: true });
      }
    } catch (e) {
      console.error('slow mode broadcast', e);
    }

    try {
      const { error } = await supabase
        .from('live_streams')
        .update({
          slow_mode_seconds: next,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stream.id);
      if (error) {
        console.error('slow mode save', error.message);
        // Column may be missing — still works via LiveKit for current viewers
      }
    } catch {
      /* ignore */
    }
  };


  const requestPrivate = async () => {
    if (!stream || isOwner) return;
    setRequestingPrivate(true);
    setPrivateError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');
      const res = await fetch('/api/live/private/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          stream_id: stream.id,
          minutes: privateMinutes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_BALANCE') {
          const go = confirm(
            `Need £${Number(data.needed).toFixed(2)} in wallet. Top up?`
          );
          if (go) window.location.href = '/wallet';
          return;
        }
        throw new Error(data.error || 'Request failed');
      }
      setMyPendingPrivate(data.request);
      setShowPrivate(false);
    } catch (e: any) {
      setPrivateError(e.message || 'Failed');
    } finally {
      setRequestingPrivate(false);
    }
  };

  const respondPrivate = async (requestId: string, action: 'accept' | 'decline') => {
    setPrivateBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/live/private/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ request_id: requestId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      setIncomingPrivates((prev) => prev.filter((p) => p.id !== requestId));
      if (action === 'accept' && data.private_ends_at) {
        setPrivateEndsAt(data.private_ends_at);
        setStream((s) =>
          s
            ? {
                ...s,
                private_active: true,
                private_ends_at: data.private_ends_at,
              }
            : s
        );
      }
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setPrivateBusy(false);
    }
  };

  const endPrivate = async () => {
    // Early end needs BOTH sides — first click only sends a request
    const iAmCreator = isOwner;
    const alreadyMe = iAmCreator
      ? !!stream?.private_end_by_creator
      : !!stream?.private_end_by_fan;
    const otherReady = iAmCreator
      ? !!stream?.private_end_by_fan
      : !!stream?.private_end_by_creator;

    if (alreadyMe && !otherReady) {
      alert('Waiting for the other person to also request end.');
      return;
    }

    if (!otherReady) {
      const ok = confirm(
        'Request to end this private early?\n\n' +
          'It only ends when BOTH of you request it. ' +
          'Otherwise it runs until the timer finishes.'
      );
      if (!ok) return;
    }

    setPrivateBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/live/private/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ stream_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');

      if (data.ended || data.public_again) {
        setStream((s) =>
          s
            ? {
                ...s,
                private_active: false,
                private_user_id: null,
                private_ends_at: null,
                private_end_by_creator: false,
                private_end_by_fan: false,
              }
            : s
        );
        setPrivateEndsAt(null);
        setPrivateLockedOut(false);
      } else if (data.waiting) {
        setStream((s) =>
          s
            ? {
                ...s,
                private_end_by_creator: !!data.private_end_by_creator,
                private_end_by_fan: !!data.private_end_by_fan,
              }
            : s
        );
      }
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setPrivateBusy(false);
    }
  };


  const shareLive = async () => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/live/${id}`;
    const creatorName =
      creator?.display_name ||
      (creator?.username ? `@${creator.username}` : 'Creator');
    const title = stream?.title || `${creatorName} is live`;
    const text = `Watch ${creatorName} live on World Of Dommes`;

    const markCopied = () => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    };

    // Always try clipboard first so the deep link is ready to paste
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      markCopied();
    } catch {
      /* clipboard may be blocked */
    }

    // Native share sheet on mobile (after copy) — best of both worlds
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text, url });
        if (!copied) markCopied();
        return;
      }
    } catch {
      // User cancelled share sheet — still fine if we copied
    }

    if (!copied) {
      // Last resort: prompt
      try {
        window.prompt('Copy this live link:', url);
        markCopied();
      } catch {
        /* ignore */
      }
    }
  };

  const toggleFollow = async () => {
    if (!userId || !stream || isOwner || followBusy) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', stream.creator_id);
        setIsFollowing(false);
      } else {
        await supabase.from('follows').insert({
          follower_id: userId,
          following_id: stream.creator_id,
        });
        setIsFollowing(true);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setFollowBusy(false);
    }
  };

  const sendTip = async (amount: number) => {
    if (!stream || isOwner) return;
    const minT = creatorMinTip > 2 ? creatorMinTip : 2;
    if (!Number.isFinite(amount) || amount < minT) {
      setTipError(`Minimum tip is £${minT.toFixed(2)}`);
      return;
    }
    // Optional note — max 50 chars, no links
    let note = tipNote.replace(/\s+/g, ' ').trim().slice(0, 50);
    if (/https?:\/\/|www\.|\.[a-z]{2,}\//i.test(note)) {
      setTipError('Tip notes cannot include links');
      return;
    }
    note = note.replace(/[\u0000-\u001F\u007F]/g, '');
    setTipping(true);
    setTipError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');

      const res = await fetch('/api/live/tip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          stream_id: stream.id,
          amount,
          message: note || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_BALANCE') {
          const go = confirm(
            `Not enough balance (need £${Number(data.needed || amount).toFixed(2)}). Open wallet?`
          );
          if (go) window.location.href = '/wallet';
          return;
        }
        throw new Error(data.error || 'Tip failed');
      }
      if (typeof data.balance === 'number') {
        notifyBalanceUpdated(data.balance);
      }
      setStream((s) =>
        s
          ? {
              ...s,
              tip_raised_gbp: data.tip_raised_gbp,
              tip_goal_gbp: data.tip_goal_gbp ?? s.tip_goal_gbp,
                tip_goals:
                  data.tip_goals !== undefined
                    ? data.tip_goals
                    : s.tip_goals,
              showcase_user_id:
                data.showcase?.user_id ?? s.showcase_user_id,
              showcase_amount_gbp:
                data.showcase?.amount_gbp ?? s.showcase_amount_gbp,
              showcase_name: data.showcase?.name ?? s.showcase_name,
              showcase_avatar_url:
                data.showcase?.avatar_url ?? s.showcase_avatar_url,
            }
          : s
      );
      const flash = data.is_showcase
        ? `£${Number(data.amount).toFixed(2)} · You're top tipper 👑`
        : `£${Number(data.amount).toFixed(2)} tipped`;
      setTipFlash(flash);
      playTipChime();
      setTimeout(() => setTipFlash(null), 2800);
      setShowTip(false);
      setCustomTip('');
      setTipNote('');

      if (typeof data.user_total === 'number') {
        setMyTipTotal(Number(data.user_total));
      } else {
        setMyTipTotal((prev) =>
          Math.round((prev + Number(data.amount || 0)) * 100) / 100
        );
      }
      // Refresh mini leaderboard after tip
      try {
        const boardRes = await fetch(`/api/live/status?id=${stream.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const board = await boardRes.json().catch(() => ({}));
        if (Array.isArray(board.top_tippers)) setTopTippers(board.top_tippers);
        if (board.my_rank != null) setMyTipRank(Number(board.my_rank));
        else if (board.my_rank === null) setMyTipRank(null);
      } catch {
        /* ignore */
      }
      const newRaised = Number(data.tip_raised_gbp || 0);
      const goalAmt = Number(data.tip_goal_gbp || stream.tip_goal_gbp || 0);
      if (goalAmt > 0) {
        const newPct = Math.min(100, (newRaised / goalAmt) * 100);
        const prevPct = prevGoalPct.current;
        for (const m of [25, 50, 75, 100]) {
          if (prevPct < m && newPct >= m) {
            if (m === 100) {
              setGoalReachedFlash(true);
              playGoalChime();
              setTimeout(() => setGoalReachedFlash(false), 4500);
            } else {
              setMilestoneFlash(m);
              setTimeout(() => setMilestoneFlash(null), 2800);
            }
            break;
          }
        }
        prevGoalPct.current = newPct;
      }
      prevRaised.current = newRaised;

      // Chat: tip amount + optional note in same message
      const serverNote =
        typeof data.message === 'string' ? String(data.message).trim() : '';
      const noteForChat = (serverNote || note || '').slice(0, 50);
      const tipLine = noteForChat
        ? `__TIP__:${Number(data.amount).toFixed(2)}|${noteForChat}`
        : `__TIP__:${Number(data.amount).toFixed(2)}`;
      try {
        await supabase.from('live_chat_messages').insert({
          stream_id: stream.id,
          user_id: userId!,
          content: tipLine,
        });
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      setTipError(e.message || 'Tip failed');
    } finally {
      setTipping(false);
    }
  };


  const endLive = async () => {
    if (!confirm('End this live stream? It will not be saved.')) return;
    setEnding(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const peak = Math.max(peakViewers, viewerCount);
      // Mark ended in DB FIRST so viewer polls / status API see it before room drops
      const res = await fetch('/api/live/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          stream_id: id,
          peak_viewers: peak,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not end');
      endFinalized.current = true;
      setLiveStatus('ended');
      try {
        await cleanupRoom();
      } catch {
        /* ignore */
      }
      setEndSummary({
        ...(data.summary || {
          title: stream?.title,
          duration_seconds: liveStartedAt
            ? Math.floor((Date.now() - liveStartedAt) / 1000)
            : 0,
          tip_raised_gbp: Number(stream?.tip_raised_gbp || 0),
          tip_goal_gbp: Number(stream?.tip_goal_gbp || 0),
          peak_viewers: peak,
          tipper_count: 0,
          showcase_name: stream?.showcase_name,
          showcase_amount_gbp: stream?.showcase_amount_gbp,
          showcase_avatar_url: stream?.showcase_avatar_url,
        }),
        my_tip_gbp: 0,
        is_host: true,
      });
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setEnding(false);
    }
  };

  const formatDuration = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0)
      return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <Loader2 className="animate-spin text-pink-500" size={28} />
        </div>
      </AuthGuard>
    );
  }

  if (error && !stream) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-zinc-300 mb-4">{error}</p>
              <Link href="/live" className="text-pink-400 hover:text-pink-300">
                ← Back to Live
              </Link>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const name =
    creator?.display_name ||
    (creator?.username ? `@${creator.username}` : 'Creator');
  const ended = liveStatus === 'ended' || stream?.status === 'ended';
  const showAsHost = !!(isOwner || endSummary?.is_host);
  const myTipShow = Number(endSummary?.my_tip_gbp ?? myTipTotal ?? 0);
  const goal = Number(stream?.tip_goal_gbp || 0);
  const raised = Number(stream?.tip_raised_gbp || 0);

  const displayName = (m: ChatMsg) =>
    m.profile?.display_name ||
    (m.profile?.username ? `@${m.profile.username}` : 'Fan');

  const isCreatorMsg = (m: ChatMsg) =>
    !!stream && m.user_id === stream.creator_id;

  /** Parse tip chat lines: __TIP__:12.50 or __TIP__:12.50|note or legacy */
  const parseTipMessage = (content: string) => {
    const withNote = content.match(
      /^__TIP__:([0-9]+(?:\.[0-9]+)?)(?:\|(.{1,50}))?$/
    );
    if (withNote) {
      return {
        amount: Number(withNote[1]),
        note: (withNote[2] || '').trim() || null,
      };
    }
    const legacy = content.match(/^tipped £([0-9]+(?:\.[0-9]+)?)/i);
    if (legacy) {
      return { amount: Number(legacy[1]), note: null as string | null };
    }
    return null;
  };

  const parseSystemLine = (content: string) => {
    if (content.startsWith('__JOIN__:')) {
      return {
        type: 'join' as const,
        label: content.slice(8).trim() || 'Someone',
      };
    }
    if (content.startsWith('__LEAVE__:')) {
      return {
        type: 'leave' as const,
        label: content.slice(9).trim() || 'Someone',
      };
    }
    return null;
  };

  const toggleJoinMessages = async () => {
    if (!isOwner || !stream) return;
    const next = !showJoinMessages;
    setShowJoinMessages(next);
    showJoinsRef.current = next;
    setStream((s) => (s ? { ...s, show_join_messages: next } : s));
    try {
      const room = roomRef.current;
      if (room?.localParticipant) {
        const data = new TextEncoder().encode(
          JSON.stringify({ type: 'join_messages', enabled: next })
        );
        await room.localParticipant.publishData(data, { reliable: true });
      }
    } catch {
      /* ignore */
    }
    try {
      await supabase
        .from('live_streams')
        .update({
          show_join_messages: next,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stream.id);
    } catch {
      /* ignore */
    }
  };

  const toggleChatBlockLinks = async () => {
    if (!isOwner || !stream) return;
    const next = !chatBlockLinks;
    setChatBlockLinks(next);
    setStream((s) => (s ? { ...s, chat_block_links: next } : s));
    try {
      const room = roomRef.current;
      if (room?.localParticipant) {
        const data = new TextEncoder().encode(
          JSON.stringify({ type: 'chat_filters', block_links: next, require: chatRequire })
        );
        await room.localParticipant.publishData(data, { reliable: true });
      }
    } catch {
      /* ignore */
    }
    try {
      await supabase
        .from('live_streams')
        .update({
          chat_block_links: next,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stream.id);
    } catch {
      /* ignore */
    }
  };

  const cycleChatRequire = async () => {
    if (!isOwner || !stream) return;
    const order: Array<'anyone' | 'followers' | 'subscribers'> = [
      'anyone',
      'followers',
      'subscribers',
    ];
    const i = order.indexOf(chatRequire);
    const next = order[(i + 1) % order.length];
    setChatRequire(next);
    setStream((s) => (s ? { ...s, chat_require: next } : s));
    try {
      const room = roomRef.current;
      if (room?.localParticipant) {
        const data = new TextEncoder().encode(
          JSON.stringify({
            type: 'chat_filters',
            block_links: chatBlockLinks,
            require: next,
          })
        );
        await room.localParticipant.publishData(data, { reliable: true });
      }
    } catch {
      /* ignore */
    }
    try {
      await supabase
        .from('live_streams')
        .update({
          chat_require: next,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stream.id);
    } catch {
      /* ignore */
    }
  };

  return (
    <AuthGuard>
      <div className="bg-black text-white flex lg:min-h-screen">
        <style dangerouslySetInnerHTML={{ __html: `
@keyframes wod-float-react {
  0% { transform: translateY(0) scale(0.3); opacity: 0; }
  12% { transform: translateY(-20px) scale(1.15); opacity: 1; }
  100% { transform: translateY(-50vh) translateX(var(--drift, -24px)) scale(1.1); opacity: 0; }
}
.wod-float-react {
  position: absolute;
  bottom: 6.5rem;
  animation: wod-float-react 2.5s ease-out forwards;
  pointer-events: none;
  font-size: 3.25rem;
  line-height: 1;
  filter: drop-shadow(0 8px 20px rgba(0,0,0,0.55));
  will-change: transform, opacity;
  user-select: none;
}
@media (min-width: 640px) {
  .wod-float-react { font-size: 3.75rem; bottom: 7.5rem; }
}
@media (min-width: 1024px) {
  .wod-float-react { font-size: 5rem; bottom: 8rem; }
}
.mask-fade-chat {
  mask-image: linear-gradient(to bottom, transparent, black 12%, black 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 12%, black 100%);
}
` }} />

        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Mobile: fixed full viewport so no black gap under browser chrome */}
        <main
          className="flex-1 flex flex-col relative bg-black
            fixed inset-0 z-[45] lg:static lg:z-auto
            h-[100dvh] max-h-[100dvh] w-full overflow-hidden"
        >
          <div className="absolute inset-0 bg-black">
            {ended ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-5 overflow-y-auto py-10 bg-black">
                <div className="w-full max-w-sm bg-zinc-900/95 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
                  <div className="text-center mb-5">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center mx-auto mb-3 overflow-hidden text-2xl font-bold ring-2 ring-pink-500/30">
                      {creator?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={creator.avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        (name || 'C')[0]?.toUpperCase()
                      )}
                    </div>
                    <p className="text-xl font-bold text-white leading-tight">
                      {showAsHost
                        ? 'Your live ended'
                        : `${name} ended the live`}
                    </p>
                    <p className="text-sm text-zinc-300 mt-1.5 truncate px-2">
                      {endSummary?.title || stream?.title || 'Live stream'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Not saved · no replay
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                        Duration
                      </p>
                      <p className="text-lg font-semibold mt-0.5 tabular-nums">
                        {formatDuration(
                          Number(endSummary?.duration_seconds || 0)
                        )}
                      </p>
                    </div>
                    {showAsHost ? (
                      <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                          Peak viewers
                        </p>
                        <p className="text-lg font-semibold mt-0.5 tabular-nums">
                          {Number(
                            endSummary?.peak_viewers || peakViewers || 0
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                          You tipped
                        </p>
                        <p className="text-lg font-semibold mt-0.5 text-pink-400 tabular-nums">
                          £{myTipShow.toFixed(2)}
                        </p>
                      </div>
                    )}
                    <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                        Tips raised
                      </p>
                      <p className="text-lg font-semibold text-pink-400 mt-0.5 tabular-nums">
                        £{Number(endSummary?.tip_raised_gbp || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                        Tippers
                      </p>
                      <p className="text-lg font-semibold mt-0.5 tabular-nums">
                        {Number(endSummary?.tipper_count || 0)}
                      </p>
                    </div>
                  </div>

                  {endSummary?.showcase_name &&
                    Number(endSummary?.showcase_amount_gbp || 0) > 0 && (
                      <div className="flex items-center gap-3 bg-gradient-to-r from-pink-600/25 to-rose-600/15 border border-pink-500/30 rounded-2xl px-3 py-2.5 mb-5">
                        {endSummary.showcase_avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={endSummary.showcase_avatar_url}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-pink-700 flex items-center justify-center text-sm font-bold">
                            {String(endSummary.showcase_name)[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase text-pink-300 font-bold flex items-center gap-1">
                            <Crown size={11} className="text-yellow-300" /> Top
                            tipper
                          </p>
                          <p className="text-sm font-semibold truncate">
                            {endSummary.showcase_name}
                          </p>
                          <p className="text-xs text-pink-200">
                            £
                            {Number(endSummary.showcase_amount_gbp).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    )}

                  {!showAsHost && creator?.username && (
                    <Link
                      href={`/${creator.username}`}
                      className="block w-full text-center py-3 mb-2 rounded-2xl bg-zinc-800 border border-zinc-700 font-medium text-sm"
                    >
                      View profile
                    </Link>
                  )}
                  <Link
                    href="/live"
                    className="block w-full text-center py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold text-sm"
                  >
                    {showAsHost ? 'Back to Live' : 'Discover more lives'}
                  </Link>
                  {showAsHost && (
                    <button
                      type="button"
                      onClick={() => router.push('/live')}
                      className="w-full mt-2 py-2.5 text-sm text-zinc-400 hover:text-white"
                    >
                      Go live again
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={isOwner ? localVideoRef : remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={isOwner}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                />
                {isOwner && (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="hidden"
                  />
                )}

                {(connecting || liveStatus === 'connecting') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3 z-10">
                    <Loader2 className="animate-spin text-pink-500" size={32} />
                    <p className="text-sm text-zinc-300">
                      {isOwner ? 'Turning on camera…' : 'Joining live…'}
                    </p>
                  </div>
                )}

                {error && liveStatus === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center z-10">
                    <p className="text-red-300 text-sm mb-4">{error}</p>
                    <button
                      type="button"
                      onClick={() => stream && connectLive(stream, isOwner)}
                      className="px-4 py-2.5 rounded-xl bg-pink-600 text-sm font-medium min-h-[44px]"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Top bar */}
            {!ended && (
              <div
                className="absolute top-0 inset-x-0 z-20 flex items-start justify-between gap-3 px-3 pointer-events-none"
                style={{
                  paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
                }}
              >
                <div className="flex items-center gap-2 pointer-events-auto min-w-0">
                  <button
                    type="button"
                    onClick={() => router.push('/live')}
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur border border-white/10 flex items-center justify-center flex-shrink-0"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0 bg-black/45 backdrop-blur-md rounded-xl sm:rounded-2xl px-2.5 py-1 sm:px-3 sm:py-1.5 border border-white/10">
                    <p className="text-xs sm:text-sm font-semibold truncate max-w-[36vw] sm:max-w-xs leading-tight">
                      {name}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-zinc-300 truncate max-w-[36vw] sm:max-w-xs leading-tight">
                      {stream?.title}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pointer-events-auto flex-shrink-0">
                  <span className="bg-red-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                  <span className="bg-black/50 backdrop-blur text-[11px] sm:text-xs px-2 py-1 rounded-full flex items-center gap-1 border border-white/10 tabular-nums">
                    <Users size={12} />
                    {viewerCount || stream?.viewer_count || 0}
                  </span>
                  {/* Desktop: follow + share inline */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {!isOwner && userId && (
                      <button
                        type="button"
                        onClick={() => void toggleFollow()}
                        disabled={followBusy}
                        className={`h-8 px-2.5 rounded-full text-[11px] font-semibold border backdrop-blur flex items-center gap-1 transition ${
                          isFollowing
                            ? 'bg-black/50 border-white/15 text-zinc-200'
                            : 'bg-pink-600/90 border-pink-400/40 text-white'
                        }`}
                      >
                        {isFollowing ? 'Following' : (
                          <>
                            <UserPlus size={12} /> Follow
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void shareLive()}
                      className={`h-8 w-8 rounded-full backdrop-blur border flex items-center justify-center transition ${
                        linkCopied
                          ? 'bg-pink-600/90 border-pink-400/50 text-white'
                          : 'bg-black/50 border-white/15'
                      }`}
                      title="Share live link"
                    >
                      {linkCopied ? (
                        <Check size={14} />
                      ) : (
                        <Share2 size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLiveSettings(true)}
                      className="h-8 w-8 rounded-full bg-black/50 backdrop-blur border border-white/15 flex items-center justify-center"
                      title="Live settings"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                  {/* Mobile: overflow menu */}
                  <div className="relative sm:hidden z-50">
                    <button
                      type="button"
                      onClick={() => setShowMore((v) => !v)}
                      className="h-8 w-8 rounded-full bg-black/50 backdrop-blur border border-white/15 flex items-center justify-center"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {showMore && (
                      <>
                        {/* Tap anywhere to close — covers top tipper too */}
                        <button
                          type="button"
                          className="fixed inset-0 z-[60] bg-black/40"
                          aria-label="Close menu"
                          onClick={() => setShowMore(false)}
                        />
                        <div className="absolute right-0 top-9 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-[70]">
                          {!isOwner && userId && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowMore(false);
                                void toggleFollow();
                              }}
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-800 flex items-center gap-2"
                            >
                              <UserPlus size={14} className="text-pink-400" />
                              {isFollowing ? 'Unfollow' : 'Follow'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setShowMore(false);
                              void shareLive();
                            }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-800 flex items-center gap-2"
                          >
                            {linkCopied ? (
                              <Check size={14} className="text-pink-400" />
                            ) : (
                              <Share2 size={14} className="text-pink-400" />
                            )}
                            {linkCopied ? 'Link copied' : 'Share live'}
                          </button>
                          <Link
                            href={
                              creator?.username
                                ? `/${creator.username}`
                                : '/live'
                            }
                            onClick={() => setShowMore(false)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <Users size={14} className="text-pink-400" />
                            View profile
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setShowMore(false);
                              setShowLiveSettings(true);
                            }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-800 flex items-center gap-2 border-t border-zinc-800"
                          >
                            <Settings size={14} className="text-pink-400" />
                            Live settings
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tip goal — vertical left meter (LoyalFans-style), tap to hide/show */}
            {!ended && (goal > 0 || raised > 0 || isOwner) && (() => {
              const pct =
                goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
              const levels = Array.isArray(stream?.tip_goals)
                ? stream!.tip_goals!
                : [];
              const activeLabel = (() => {
                if (!levels.length) return goal > 0 ? 'Goal' : 'Tips';
                const active =
                  levels.find((l) => raised < Number(l.amount)) ||
                  levels[levels.length - 1];
                return active?.label || 'Goal';
              })();
              return (
                <div className="absolute left-1.5 sm:left-3 top-[26%] sm:top-[22%] z-20 pointer-events-auto flex flex-col items-center gap-1.5">
                  {goalMeterHidden ? (
                    <button
                      type="button"
                      onClick={() => setGoalMeterHidden(false)}
                      className="w-8 h-14 sm:w-9 sm:h-16 rounded-full bg-black/55 backdrop-blur-md border border-pink-500/40 flex flex-col items-center justify-center shadow-lg active:scale-95 transition"
                      title="Show tip goal"
                    >
                      <span className="text-[10px] font-bold text-pink-300 tabular-nums leading-none">
                        {goal > 0 ? `${Math.round(pct)}%` : '£'}
                      </span>
                      <span className="text-[8px] text-zinc-400 mt-0.5">show</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setGoalMeterHidden(true)}
                        className="group relative flex flex-col items-center active:scale-[0.98] transition"
                        title="Tap to hide"
                      >
                        {/* Vertical meter */}
                        <div className="relative h-[9.5rem] sm:h-[11rem] w-9 sm:w-10 rounded-full bg-black/55 backdrop-blur-md border border-white/15 overflow-hidden shadow-xl flex flex-col justify-end">
                          <div
                            className="w-full bg-gradient-to-t from-pink-700 via-pink-500 to-rose-400 transition-all duration-700 ease-out rounded-full"
                            style={{
                              height: goal > 0 ? `${Math.max(pct, pct > 0 ? 6 : 0)}%` : '0%',
                            }}
                          />
                          {/* Top labels inside bar */}
                          <div className="absolute inset-x-0 top-1.5 flex flex-col items-center pointer-events-none px-0.5">
                            <span className="text-[9px] sm:text-[10px] font-bold text-white tabular-nums drop-shadow">
                              {goal > 0 ? `${Math.round(pct)}%` : '—'}
                            </span>
                          </div>
                          {/* Shine */}
                          <div className="absolute inset-y-0 left-0 w-[35%] bg-white/10 pointer-events-none rounded-full" />
                        </div>
                        {/* Amount under meter */}
                        <div className="mt-1.5 min-w-[3.25rem] max-w-[4.75rem] text-center rounded-lg bg-black/70 border border-white/15 px-1.5 py-1 shadow-lg backdrop-blur-sm">
                          <p className="text-[11px] sm:text-xs font-bold text-white tabular-nums leading-tight">
                            £{raised.toFixed(0)}
                          </p>
                          {goal > 0 && (
                            <p className="text-[10px] sm:text-[11px] text-pink-200 font-semibold tabular-nums leading-tight">
                              / £{goal.toFixed(0)}
                            </p>
                          )}
                          {levels.length > 0 && (
                            <p className="text-[9px] text-zinc-200 truncate mt-0.5 max-w-[4.25rem] font-medium">
                              {activeLabel}
                            </p>
                          )}
                        </div>
                        {/* Multi-level ticks */}
                        {levels.length > 1 && (
                          <div className="flex gap-0.5 mt-1">
                            {levels.map((lvl, i) => (
                              <div
                                key={i}
                                className={`h-1 w-1.5 rounded-full ${
                                  raised >= Number(lvl.amount)
                                    ? 'bg-pink-400'
                                    : 'bg-zinc-600'
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => openGoalEditor()}
                          className="text-[9px] font-semibold text-zinc-300 hover:text-pink-300 bg-black/50 border border-white/10 rounded-full px-2 py-0.5 backdrop-blur"
                        >
                          Edit
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Mini leaderboard — Top 3 this live · tap to hide/show */}
            {!ended && !hideTopTipper && !showMore && (topTippers.length > 0 || Number(stream?.tip_raised_gbp || 0) > 0) && (
              <div className="absolute top-[3.75rem] sm:top-20 right-2.5 sm:right-3 z-20 pointer-events-auto max-w-[48%] sm:max-w-[200px]">
                {leaderboardHidden ? (
                  <button
                    type="button"
                    onClick={() => setLeaderboardHidden(false)}
                    className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-pink-500/40 rounded-full pl-2 pr-2.5 py-1.5 shadow-lg active:scale-95 transition"
                    title="Show top tippers"
                  >
                    <Crown size={12} className="text-yellow-300 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-pink-100 uppercase tracking-wide">
                      Top 3
                    </span>
                    {topTippers[0] && (
                      <span className="text-[10px] font-semibold text-white tabular-nums">
                        £{Number(topTippers[0].total_gbp).toFixed(0)}
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="bg-zinc-950/85 backdrop-blur-md border border-white/12 rounded-2xl shadow-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setLeaderboardHidden(true)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 border-b border-white/10 active:bg-white/5 transition"
                      title="Tap to hide"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Crown size={12} className="text-yellow-300 flex-shrink-0" />
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-zinc-100 truncate">
                          This live
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-500 flex-shrink-0">hide</span>
                    </button>
                    <div className="px-1.5 py-1.5 sm:px-2 sm:py-2 space-y-1">
                      {topTippers.length === 0 ? (
                        <p className="text-[10px] text-zinc-500 px-2 py-1.5 text-center">
                          Be the first to tip
                        </p>
                      ) : (
                        topTippers.map((t) => {
                          const name =
                            t.display_name || t.username || 'Fan';
                          const isMe = userId && t.user_id === userId;
                          const medal =
                            t.rank === 1
                              ? 'text-yellow-300'
                              : t.rank === 2
                                ? 'text-zinc-300'
                                : 'text-amber-700';
                          const rankBg =
                            t.rank === 1
                              ? 'bg-gradient-to-r from-pink-600/40 to-rose-600/25 border-pink-500/35'
                              : isMe
                                ? 'bg-pink-500/15 border-pink-500/25'
                                : 'bg-white/[0.04] border-transparent';
                          return (
                            <Link
                              key={t.user_id}
                              href={t.username ? `/${t.username}` : '#'}
                              className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-1.5 py-1 sm:px-2 sm:py-1.5 border ${rankBg} transition hover:bg-white/10`}
                              onClick={(e) => {
                                if (!t.username) e.preventDefault();
                              }}
                            >
                              <span
                                className={`w-4 text-center text-[11px] sm:text-xs font-bold tabular-nums ${medal}`}
                              >
                                {t.rank}
                              </span>
                              {t.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={t.avatar_url}
                                  alt=""
                                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-white/20 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                  {name[0]?.toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] sm:text-xs font-semibold text-white truncate leading-tight">
                                  {name}
                                  {isMe ? (
                                    <span className="text-pink-300 font-medium"> · you</span>
                                  ) : null}
                                </p>
                              </div>
                              <span className="text-[11px] sm:text-xs font-bold text-pink-300 tabular-nums flex-shrink-0">
                                £{Number(t.total_gbp).toFixed(2)}
                              </span>
                            </Link>
                          );
                        })
                      )}
                    </div>
                    {/* Your rank if not in top 3 */}
                    {userId &&
                      !isOwner &&
                      myTipTotal > 0 &&
                      myTipRank != null &&
                      myTipRank > 3 && (
                        <div className="px-2.5 pb-2 pt-0.5 border-t border-white/10">
                          <p className="text-[10px] sm:text-[11px] text-zinc-300 text-center">
                            You’re{' '}
                            <span className="font-bold text-pink-300">#{myTipRank}</span>
                            {' · '}
                            <span className="font-semibold text-white tabular-nums">
                              £{myTipTotal.toFixed(2)}
                            </span>
                          </p>
                        </div>
                      )}
                    {userId && !isOwner && myTipTotal <= 0 && topTippers.length > 0 && (
                      <div className="px-2.5 pb-2 pt-0.5 border-t border-white/10">
                        <p className="text-[10px] text-zinc-500 text-center">
                          Tip to join the board
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Simple tip flash */}
            {tipFlash && (
              <div className="absolute top-[28%] inset-x-0 z-30 flex justify-center pointer-events-none px-4">
                <div className="bg-gradient-to-r from-pink-600 to-rose-500 text-white text-sm font-bold px-6 py-3.5 rounded-2xl shadow-2xl shadow-pink-900/50 border border-white/20 animate-in zoom-in-95 fade-in duration-300">
                  {tipFlash}
                </div>
              </div>
            )}

            {milestoneFlash != null && milestoneFlash < 100 && (
              <div className="absolute top-[24%] inset-x-0 z-30 flex justify-center pointer-events-none px-4">
                <div className="bg-black/75 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-pink-400/35 flex items-center gap-2.5 animate-in zoom-in-95 fade-in">
                  <Sparkles className="text-pink-300" size={18} />
                  <p className="text-sm font-bold">
                    Tip goal{' '}
                    <span className="text-pink-300">{milestoneFlash}%</span>
                  </p>
                </div>
              </div>
            )}

            {/* Share success toast */}
            {linkCopied && !ended && (
              <div className="absolute z-[80] left-1/2 -translate-x-1/2 bottom-28 sm:bottom-24 pointer-events-none px-4 w-full max-w-sm">
                <div className="rounded-2xl bg-zinc-900/95 border border-pink-500/40 shadow-xl shadow-pink-900/20 backdrop-blur-md px-4 py-3 flex items-center gap-3 animate-[wod-announce-in_0.3s_ease-out]">
                  <div className="w-9 h-9 rounded-full bg-pink-600/20 flex items-center justify-center flex-shrink-0">
                    <Check size={18} className="text-pink-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">Link copied</p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}/live/${id}`
                        : `/live/${id}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Host announce banner — phone: goal slot; tip goal slides under */}
            {announceBanner && !ended && (
              <div
                className="absolute z-30 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(90%,400px)]
                  top-[3.75rem] sm:top-[5.75rem]
                  flex justify-center sm:justify-center"
                style={{
                  animation: announceExiting
                    ? 'wod-announce-out 0.38s cubic-bezier(0.4,0,0.2,1) forwards'
                    : 'wod-announce-in 0.45s cubic-bezier(0.22,1,0.36,1) both',
                  pointerEvents: isOwner ? 'auto' : 'none',
                }}
              >
                <div className="w-full sm:w-auto max-w-full rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(190,24,93,0.45)] border border-white/20 relative">
                  <div className="bg-gradient-to-br from-pink-500 via-pink-600 to-rose-600 px-3.5 py-2.5 sm:px-5 sm:py-3 text-center relative pr-9">
                    <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.18)_45%,transparent_55%)] opacity-60 pointer-events-none" />
                    <p className="relative text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] text-pink-100/95 mb-0.5">
                      Announcement
                    </p>
                    <p className="relative text-[13px] sm:text-sm font-semibold text-white leading-snug break-words">
                      {announceBanner}
                    </p>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => void clearAnnounceForAll()}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white/90"
                        title="Dismiss for everyone"
                        aria-label="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {goalReachedFlash && (
              <div className="absolute top-[22%] inset-x-0 z-30 flex justify-center pointer-events-none px-4">
                <div className="bg-black/70 backdrop-blur-md text-white px-6 py-4 rounded-3xl shadow-2xl border border-yellow-400/40 flex items-center gap-3 animate-in zoom-in-95 fade-in">
                  <Sparkles className="text-yellow-300" size={22} />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-yellow-300">
                      Goal reached
                    </p>
                    <p className="text-sm font-semibold">
                      Tip goal smashed — thank you
                    </p>
                  </div>
                </div>
              </div>
            )}


            
            {/* Private locked out for other viewers */}
            {privateLockedOut && !ended && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 px-6 text-center">
                <div className="w-full max-w-sm bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
                  <Lock className="text-pink-500 mx-auto mb-3" size={36} />
                  <p className="text-lg font-semibold text-white leading-snug">
                    {name} is in a private
                  </p>
                  <p className="text-sm text-zinc-400 mt-2">
                    Public live is paused for a paid 1:1 session.
                  </p>
                  {privateCountdown && (
                    <div className="mt-5 bg-zinc-800/80 rounded-2xl py-3 px-4">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Time left
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-pink-400 mt-0.5">
                        {privateCountdown}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push('/live')}
                    className="mt-5 w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition"
                  >
                    Back to Live
                  </button>
                </div>
              </div>
            )}

            {/* Private active badge */}
            {!ended && stream?.private_active && (isOwner || isPrivateFan) && (
              <div className="absolute top-[7.5rem] sm:top-36 right-3 z-25 pointer-events-none max-w-[70%]">
                <div className="bg-pink-600/90 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow flex-wrap">
                  <Lock size={12} />
                  PRIVATE
                  {privateCountdown && (
                    <span className="font-mono ml-1">{privateCountdown}</span>
                  )}
                </div>
                {(stream.private_end_by_creator || stream.private_end_by_fan) &&
                  !(stream.private_end_by_creator && stream.private_end_by_fan) && (
                    <p className="mt-1.5 text-[10px] text-zinc-200 bg-black/60 rounded-full px-2.5 py-1 text-right">
                      {isOwner
                        ? stream.private_end_by_creator
                          ? 'Waiting for fan to confirm end'
                          : 'Fan requested to end'
                        : stream.private_end_by_fan
                          ? 'Waiting for creator to confirm end'
                          : 'Creator requested to end'}
                    </p>
                  )}
              </div>
            )}

            {/* Shared emoji reactions — full-height right column so float can travel */}
            {!ended && (
              <div
                className="absolute z-[28] pointer-events-none overflow-hidden
                  top-0 bottom-0 right-11 w-[46%]
                  sm:right-3 sm:w-[40%]
                  lg:right-8 lg:w-[34%] lg:max-w-[340px]"
              >
                {!hideEmojis &&
                  floatingReacts.map((r) => (
                    <span
                      key={r.id}
                      className="wod-float-react"
                      style={{
                        left: `${r.left}%`,
                        ['--drift' as any]: r.drift || '-24px',
                      }}
                    >
                      {r.emoji}
                    </span>
                  ))}
              </div>
            )}

            {/* Chat — fixed height, swipe/scroll to older messages */}
            {!ended && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none px-3 lg:px-6 lg:left-0 lg:right-auto lg:w-full lg:max-w-xl"
                style={{
                  bottom:
                    'max(4.25rem, calc(env(safe-area-inset-bottom) + 3.5rem))',
                }}
              >
                <div
                  ref={chatBoxRef}
                  className="max-w-md lg:max-w-xl max-h-[28vh] sm:max-h-[32vh] lg:max-h-[40vh] overflow-y-auto overscroll-contain pointer-events-auto mask-fade-chat pr-1 space-y-1.5 lg:space-y-2"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'thin',
                  }}
                >
                  {chatMessages.slice(-40).map((m) => {
                    const system = parseSystemLine(m.content);
                    if (system) {
                      return (
                        <div
                          key={m.id}
                          className="flex justify-center lg:justify-start py-0.5 lg:py-1"
                        >
                          <p
                            className={`text-xs lg:text-[13px] font-medium px-3 lg:px-3.5 py-1 lg:py-1.5 rounded-full border backdrop-blur-md shadow-sm lg:shadow-md tracking-wide ${
                              system.type === 'join'
                                ? 'text-white bg-zinc-800/95 border-zinc-500/70 lg:bg-zinc-800/80 lg:border-white/15'
                                : 'text-zinc-200 bg-zinc-900/95 border-zinc-700/80 lg:bg-zinc-900/75 lg:border-white/10'
                            }`}
                          >
                            <span className="text-zinc-400 lg:text-zinc-500 font-normal mr-1">
                              ·
                            </span>
                            {system.type === 'join'
                              ? `${system.label} joined`
                              : `${system.label} left`}
                          </p>
                        </div>
                      );
                    }
                    const tip = parseTipMessage(m.content);
                    if (tip) {
                      return (
                        <div key={m.id} className="flex items-start max-w-[92%]">
                          <div className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-2xl px-2.5 py-1.5 bg-pink-600/90 border border-pink-400/30 shadow-sm backdrop-blur-sm">
                            <DollarSign
                              size={12}
                              className="text-white/95 flex-shrink-0 relative top-[1px]"
                            />
                            <span
                              className={`font-semibold text-pink-50 ${
                                chatTextSize === 's'
                                  ? 'text-[12px]'
                                  : chatTextSize === 'l'
                                    ? 'text-[14px]'
                                    : 'text-[13px]'
                              }`}
                            >
                              {displayName(m)}
                            </span>
                            <span
                              className={`font-bold text-white tabular-nums ${
                                chatTextSize === 's'
                                  ? 'text-[12px]'
                                  : chatTextSize === 'l'
                                    ? 'text-[14px]'
                                    : 'text-[13px]'
                              }`}
                            >
                              £{tip.amount.toFixed(2)}
                            </span>
                            {tip.note ? (
                              <span
                                className={`w-full text-pink-50/95 leading-snug break-words ${
                                  chatTextSize === 's'
                                    ? 'text-[11px]'
                                    : chatTextSize === 'l'
                                      ? 'text-[13px]'
                                      : 'text-[12px]'
                                }`}
                              >
                                {tip.note}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={m.id} className="flex items-start gap-2 group relative">
                        <div
                          className={`bg-black/55 backdrop-blur-md rounded-2xl max-w-[92%] border border-white/5 shadow-sm ${
                            compactChat ? 'px-2 py-1' : 'px-2.5 py-1.5'
                          }`}
                        >
                          <span
                            className={`font-semibold mr-1.5 ${
                              isCreatorMsg(m)
                                ? 'text-pink-300'
                                : 'text-zinc-200/90'
                            } ${
                              chatTextSize === 's'
                                ? 'text-[12px]'
                                : chatTextSize === 'l'
                                  ? 'text-[15px]'
                                  : 'text-[13px]'
                            }`}
                          >
                            {displayName(m)}
                            {isCreatorMsg(m) && (
                              <span className="ml-1 text-[9px] font-bold uppercase tracking-wide bg-pink-500/30 text-pink-200 px-1.5 py-0.5 rounded-md">
                                Host
                              </span>
                            )}
                          </span>
                          <span
                            className={`text-white/95 break-words ${
                              chatTextSize === 's'
                                ? 'text-[13px]'
                                : chatTextSize === 'l'
                                  ? 'text-[16px]'
                                  : 'text-[14px]'
                            }`}
                          >
                            {m.content}
                          </span>
                        </div>
                        {isOwner &&
                          !isCreatorMsg(m) &&
                          m.user_id &&
                          !String(m.content || '').startsWith('__') && (
                            <button
                              type="button"
                              onClick={() =>
                                setModTarget({
                                  userId: m.user_id,
                                  name: displayName(m),
                                })
                              }
                              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition flex-shrink-0"
                              aria-label="Moderate"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          )}
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              </div>
            )}


            {/* Mobile emoji stack — right side, clear of chat */}
            {!ended && liveStatus === 'live' && (
              <div className="sm:hidden absolute right-2 z-30 pointer-events-auto flex flex-col gap-1.5"
                style={{
                  bottom:
                    'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.75rem))',
                }}
              >
                {LIVE_REACT_EMOJIS.map((emoji) => (
                  <button
                    key={`m-${emoji}`}
                    type="button"
                    onClick={() => void sendReaction(emoji)}
                    className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 active:scale-90 transition flex items-center justify-center text-lg shadow-lg"
                    title="React"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* Bottom: chat input + tip / creator controls */}
            {!ended && liveStatus === 'live' && (
              <div
                className="absolute bottom-0 inset-x-0 z-30 px-3 pointer-events-none"
                style={{
                  paddingBottom:
                    'max(0.5rem, env(safe-area-inset-bottom))',
                }}
              >
                <div className="pointer-events-auto max-w-2xl mx-auto w-full space-y-2 relative">
                  {/* Desktop / tablet landscape: horizontal bar above input */}
                  <div className="hidden sm:flex items-center justify-center gap-2">
                    {LIVE_REACT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void sendReaction(emoji)}
                        className="w-11 h-11 rounded-full bg-black/55 hover:bg-black/75 border border-white/15 active:scale-90 transition flex items-center justify-center text-xl shadow-md"
                        title="React"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/15 rounded-full pl-3 sm:pl-4 pr-1 py-1 min-w-0">
                    <input
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value.slice(0, 300))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void sendChat();
                        }
                      }}
                      placeholder={
                        !isOwner && slowModeLeft > 0
                          ? `Slow mode · wait ${slowModeLeft}s`
                          : !isOwner && slowModeSeconds > 0
                            ? `Say something… (${slowModeSeconds}s slow)`
                            : 'Say something…'
                      }
                      className="flex-1 min-w-0 bg-transparent text-base sm:text-sm outline-none placeholder:text-zinc-400"
                      style={{ fontSize: '16px' }}
                      maxLength={300}
                      enterKeyHint="send"
                      autoComplete="off"
                      autoCorrect="on"
                    />
                    <button
                      type="button"
                      onClick={() => void sendChat()}
                      disabled={
                        sendingChat ||
                        !chatText.trim() ||
                        (!isOwner && slowModeLeft > 0)
                      }
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition"
                    >
                      {sendingChat ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>

                  {!isOwner && !stream?.private_active && privateEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setTipError('');
                          setShowTip(true);
                        }}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-pink-600 to-rose-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-900/40 active:scale-95 transition"
                        title="Tip"
                      >
                        <DollarSign size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPrivateError('');
                          setShowPrivate(true);
                        }}
                        disabled={!!myPendingPrivate}
                        className="h-11 w-11 sm:h-12 sm:w-auto sm:px-3 rounded-full bg-zinc-900/90 border border-pink-500/50 text-pink-300 text-xs font-semibold flex items-center justify-center gap-1.5 flex-shrink-0 disabled:opacity-50"
                        title="Request private"
                      >
                        <Lock size={16} className="sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">
                          {myPendingPrivate ? 'Pending' : 'Private'}
                        </span>
                      </button>
                    </>
                  )}

                  {(isOwner || isPrivateFan) && stream?.private_active && (
                    <button
                      type="button"
                      onClick={() => void endPrivate()}
                      disabled={privateBusy}
                      className={`h-12 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 ${
                        (isOwner
                          ? stream.private_end_by_creator
                          : stream.private_end_by_fan)
                          ? 'bg-zinc-700 text-zinc-200'
                          : 'bg-pink-700 text-white'
                      }`}
                    >
                      <Unlock size={14} />
                      {(() => {
                        const me = isOwner
                          ? !!stream.private_end_by_creator
                          : !!stream.private_end_by_fan;
                        const them = isOwner
                          ? !!stream.private_end_by_fan
                          : !!stream.private_end_by_creator;
                        if (me && !them) return 'Waiting…';
                        if (!me && them) return 'Confirm end';
                        return 'Request end';
                      })()}
                    </button>
                  )}


                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setAnnounceDraft('');
                        setShowAnnounceEditor(true);
                      }}
                      className="h-11 px-2.5 rounded-full text-[10px] font-semibold border flex-shrink-0 bg-zinc-900/80 border-zinc-700 text-zinc-200 hover:border-pink-500/50"
                      title="Announce to everyone"
                    >
                      Announce
                    </button>
                  )}

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => void toggleJoinMessages()}
                      className={`h-11 px-2.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${
                        showJoinMessages
                          ? 'bg-zinc-800/90 border-white/20 text-zinc-200'
                          : 'bg-zinc-900/80 border-zinc-700 text-zinc-500'
                      }`}
                      title={
                        showJoinMessages
                          ? 'Join notices on — tap to hide'
                          : 'Join notices off — tap to show'
                      }
                    >
                      {showJoinMessages ? 'Joins on' : 'Joins off'}
                    </button>
                  )}

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => void cycleSlowMode()}
                      className={`h-11 px-2.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${
                        slowModeSeconds > 0
                          ? 'bg-amber-600/90 border-amber-400/40 text-white'
                          : 'bg-zinc-900/80 border-zinc-700 text-zinc-500'
                      }`}
                      title="Slow mode — limit how often fans can chat"
                    >
                      {slowModeSeconds > 0
                        ? `Slow ${slowModeSeconds}s`
                        : 'Slow off'}
                    </button>
                  )}


                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => void cycleChatRequire()}
                      className={`h-11 px-2.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${
                        chatRequire !== 'anyone'
                          ? 'bg-pink-600/90 border-pink-400/40 text-white'
                          : 'bg-zinc-900/80 border-zinc-700 text-zinc-500'
                      }`}
                      title="Who can chat"
                    >
                      {chatRequire === 'anyone'
                        ? 'Chat: all'
                        : chatRequire === 'followers'
                          ? 'Fans only'
                          : 'Subs only'}
                    </button>
                  )}

                  {isOwner && (
                    <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur border border-white/15 rounded-full px-1.5 py-1.5">
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          micOn ? 'bg-zinc-800' : 'bg-red-600'
                        }`}
                      >
                        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleCam}
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          camOn ? 'bg-zinc-800' : 'bg-red-600'
                        }`}
                      >
                        {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                      </button>
                      <button
                        type="button"
                        onClick={endLive}
                        disabled={ending}
                        className="h-10 px-3 rounded-full bg-red-600 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        {ending ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <PhoneOff size={16} />
                        )}
                        End
                      </button>
                    </div>
                  )}
                </div>
                </div>
              </div>
            )}
          </div>
        </main>

        
        
        
        {/* Host announce editor */}
        {showAnnounceEditor && isOwner && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/70"
              aria-label="Close"
              onClick={() => setShowAnnounceEditor(false)}
            />
            <div className="relative w-full sm:max-w-sm bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl">
              <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-4 sm:hidden" />
              <h3 className="text-lg font-semibold text-center mb-1">
                Announce
              </h3>
              <p className="text-sm text-zinc-400 text-center mb-4">
                One line shown to everyone on this live
              </p>
              <textarea
                value={announceDraft}
                onChange={(e) => setAnnounceDraft(e.target.value.slice(0, 120))}
                rows={3}
                placeholder="e.g. Next goal: remove top at £50"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500 resize-none mb-2"
              />
              <p className="text-[11px] text-zinc-500 text-right mb-3">
                {announceDraft.length}/120
              </p>
              <p className="text-xs text-zinc-500 mb-2">How long to show</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {(
                  [
                    { label: '10s', ms: 10_000 },
                    { label: '30s', ms: 30_000 },
                    { label: '1m', ms: 60_000 },
                    { label: '2m', ms: 120_000 },
                    { label: '5m', ms: 300_000 },
                    { label: 'Perm', ms: 0 },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setAnnounceDurationMs(opt.ms)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      announceDurationMs === opt.ms
                        ? 'bg-pink-600 border-pink-500 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void sendAnnounce()}
                disabled={!announceDraft.trim()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold disabled:opacity-40"
              >
                Send announcement
              </button>
              <button
                type="button"
                onClick={() => setShowAnnounceEditor(false)}
                className="w-full py-3 mt-1 text-sm text-zinc-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        
        {/* Personal live view settings */}
        {showLiveSettings && (
          <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/70"
              aria-label="Close"
              onClick={() => setShowLiveSettings(false)}
            />
            <div className="relative w-full sm:max-w-sm bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-4 sm:hidden" />
              <h3 className="text-lg font-semibold text-center mb-1 flex items-center justify-center gap-2">
                <Settings size={18} className="text-pink-400" />
                Live settings
              </h3>
              <p className="text-sm text-zinc-400 text-center mb-5">
                Only affects how you see this live on this device
              </p>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1.5">
                    <Type size={14} /> Chat text size
                  </p>
                  <div className="flex gap-2">
                    {(
                      [
                        { id: 's' as const, label: 'S' },
                        { id: 'm' as const, label: 'M' },
                        { id: 'l' as const, label: 'L' },
                      ]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setChatTextSize(opt.id)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${
                          chatTextSize === opt.id
                            ? 'bg-pink-600 border-pink-500 text-white'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <p className="text-sm font-medium">Tip goal meter</p>
                    <p className="text-xs text-zinc-500">Vertical bar on the left</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGoalMeterHidden((v) => !v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      !goalMeterHidden
                        ? 'bg-pink-600/20 border-pink-500 text-pink-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {!goalMeterHidden ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <p className="text-sm font-medium">Top tipper card</p>
                    <p className="text-xs text-zinc-500">Crown badge top-right</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHideTopTipper((v) => !v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      !hideTopTipper
                        ? 'bg-pink-600/20 border-pink-500 text-pink-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {!hideTopTipper ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <p className="text-sm font-medium">Floating emojis</p>
                    <p className="text-xs text-zinc-500">Reactions on the stream</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHideEmojis((v) => !v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      !hideEmojis
                        ? 'bg-pink-600/20 border-pink-500 text-pink-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {!hideEmojis ? 'On' : 'Off'}
                  </button>
                </div>


                <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                  <div>
                    <p className="text-sm font-medium">Compact chat</p>
                    <p className="text-xs text-zinc-500">Tighter message spacing</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompactChat((v) => !v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      compactChat
                        ? 'bg-pink-600/20 border-pink-500 text-pink-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {compactChat ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowLiveSettings(false)}
                className="w-full mt-6 py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Host multi-level tip goals editor */}
        {showGoalEditor && isOwner && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/70"
              aria-label="Close"
              onClick={() => setShowGoalEditor(false)}
            />
            <div className="relative w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-4 sm:hidden" />
              <h3 className="text-lg font-semibold text-center mb-1">
                Tip goals
              </h3>
              <p className="text-sm text-zinc-400 text-center mb-2">
                Up to 3 levels · amounts are running totals · raised tips never
                reset
              </p>
              <p className="text-xs text-pink-400/90 text-center mb-4 tabular-nums">
                Raised so far: £
                {Number(stream?.tip_raised_gbp || 0).toFixed(2)}
              </p>

              <div className="space-y-3 mb-4">
                {goalDraftLevels.map((row, i) => (
                  <div
                    key={i}
                    className="bg-zinc-800/80 border border-zinc-700 rounded-2xl p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-400">
                        Level {i + 1}
                      </span>
                      {goalDraftLevels.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setGoalDraftLevels((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="text-xs text-zinc-500 hover:text-red-400"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGoalDraftLevels((prev) =>
                          prev.map((r, idx) =>
                            idx === i ? { ...r, label: v } : r
                          )
                        );
                      }}
                      placeholder='Label e.g. "Remove top"'
                      maxLength={40}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500 mb-2"
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                        £
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={row.amount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setGoalDraftLevels((prev) =>
                            prev.map((r, idx) =>
                              idx === i ? { ...r, amount: v } : r
                            )
                          );
                        }}
                        placeholder="Total tips for this level"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {goalDraftLevels.length < 3 && (
                <button
                  type="button"
                  onClick={() =>
                    setGoalDraftLevels((prev) => [
                      ...prev,
                      { label: '', amount: '' },
                    ])
                  }
                  className="w-full py-2.5 mb-4 rounded-xl border border-dashed border-zinc-600 text-sm text-zinc-400 hover:border-pink-500/50 hover:text-pink-300 transition"
                >
                  + Add level
                </button>
              )}

              <button
                type="button"
                disabled={savingGoal}
                onClick={() => void saveTipGoal()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold disabled:opacity-50"
              >
                {savingGoal ? 'Saving…' : 'Save goals'}
              </button>
              <button
                type="button"
                disabled={savingGoal}
                onClick={() => {
                  setGoalDraftLevels([{ label: '', amount: '' }]);
                  void saveTipGoal();
                }}
                className="w-full py-2.5 mt-2 text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              >
                Clear all goals
              </button>
              <button
                type="button"
                onClick={() => setShowGoalEditor(false)}
                className="w-full py-2 text-sm text-zinc-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Host moderate viewer sheet */}
        {modTarget && isOwner && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/70"
              aria-label="Close"
              onClick={() => setModTarget(null)}
            />
            <div className="relative w-full sm:max-w-sm bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl mb-0 sm:mb-0">
              <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-4 sm:hidden" />
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                Moderate viewer
              </p>
              <p className="text-lg font-semibold text-white truncate mb-1">
                {modTarget.name}
              </p>
              <p className="text-sm text-zinc-400 mb-5">
                Applies to this live only. Ban stops them rejoining this stream.
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={modBusy}
                  onClick={() => void moderateUser(modTarget.userId, 'mute')}
                  className="w-full py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-white font-semibold transition disabled:opacity-50"
                >
                  Mute chat
                </button>
                <button
                  type="button"
                  disabled={modBusy}
                  onClick={() => void moderateUser(modTarget.userId, 'ban')}
                  className="w-full py-3.5 rounded-2xl bg-red-600/90 hover:bg-red-600 text-white font-semibold transition disabled:opacity-50"
                >
                  Ban from this live
                </button>
                <button
                  type="button"
                  disabled={modBusy}
                  onClick={() => void moderateUser(modTarget.userId, 'clear')}
                  className="w-full py-3.5 rounded-2xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-medium transition disabled:opacity-50"
                >
                  Clear restriction
                </button>
                <button
                  type="button"
                  onClick={() => setModTarget(null)}
                  className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tip sheet */}
        {showTip && (
          <div className="fixed inset-0 z-[220] bg-black/70 flex items-end sm:items-center justify-center">
            <div
              className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden"
              style={{
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <DollarSign className="text-pink-500" size={20} /> Tip {name}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    if (tipping) return;
                    setShowTip(false);
                    setTipNote('');
                    setTipError('');
                  }}
                  className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {TIP_PRESETS.map((a) => {
                    const minT = creatorMinTip > 2 ? creatorMinTip : 2;
                    const tooLow = a < minT;
                    return (
                      <button
                        key={a}
                        type="button"
                        disabled={tipping || tooLow}
                        onClick={() => {
                          if (tooLow) return;
                          setTipAmount(a);
                          setCustomTip('');
                          setTipError('');
                        }}
                        className={`py-3 rounded-xl text-sm font-semibold border transition ${
                          tooLow
                            ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed'
                            : tipAmount === a && !customTip
                              ? 'bg-pink-600 border-pink-500 text-white'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                        }`}
                        title={
                          tooLow
                            ? `Below this creator's minimum (£${minT})`
                            : undefined
                        }
                      >
                        £{a}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-zinc-500 -mt-1">
                  Minimum tip £{(creatorMinTip > 2 ? creatorMinTip : 2).toFixed(2)}
                </p>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">
                    Custom amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                      £
                    </span>
                    <input
                      type="number"
                      min={creatorMinTip > 2 ? creatorMinTip : 2}
                      step={1}
                      value={customTip}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomTip(v);
                        setTipError('');
                        const n = Number(v);
                        // Do NOT auto-bump to minimum — keep exact typed amount
                        if (v !== '' && Number.isFinite(n)) setTipAmount(n);
                      }}
                      placeholder="Other"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-3 text-sm outline-none focus:border-pink-500"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-zinc-500">
                      Add a note{' '}
                      <span className="text-zinc-600">(optional)</span>
                    </label>
                    <span className="text-[10px] text-zinc-600 tabular-nums">
                      {tipNote.length}/50
                    </span>
                  </div>
                  <input
                    type="text"
                    value={tipNote}
                    maxLength={50}
                    disabled={tipping}
                    onChange={(e) => {
                      setTipNote(e.target.value.slice(0, 50));
                      setTipError('');
                    }}
                    placeholder="e.g. do X · love this · keep going"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500 placeholder:text-zinc-600"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Short message only · no links · visible in live chat
                  </p>
                </div>
                {tipError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {tipError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={(() => {
                    if (tipping) return true;
                    const minT = creatorMinTip > 2 ? creatorMinTip : 2;
                    const amt =
                      customTip !== '' ? Number(customTip) : Number(tipAmount);
                    return !Number.isFinite(amt) || amt < minT;
                  })()}
                  onClick={() => {
                    const minT = creatorMinTip > 2 ? creatorMinTip : 2;
                    const amt =
                      customTip !== '' ? Number(customTip) : Number(tipAmount);
                    if (!Number.isFinite(amt) || amt < minT) {
                      setTipError(
                        `Minimum tip is £${minT.toFixed(2)} — enter at least that amount`
                      );
                      return;
                    }
                    void sendTip(amt);
                  }}
                  className="w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {tipping ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      Send £
                      {(
                        customTip !== '' ? Number(customTip) : Number(tipAmount)
                      ).toFixed(2)}
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Paid from your wallet balance
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Incoming private requests (creator) */}
        
        {/* Fan waiting for private accept */}
        {!isOwner && myPendingPrivate && !stream?.private_active && (
          <div className="fixed inset-x-0 top-14 sm:top-16 z-[205] flex justify-center px-3 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md bg-zinc-900/95 border border-zinc-700 rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3">
              <Loader2 className="animate-spin text-pink-500 flex-shrink-0" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Private requested</p>
                <p className="text-xs text-zinc-400">
                  Waiting for creator · {myPendingPrivate.minutes} min · £
                  {Number(myPendingPrivate.amount_gbp).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        {isOwner && incomingPrivates.length > 0 && !stream?.private_active && (
          <div className="fixed inset-x-0 top-14 sm:top-16 z-[210] flex justify-center px-3 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md space-y-2">
              {incomingPrivates.map((req) => {
                const n =
                  req.profile?.display_name ||
                  (req.profile?.username
                    ? `@${req.profile.username}`
                    : 'Fan');
                const left = privateReqLeft[req.id];
                return (
                  <div
                    key={req.id}
                    className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-pink-950/40 border border-pink-500/50 rounded-2xl p-4 shadow-2xl shadow-pink-900/30 animate-in fade-in slide-in-from-top-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {req.profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={req.profile.avatar_url}
                            alt=""
                            className="w-11 h-11 rounded-full object-cover border-2 border-pink-500/40"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-pink-600/30 flex items-center justify-center text-sm font-bold text-pink-200">
                            {(n || '?')[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-pink-400 flex items-center gap-1.5">
                            <Lock size={12} />
                            Private request
                          </p>
                          <p className="text-sm font-semibold text-white truncate mt-0.5">
                            {n}
                          </p>
                          <p className="text-xs text-zinc-300 mt-0.5">
                            {req.minutes} min ·{' '}
                            <span className="text-pink-300 font-semibold">
                              £{Number(req.amount_gbp).toFixed(2)}
                            </span>
                            {' · '}
                            £{Number(req.rate_per_minute).toFixed(2)}/min
                          </p>
                        </div>
                      </div>
                      {typeof left === 'number' && left > 0 && (
                        <div className="flex-shrink-0 text-center">
                          <p className="text-[10px] text-zinc-500 uppercase">Expires</p>
                          <p className="text-sm font-mono font-bold text-pink-300">
                            {left}s
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3.5">
                      <button
                        type="button"
                        disabled={privateBusy}
                        onClick={() => void respondPrivate(req.id, 'decline')}
                        className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={privateBusy}
                        onClick={() => void respondPrivate(req.id, 'accept')}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 text-sm font-semibold shadow-lg shadow-pink-900/40"
                      >
                        Accept · £{Number(req.amount_gbp).toFixed(2)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Request private sheet */}
        {showPrivate && (
          <div className="fixed inset-0 z-[220] bg-black/70 flex items-end sm:items-center justify-center">
            <div
              className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden"
              style={{
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Lock className="text-pink-500" size={20} /> Request private
                </h3>
                <button
                  type="button"
                  onClick={() => !requestingPrivate && setShowPrivate(false)}
                  className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-5 py-5 space-y-5">
                <p className="text-sm text-zinc-400">
                  Public live pauses for everyone else. Only you and the creator
                  stay connected.
                </p>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-400">Minutes</span>
                    <span className="font-semibold text-white">
                      {privateMinutes} min
                    </span>
                  </div>
                  <input
                    type="range"
                    min={privateMin}
                    max={60}
                    step={1}
                    value={privateMinutes}
                    onChange={(e) => setPrivateMinutes(Number(e.target.value))}
                    className="w-full accent-pink-500"
                  />
                  <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                    <span>{privateMin} min</span>
                    <span>60 min</span>
                  </div>
                </div>
                <div className="bg-zinc-800/80 rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-zinc-500">Rate</p>
                    <p className="font-medium">
                      £{privateRate.toFixed(2)}/min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Total</p>
                    <p className="text-xl font-bold text-pink-400">
                      £{(privateRate * privateMinutes).toFixed(2)}
                    </p>
                  </div>
                </div>
                {privateError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {privateError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={requestingPrivate}
                  onClick={() => void requestPrivate()}
                  className="w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {requestingPrivate ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>Request · £{(privateRate * privateMinutes).toFixed(2)}</>
                  )}
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Charged from wallet only if the creator accepts
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </AuthGuard>
  );
}
