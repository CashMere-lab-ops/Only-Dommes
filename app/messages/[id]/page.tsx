'use client';

import { useEffect, useState, useRef, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Send, ImagePlus, X, DollarSign, Lock, Unlock,
  Check, CheckCheck, Reply, Smile, Mic, Square, Play, Pause, LayoutGrid
} from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import { createClient } from '../../../lib/supabase';
import { createNotification } from '../../../lib/notifications';

const TIP_AMOUNTS = [5, 10, 20, 50];
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👍'];
const MAX_VIDEO_SECONDS = 30;
const MAX_VOICE_SECONDS = 60;
const MAX_FILE_MB = 50;

/* ---------- Stable sub-components (OUTSIDE main page) ---------- */

const VoicePlayer = memo(function VoicePlayer({
  url,
  mine,
}: {
  url: string;
  mine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 min-w-[200px] ${
        mine ? 'bg-pink-600' : 'bg-zinc-800'
      }`}
    >
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          mine ? 'bg-white/20 text-white' : 'bg-pink-600 text-white'
        }`}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1 h-1 rounded-full bg-black/20 overflow-hidden">
        <div
          className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-pink-500'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <Mic size={14} className={mine ? 'text-pink-100' : 'text-zinc-400'} />
    </div>
  );
});

const MediaBlock = memo(function MediaBlock({
  msg,
  locked,
  mine,
  unlockingId,
  onUnlock,
  onOpenViewer,
}: {
  msg: any;
  locked: boolean;
  mine: boolean;
  unlockingId: string | null;
  onUnlock: (msg: any) => void;
  onOpenViewer: (url: string, type: 'image' | 'video') => void;
}) {
  if (!msg.media_url) return null;
  const isVideo = msg.media_type === 'video';
  const isImage = msg.media_type === 'image';
  const isAudio = msg.media_type === 'audio';

  if (isAudio) return <VoicePlayer url={msg.media_url} mine={mine} />;
  if (!isVideo && !isImage) return null;

  if (locked) {
    return (
      <div className="relative w-full min-w-[260px] aspect-video bg-zinc-900 overflow-hidden">
        {isImage ? (
          <img
            src={msg.media_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110"
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-800" />
        )}
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 text-center">
          <Lock size={28} className="text-white mb-2" />
          <p className="text-white text-sm font-medium mb-3">
            Locked · £{Number(msg.unlock_price || 0).toFixed(2)}
          </p>
          <button
            type="button"
            onClick={() => onUnlock(msg)}
            disabled={unlockingId === msg.id}
            className="bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-full flex items-center gap-2"
          >
            <Unlock size={16} />
            {unlockingId === msg.id ? 'Unlocking...' : 'Unlock'}
          </button>
        </div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="relative bg-black min-w-[260px]">
        <video
          src={msg.media_url}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-[360px]"
        />
        {msg.is_locked && mine && (
          <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
            <Lock size={10} /> £{Number(msg.unlock_price || 0).toFixed(2)}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenViewer(msg.media_url, 'image')}
      className="block w-full relative min-w-[200px]"
    >
      <img src={msg.media_url} alt="" className="w-full max-h-[320px] object-cover" />
      {msg.is_locked && mine && (
        <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
          <Lock size={10} /> £{Number(msg.unlock_price || 0).toFixed(2)}
        </span>
      )}
    </button>
  );
});

/* ---------- Main page ---------- */

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const conversationId = params.id as string;

  const [messages, setMessages] = useState<any[]>([]);
  const [reactions, setReactions] = useState<Record<string, any[]>>({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video' | null>(null);
  const [viewer, setViewer] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [lockPhoto, setLockPhoto] = useState(false);
  const [lockPrice, setLockPrice] = useState('5');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [myUnlocks, setMyUnlocks] = useState<Set<string>>(new Set());
  const [showTip, setShowTip] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(10);
  const [customTip, setCustomTip] = useState('');
  const [tipping, setTipping] = useState(false);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [unlockingChat, setUnlockingChat] = useState(false);
  const [messagePrice, setMessagePrice] = useState(0);
  const [autoReplySent, setAutoReplySent] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceSecs, setVoiceSecs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);
  const userIdRef = useRef<string | null>(null);

  const actorName = () =>
    myProfile?.display_name || myProfile?.username || 'Someone';

  const scrollBottom = () => {
    requestAnimationFrame(() => {
      if (mobileRef.current) mobileRef.current.scrollTop = mobileRef.current.scrollHeight;
      if (desktopRef.current) desktopRef.current.scrollTop = desktopRef.current.scrollHeight;
    });
  };

  const formatLastSeen = (dateString?: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 90) return 'Online';
    if (diff < 3600) return `Active ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `Active ${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `Active ${Math.floor(diff / 86400)}d ago`;
    return `Active ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const markAsRead = async (uid: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('messages')
      .update({ is_read: true, read_at: now })
      .eq('conversation_id', conversationId)
      .neq('sender_id', uid)
      .eq('is_read', false);
  };

  const bumpLastSeen = async (uid: string) => {
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', uid);
  };

  const loadReactions = async (messageIds: string[]) => {
    if (messageIds.length === 0) return;
    const { data } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds);
    const map: Record<string, any[]> = {};
    (data || []).forEach((r) => {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push(r);
    });
    setReactions(map);
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      if (!alive) return;

      setUserId(user.id);
      userIdRef.current = user.id;
      await bumpLastSeen(user.id);

      const { data: me } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, account_type')
        .eq('id', user.id)
        .single();
      setMyProfile(me);

      const { data: convo } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (!convo) {
        router.push('/messages');
        return;
      }
      if (convo.participant_1 !== user.id && convo.participant_2 !== user.id) {
        router.push('/messages');
        return;
      }

      setAutoReplySent(!!convo.auto_reply_sent);

      const otherId =
        convo.participant_1 === user.id ? convo.participant_2 : convo.participant_1;
      setOtherUserId(otherId);

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'username, display_name, avatar_url, last_seen_at, account_type, message_price, auto_reply_enabled, auto_reply_message'
        )
        .eq('id', otherId)
        .single();

      const price = Number(profile?.message_price || 0);
      setMessagePrice(price);

      let locked = false;
      if (
        me?.account_type !== 'creator' &&
        profile?.account_type === 'creator' &&
        price > 0
      ) {
        const { data: access } = await supabase
          .from('message_access')
          .select('id')
          .eq('creator_id', otherId)
          .eq('fan_id', user.id)
          .maybeSingle();
        locked = !access;
      }
      setNeedsUnlock(locked);

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      const { data: unlocks } = await supabase
        .from('message_unlocks')
        .select('message_id')
        .eq('user_id', user.id);

      if (!alive) return;

      setOtherUser(profile);
      setMessages(msgs || []);
      setMyUnlocks(new Set((unlocks || []).map((u) => u.message_id)));
      setLoading(false);

      if (msgs && msgs.length > 0) {
        await loadReactions(msgs.map((m) => m.id));
      }

      await markAsRead(user.id);
      setTimeout(scrollBottom, 200);
    };

    load();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => bumpLastSeen(userId), 30000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (!otherUserId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('last_seen_at, auto_reply_enabled, auto_reply_message')
        .eq('id', otherUserId)
        .single();
      if (data) {
        setOtherUser((prev: any) => (prev ? { ...prev, ...data } : prev));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [otherUserId]);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase.channel(`room-${conversationId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setTimeout(scrollBottom, 80);
          if (payload.new.sender_id !== userIdRef.current) {
            await markAsRead(userIdRef.current!);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
          );
        }
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId !== userIdRef.current) {
          setIsOtherTyping(!!payload?.isTyping);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  useEffect(() => {
    return () => {
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const notifyTyping = (on: boolean) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping: on },
    });
  };

  const onType = (value: string) => {
    if (needsUnlock) return;
    setText(value);
    notifyTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => notifyTyping(false), 3000);
  };

  const unlockChat = async () => {
    if (!userId || !otherUserId || unlockingChat) return;
    setUnlockingChat(true);
    try {
      const { error } = await supabase.from('message_access').insert({
        creator_id: otherUserId,
        fan_id: userId,
        amount: messagePrice,
      });
      if (error) throw error;
      await createNotification({
        userId: otherUserId,
        actorId: userId,
        type: 'tip',
        title: `${actorName()} unlocked messaging`,
        body: `£${Number(messagePrice).toFixed(2)}`,
        link: `/messages/${conversationId}`,
      });
      setNeedsUnlock(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Could not unlock messaging');
    } finally {
      setUnlockingChat(false);
    }
  };

  const maybeSendAutoReply = async () => {
    if (!otherUserId || !userId) return;
    if (autoReplySent) return;
    if (!otherUser?.auto_reply_enabled) return;
    if (!otherUser?.auto_reply_message?.trim()) return;

    const lastSeen = otherUser.last_seen_at
      ? new Date(otherUser.last_seen_at).getTime()
      : 0;
    if (Date.now() - lastSeen <= 5 * 60 * 1000) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: otherUserId,
          content: otherUser.auto_reply_message.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }
      await supabase
        .from('conversations')
        .update({ auto_reply_sent: true, last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
      setAutoReplySent(true);
      setTimeout(scrollBottom, 80);
    } catch (err) {
      console.error('Auto-reply failed', err);
    }
  };

  const clearMedia = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setPreviewType(null);
    setLockPhoto(false);
    setLockPrice('5');
    if (fileRef.current) fileRef.current.value = '';
  };

  const clearVoice = () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceBlob(null);
    setVoiceUrl(null);
    setVoiceSecs(0);
    setRecordSecs(0);
  };

  const startRecording = async () => {
    if (needsUnlock) return;
    try {
      clearMedia();
      clearVoice();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        setVoiceBlob(blob);
        setVoiceUrl(URL.createObjectURL(blob));
        setVoiceSecs(recordSecs);
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSecs((s) => {
          if (s + 1 >= MAX_VOICE_SECONDS) {
            stopRecording();
            return MAX_VOICE_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      alert('Microphone access is needed for voice notes');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  };

  const pickMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (needsUnlock) return;
    const f = e.target.files?.[0];
    if (!f) return;
    clearVoice();
    const isImage = f.type.startsWith('image/');
    const isVideo = f.type.startsWith('video/');
    if (!isImage && !isVideo) {
      alert('Please choose a photo or video');
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`Max ${MAX_FILE_MB}MB`);
      return;
    }
    if (isVideo) {
      const url = URL.createObjectURL(f);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(url);
        if (video.duration > MAX_VIDEO_SECONDS) {
          alert(`Videos must be ${MAX_VIDEO_SECONDS} seconds or less`);
          if (fileRef.current) fileRef.current.value = '';
          return;
        }
        if (preview) URL.revokeObjectURL(preview);
        setFile(f);
        setPreview(URL.createObjectURL(f));
        setPreviewType('video');
      };
      video.onerror = () => {
        alert('Could not read this video');
        if (fileRef.current) fileRef.current.value = '';
      };
      video.src = url;
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPreviewType('image');
  };

  const send = async () => {
    if (needsUnlock) {
      alert('Unlock messaging first');
      return;
    }
    if (sending || !userId) return;
    if (!text.trim() && !file && !voiceBlob) return;

    setSending(true);
    const messageText = text.trim();
    const mediaFile = file;
    const mediaKind = previewType;
    const shouldLock = lockPhoto && !!mediaFile;
    const price = shouldLock ? parseFloat(lockPrice) || 5 : null;
    const replyId = replyTo?.id || null;
    const audioBlob = voiceBlob;
    const audioDuration = voiceSecs;

    setText('');
    clearMedia();
    clearVoice();
    setReplyTo(null);
    notifyTyping(false);

    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (audioBlob) {
        const ext = audioBlob.type.includes('webm') ? 'webm' : 'mp4';
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upError } = await supabase.storage
          .from('chat-media')
          .upload(path, audioBlob, { contentType: audioBlob.type });
        if (upError) throw upError;
        const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
        mediaUrl = data.publicUrl;
        mediaType = 'audio';
      } else if (mediaFile && mediaKind) {
        const ext =
          mediaFile.name.split('.').pop() || (mediaKind === 'video' ? 'mp4' : 'jpg');
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upError } = await supabase.storage
          .from('chat-media')
          .upload(path, mediaFile, { contentType: mediaFile.type });
        if (upError) throw upError;
        const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
        mediaUrl = data.publicUrl;
        mediaType = mediaKind;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content:
            messageText ||
            (mediaType === 'audio'
              ? `🎤 Voice note (${formatDuration(audioDuration)})`
              : ''),
          media_url: mediaUrl,
          media_type: mediaType,
          is_locked: shouldLock,
          unlock_price: price,
          reply_to_id: replyId,
        })
        .select()
        .single();
      if (error) throw error;

      if (data) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (otherUserId) {
        const previewText = messageText
          ? messageText.slice(0, 80)
          : mediaType === 'audio'
          ? 'Sent a voice note'
          : mediaType === 'video'
          ? 'Sent a video'
          : mediaType === 'image'
          ? 'Sent a photo'
          : 'Sent a message';
        await createNotification({
          userId: otherUserId,
          actorId: userId,
          type: 'message',
          title: `${actorName()} sent you a message`,
          body: previewText,
          link: `/messages/${conversationId}`,
        });
      }

      if (myProfile?.account_type !== 'creator') {
        await maybeSendAutoReply();
      }

      setTimeout(scrollBottom, 80);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to send');
      setText(messageText);
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!userId) return;
    const existing = (reactions[messageId] || []).find(
      (r) => r.user_id === userId && r.emoji === emoji
    );
    try {
      if (existing) {
        await supabase.from('message_reactions').delete().eq('id', existing.id);
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter((r) => r.id !== existing.id),
        }));
      } else {
        const { data, error } = await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: userId, emoji })
          .select()
          .single();
        if (error) throw error;
        setReactions((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), data],
        }));
      }
    } catch (err) {
      console.error(err);
    }
    setReactFor(null);
  };

  const unlockMessage = async (msg: any) => {
    if (!userId || unlockingId) return;
    setUnlockingId(msg.id);
    try {
      const amount = msg.unlock_price || 0;
      const { error } = await supabase.from('message_unlocks').insert({
        message_id: msg.id,
        user_id: userId,
        amount,
      });
      if (error) throw error;
      setMyUnlocks((prev) => new Set(prev).add(msg.id));
      if (msg.sender_id && msg.sender_id !== userId) {
        await createNotification({
          userId: msg.sender_id,
          actorId: userId,
          type: 'unlock',
          title: `${actorName()} unlocked your ${
            msg.media_type === 'video' ? 'video' : 'photo'
          }`,
          body: `£${Number(amount).toFixed(2)}`,
          link: `/messages/${conversationId}`,
        });
      }
    } catch (err: any) {
      alert(err.message || 'Unlock failed');
    } finally {
      setUnlockingId(null);
    }
  };

  const canSeeMedia = (msg: any) => {
    if (!msg.is_locked) return true;
    if (msg.sender_id === userId) return true;
    return myUnlocks.has(msg.id);
  };

  const sendTip = async () => {
    if (!userId || !otherUserId || tipping) return;
    const amount = customTip ? parseFloat(customTip) : tipAmount;
    if (!amount || amount <= 0) {
      alert('Enter a valid tip amount');
      return;
    }
    setTipping(true);
    try {
      await supabase.from('tips').insert({
        from_user_id: userId,
        to_user_id: otherUserId,
        amount,
        conversation_id: conversationId,
        message: 'Tip in chat',
      });
      const { data } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: `💸 tipped £${amount.toFixed(2)}`,
          media_type: 'tip',
        })
        .select()
        .single();
      if (data) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
      await createNotification({
        userId: otherUserId,
        actorId: userId,
        type: 'tip',
        title: `${actorName()} tipped you £${amount.toFixed(2)}`,
        body: null,
        link: `/messages/${conversationId}`,
      });
      setShowTip(false);
      setCustomTip('');
      setTipAmount(10);
      setTimeout(scrollBottom, 80);
    } catch (err: any) {
      alert(err.message || 'Tip failed');
    } finally {
      setTipping(false);
    }
  };

  const time = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const statusLine = () => {
    if (isOtherTyping) return 'typing...';
    return formatLastSeen(otherUser?.last_seen_at) || `@${otherUser?.username}`;
  };

  const mediaLabel = (m: any) => {
    if (m?.media_type === 'audio') return '🎤 Voice note';
    if (m?.media_type === 'video') return '🎬 Video';
    if (m?.media_type === 'image') return '📷 Photo';
    return m?.content || 'Message';
  };

  const groupedReactions = (messageId: string) => {
    const list = reactions[messageId] || [];
    const map: Record<string, { count: number; mine: boolean }> = {};
    list.forEach((r) => {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false };
      map[r.emoji].count += 1;
      if (r.user_id === userId) map[r.emoji].mine = true;
    });
    return Object.entries(map);
  };

  const galleryItems = messages.filter(
    (m) =>
      (m.media_type === 'image' || m.media_type === 'video') &&
      m.media_url &&
      canSeeMedia(m)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading chat...</p>
      </div>
    );
  }

  const displayName = otherUser?.display_name || otherUser?.username || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const isOnline = formatLastSeen(otherUser?.last_seen_at) === 'Online';
  const canSend = !needsUnlock && !sending && (!!text.trim() || !!file || !!voiceBlob);

  /* ---- render one message (inline, not a nested component) ---- */
  const renderMessage = (msg: any) => {
    const mine = msg.sender_id === userId;
    const isTip = msg.media_type === 'tip' || (msg.content || '').includes('💸 tipped');
    const isAudio = msg.media_type === 'audio';
    const locked = msg.is_locked && !canSeeMedia(msg);
    const replied = msg.reply_to_id
      ? messages.find((m) => m.id === msg.reply_to_id)
      : null;
    const reacts = groupedReactions(msg.id);
    const showReactPicker = reactFor === msg.id;

    return (
      <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
        <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
          {showReactPicker && (
            <div
              className={`flex gap-1 mb-1.5 p-1.5 bg-zinc-900 border border-zinc-700 rounded-full shadow-lg ${
                mine ? 'self-end' : 'self-start'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleReaction(msg.id, emoji);
                  }}
                  className="w-8 h-8 rounded-full hover:bg-zinc-800 text-lg flex items-center justify-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div
            className={`rounded-2xl overflow-hidden ${
              mine ? 'rounded-br-md' : 'rounded-bl-md'
            } ${isTip ? 'bg-gradient-to-r from-pink-600 to-rose-500' : ''}`}
          >
            {replied && (
              <div
                className={`px-3 pt-2 pb-1 text-xs border-b ${
                  mine
                    ? 'bg-pink-700/40 border-pink-500/30 text-pink-100'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                }`}
              >
                <p className="font-medium opacity-80">
                  {replied.sender_id === userId ? 'You' : otherUser?.display_name || 'Them'}
                </p>
                <p className="truncate">{mediaLabel(replied)}</p>
              </div>
            )}

            <MediaBlock
              msg={msg}
              locked={locked}
              mine={mine}
              unlockingId={unlockingId}
              onUnlock={unlockMessage}
              onOpenViewer={(url, type) => setViewer({ url, type })}
            />

            {!isAudio && (
              <div className={`px-3.5 py-2 ${isTip ? '' : mine ? 'bg-pink-600' : 'bg-zinc-800'}`}>
                {!!msg.content && (
                  <p className={`text-[15px] whitespace-pre-wrap break-words ${isTip ? 'font-medium' : ''}`}>
                    {msg.content}
                  </p>
                )}
                <p
                  className={`text-[10px] ${msg.content ? 'mt-1' : ''} ${
                    mine || isTip ? 'text-pink-200/80' : 'text-zinc-500'
                  }`}
                >
                  {time(msg.created_at)}
                  {mine &&
                    (msg.is_read || msg.read_at ? (
                      <CheckCheck size={12} className="inline ml-1 text-pink-200" />
                    ) : (
                      <Check size={12} className="inline ml-1 text-pink-200/70" />
                    ))}
                </p>
              </div>
            )}

            {isAudio && (
              <div className={`px-3 pb-2 ${mine ? 'bg-pink-600' : 'bg-zinc-800'}`}>
                <p className={`text-[10px] ${mine ? 'text-pink-200/80' : 'text-zinc-500'}`}>
                  {time(msg.created_at)}
                  {mine &&
                    (msg.is_read || msg.read_at ? (
                      <CheckCheck size={12} className="inline ml-1 text-pink-200" />
                    ) : (
                      <Check size={12} className="inline ml-1 text-pink-200/70" />
                    ))}
                </p>
              </div>
            )}
          </div>

          {reacts.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
              {reacts.map(([emoji, info]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleReaction(msg.id, emoji);
                  }}
                  className={`text-xs px-1.5 py-0.5 rounded-full border ${
                    info.mine
                      ? 'bg-pink-600/20 border-pink-500/50'
                      : 'bg-zinc-900 border-zinc-700'
                  }`}
                >
                  {emoji} {info.count > 1 ? info.count : ''}
                </button>
              ))}
            </div>
          )}

          <div
            className={`flex items-center gap-1 mt-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition ${
              mine ? 'justify-end' : 'justify-start'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setReplyTo(msg);
                setReactFor(null);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="p-1.5 rounded-full text-zinc-500 hover:text-pink-400 hover:bg-zinc-800"
            >
              <Reply size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setReactFor(showReactPicker ? null : msg.id);
              }}
              className="p-1.5 rounded-full text-zinc-500 hover:text-pink-400 hover:bg-zinc-800"
            >
              <Smile size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ---- composer UI (inline — not a nested component) ---- */
  const composerUI = (
    <div>
      {needsUnlock && (
        <div className="mb-3 p-4 bg-zinc-900 border border-pink-500/40 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-pink-600/20 text-pink-400 flex items-center justify-center flex-shrink-0">
              <Lock size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Messaging is locked</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Pay £{Number(messagePrice).toFixed(2)} once to unlock unlimited messages with{' '}
                {otherUser?.display_name || otherUser?.username || 'this creator'}.
              </p>
              <button
                type="button"
                onClick={unlockChat}
                disabled={unlockingChat}
                className="mt-3 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-full"
              >
                {unlockingChat
                  ? 'Unlocking...'
                  : `Unlock for £${Number(messagePrice).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {!needsUnlock && replyTo && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Reply size={14} className="text-pink-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-pink-400 font-medium">
              Replying to{' '}
              {replyTo.sender_id === userId ? 'yourself' : otherUser?.display_name || 'them'}
            </p>
            <p className="text-xs text-zinc-400 truncate">{mediaLabel(replyTo)}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-500">
            <X size={16} />
          </button>
        </div>
      )}

      {!needsUnlock && recording && (
        <div className="mb-2 flex items-center gap-3 px-3 py-2 bg-red-950/40 border border-red-900/50 rounded-xl">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <p className="text-sm text-red-300 flex-1">Recording… {formatDuration(recordSecs)}</p>
          <button
            type="button"
            onClick={stopRecording}
            className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </div>
      )}

      {!needsUnlock && voiceUrl && !recording && (
        <div className="mb-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-pink-600/20 text-pink-400 flex items-center justify-center">
            <Mic size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Voice note ready</p>
            <p className="text-xs text-zinc-400">{formatDuration(voiceSecs)}</p>
            <audio src={voiceUrl} controls className="w-full mt-1 h-8" />
          </div>
          <button type="button" onClick={clearVoice} className="text-zinc-400 p-1">
            <X size={18} />
          </button>
        </div>
      )}

      {!needsUnlock && preview && (
        <div className="mb-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="relative flex-shrink-0">
              {previewType === 'video' ? (
                <video
                  src={preview}
                  className="h-16 w-16 object-cover rounded-xl border border-zinc-700"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={preview}
                  alt=""
                  className="h-16 w-16 object-cover rounded-xl border border-zinc-700"
                />
              )}
              <button
                type="button"
                onClick={clearMedia}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-xs text-zinc-400">
                {previewType === 'video' ? 'Video ready (max 30s)' : 'Photo ready'}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setLockPhoto(!lockPhoto)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium ${
                    lockPhoto
                      ? 'bg-pink-600 border-pink-500 text-white'
                      : 'bg-zinc-800 border-zinc-600 text-zinc-300'
                  }`}
                >
                  <Lock size={12} />
                  {lockPhoto ? 'Locked' : 'Lock'}
                </button>
                {lockPhoto && (
                  <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-600 rounded-full px-2 py-1">
                    <span className="text-xs text-zinc-400">£</span>
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      value={lockPrice}
                      onChange={(e) => setLockPrice(e.target.value)}
                      className="w-14 bg-transparent text-sm outline-none text-white"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={recording || needsUnlock}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-pink-400 hover:border-pink-500 flex items-center justify-center disabled:opacity-40"
        >
          <ImagePlus size={20} />
        </button>

        {!recording && !voiceBlob && !needsUnlock && (
          <button
            type="button"
            onClick={startRecording}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-pink-400 hover:border-pink-500 flex items-center justify-center"
          >
            <Mic size={20} />
          </button>
        )}

        <input
          ref={inputRef}
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder={needsUnlock ? 'Unlock to message...' : 'Message...'}
          disabled={recording || needsUnlock}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 lg:py-3 lg:text-sm outline-none focus:border-pink-500 disabled:opacity-50"
          style={{ fontSize: 16 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
        />

        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-pink-600 hover:bg-pink-700 disabled:opacity-40 flex items-center justify-center"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={pickMedia}
      />

      {showGallery && (
        <div className="fixed inset-0 z-[95] bg-zinc-950 flex flex-col">
          <div className="border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <button type="button" onClick={() => setShowGallery(false)} className="text-zinc-400 p-1">
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <p className="font-semibold">Media</p>
              <p className="text-xs text-zinc-400">{galleryItems.length} items</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {galleryItems.length === 0 ? (
              <div className="text-center text-zinc-500 py-20">
                <LayoutGrid size={40} className="mx-auto mb-3 opacity-40" />
                <p>No photos or videos yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-w-3xl mx-auto">
                {galleryItems
                  .slice()
                  .reverse()
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setViewer({
                          url: m.media_url,
                          type: m.media_type === 'video' ? 'video' : 'image',
                        })
                      }
                      className="relative aspect-square bg-zinc-900 rounded-lg overflow-hidden"
                    >
                      {m.media_type === 'video' ? (
                        <>
                          <video
                            src={m.media_url}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                            Video
                          </span>
                        </>
                      ) : (
                        <img src={m.media_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {viewer && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-3"
          onClick={() => setViewer(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center"
            onClick={() => setViewer(null)}
          >
            <X size={20} />
          </button>
          {viewer.type === 'video' ? (
            <video
              src={viewer.url}
              controls
              playsInline
              preload="metadata"
              className="max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={viewer.url}
              alt=""
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      {showTip && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Send a tip</h3>
              <button type="button" onClick={() => setShowTip(false)} className="text-zinc-400">
                <X size={22} />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">Tip {displayName}</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {TIP_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setTipAmount(amt);
                    setCustomTip('');
                  }}
                  className={`py-3 rounded-xl text-sm font-semibold ${
                    tipAmount === amt && !customTip
                      ? 'bg-pink-600 text-white'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  £{amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="Custom amount"
              value={customTip}
              onChange={(e) => {
                setCustomTip(e.target.value);
                setTipAmount(null);
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 mb-4 outline-none focus:border-pink-500"
            />
            <button
              type="button"
              onClick={sendTip}
              disabled={tipping}
              className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 py-3.5 rounded-xl font-semibold"
            >
              {tipping
                ? 'Sending...'
                : `Send £${(customTip ? parseFloat(customTip) || 0 : tipAmount || 0).toFixed(2)} tip`}
            </button>
          </div>
        </div>
      )}

      {/* MOBILE */}
      <div className="lg:hidden fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        <div className="border-b border-zinc-800 px-3 py-3 flex items-center gap-3">
          <button type="button" onClick={() => router.push('/messages')} className="text-zinc-400 p-1">
            <ArrowLeft size={24} />
          </button>
          <Link href={`/${otherUser?.username}`} className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center font-bold">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              {isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-950" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{displayName}</p>
              <p
                className={`text-xs truncate ${
                  isOtherTyping ? 'text-pink-400' : isOnline ? 'text-green-400' : 'text-zinc-400'
                }`}
              >
                {statusLine()}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setShowGallery(true)}
            className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 flex items-center justify-center"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowTip(true)}
            className="w-9 h-9 rounded-full bg-pink-600/20 border border-pink-500/40 text-pink-400 flex items-center justify-center"
          >
            <DollarSign size={18} />
          </button>
        </div>

        <div
          ref={mobileRef}
          className="flex-1 overflow-y-auto px-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
          onClick={() => setReactFor(null)}
        >
          <div className="min-h-full flex flex-col justify-end py-3 space-y-3">
            {messages.length === 0 && !needsUnlock && (
              <div className="text-center text-zinc-500 py-16">
                <p>No messages yet</p>
                <p className="text-sm mt-1">Say hello 👋</p>
              </div>
            )}
            {messages.map(renderMessage)}
            {isOtherTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                  <span
                    className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="border-t border-zinc-800 px-3 py-2"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          {composerUI}
        </div>
      </div>

      {/* DESKTOP */}
      <main className="hidden lg:flex flex-1 flex-col h-screen">
        <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
          <Link href="/messages" className="text-zinc-400 hover:text-white">
            <ArrowLeft size={22} />
          </Link>
          <Link href={`/${otherUser?.username}`} className="flex items-center gap-3 flex-1">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center font-bold">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              {isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-950" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">{displayName}</p>
              <p
                className={`text-xs ${
                  isOtherTyping ? 'text-pink-400' : isOnline ? 'text-green-400' : 'text-zinc-400'
                }`}
              >
                {statusLine()}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setShowGallery(true)}
            className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-pink-400 hover:border-pink-500 flex items-center justify-center"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowTip(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-600/20 border border-pink-500/40 text-pink-400 hover:bg-pink-600/30 text-sm font-medium"
          >
            <DollarSign size={16} />
            Tip
          </button>
        </div>

        <div
          ref={desktopRef}
          className="flex-1 overflow-y-auto px-6 max-w-3xl w-full mx-auto"
          onClick={() => setReactFor(null)}
        >
          <div className="min-h-full flex flex-col justify-end py-3 space-y-3">
            {messages.length === 0 && !needsUnlock && (
              <div className="text-center text-zinc-500 py-16">
                <p>No messages yet</p>
                <p className="text-sm mt-1">Say hello 👋</p>
              </div>
            )}
            {messages.map(renderMessage)}
            {isOtherTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                  <span
                    className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-3xl w-full mx-auto border-t border-zinc-800 px-6 py-4">
          {composerUI}
        </div>
      </main>
    </div>
  );
}