'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, ImagePlus, X, DollarSign, Lock, Unlock, Check, CheckCheck } from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import { createClient } from '../../../lib/supabase';
import { createNotification } from '../../../lib/notifications';

const TIP_AMOUNTS = [5, 10, 20, 50];

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const conversationId = params.id as string;

  const [messages, setMessages] = useState<any[]>([]);
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
  const [viewer, setViewer] = useState<string | null>(null);
  const [lockPhoto, setLockPhoto] = useState(false);
  const [lockPrice, setLockPrice] = useState('5');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [myUnlocks, setMyUnlocks] = useState<Set<string>>(new Set());
  const [showTip, setShowTip] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(10);
  const [customTip, setCustomTip] = useState('');
  const [tipping, setTipping] = useState(false);

  const mobileRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);

  const actorName = () =>
    myProfile?.display_name || myProfile?.username || 'Someone';

  const scrollBottom = () => {
    if (mobileRef.current) mobileRef.current.scrollTop = mobileRef.current.scrollHeight;
    if (desktopRef.current) desktopRef.current.scrollTop = desktopRef.current.scrollHeight;
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

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      if (!alive) return;

      setUserId(user.id);
      await bumpLastSeen(user.id);

      const { data: me } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
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

      const otherId =
        convo.participant_1 === user.id
          ? convo.participant_2
          : convo.participant_1;

      setOtherUserId(otherId);

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, last_seen_at')
        .eq('id', otherId)
        .single();

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

      await markAsRead(user.id);
      setTimeout(scrollBottom, 150);
    };

    load();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // Keep last_seen fresh while in chat
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => bumpLastSeen(userId), 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Refresh other user's last_seen every 20s
  useEffect(() => {
    if (!otherUserId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('last_seen_at')
        .eq('id', otherUserId)
        .single();
      if (data) {
        setOtherUser((prev: any) => (prev ? { ...prev, last_seen_at: data.last_seen_at } : prev));
      }
    }, 20000);
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
          setTimeout(scrollBottom, 50);

          // If the other person just sent a message, mark it read
          if (payload.new.sender_id !== userId) {
            await markAsRead(userId);
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
        if (payload?.userId !== userId) {
          setIsOtherTyping(!!payload?.isTyping);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  const notifyTyping = (on: boolean) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping: on },
    });
  };

  const onType = (value: string) => {
    setText(value);
    notifyTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => notifyTyping(false), 3000);
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      alert('Please choose an image');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      alert('Max 10MB');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setLockPhoto(false);
    setLockPrice('5');
    if (fileRef.current) fileRef.current.value = '';
  };

  const send = async () => {
    if (sending || !userId) return;
    if (!text.trim() && !file) return;

    setSending(true);
    const messageText = text.trim();
    const imageFile = file;
    const shouldLock = lockPhoto && !!imageFile;
    const price = shouldLock ? parseFloat(lockPrice) || 5 : null;

    setText('');
    clearImage();
    notifyTyping(false);

    try {
      let mediaUrl: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split('.').pop() || 'jpg';
        const path = `${userId}/${Date.now()}.${ext}`;

        const { error: upError } = await supabase.storage
          .from('chat-media')
          .upload(path, imageFile, { contentType: imageFile.type });

        if (upError) throw upError;

        const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
        mediaUrl = data.publicUrl;
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: messageText,
          media_url: mediaUrl,
          media_type: mediaUrl ? 'image' : null,
          is_locked: shouldLock,
          unlock_price: price,
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
          : mediaUrl
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
          title: `${actorName()} unlocked your photo`,
          body: `£${Number(amount).toFixed(2)}`,
          link: `/messages/${conversationId}`,
        });
      }
    } catch (err: any) {
      console.error(err);
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
      const { error: tipError } = await supabase.from('tips').insert({
        from_user_id: userId,
        to_user_id: otherUserId,
        amount,
        conversation_id: conversationId,
        message: 'Tip in chat',
      });

      if (tipError) throw tipError;

      const { data, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: `💸 tipped £${amount.toFixed(2)}`,
          media_type: 'tip',
        })
        .select()
        .single();

      if (msgError) throw msgError;

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
      console.error(err);
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

  const ReadTicks = ({ msg }: { msg: any }) => {
    if (msg.sender_id !== userId) return null;
    const read = msg.is_read || msg.read_at;
    return read ? (
      <CheckCheck size={12} className="inline ml-1 text-pink-200" />
    ) : (
      <Check size={12} className="inline ml-1 text-pink-200/70" />
    );
  };

  const PhotoPreviewBox = () => (
    <div className="mb-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={preview!}
            alt=""
            className="h-16 w-16 object-cover rounded-xl border border-zinc-700"
          />
          <button
            type="button"
            onClick={clearImage}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs text-zinc-400">Photo ready to send</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setLockPhoto(!lockPhoto)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                lockPhoto
                  ? 'bg-pink-600 border-pink-500 text-white'
                  : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-pink-500 hover:text-pink-400'
              }`}
            >
              <Lock size={12} />
              {lockPhoto ? 'Locked' : 'Lock photo'}
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />

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
          <img
            src={viewer}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
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
                  className={`py-3 rounded-xl text-sm font-semibold transition ${
                    tipAmount === amt && !customTip
                      ? 'bg-pink-600 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
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
              className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 py-3.5 rounded-xl font-semibold transition"
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
              <p className={`text-xs truncate ${isOtherTyping ? 'text-pink-400' : isOnline ? 'text-green-400' : 'text-zinc-400'}`}>
                {statusLine()}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setShowTip(true)}
            className="w-9 h-9 rounded-full bg-pink-600/20 border border-pink-500/40 text-pink-400 flex items-center justify-center flex-shrink-0"
          >
            <DollarSign size={18} />
          </button>
        </div>

        <div
          ref={mobileRef}
          className="flex-1 overflow-y-scroll px-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="min-h-full flex flex-col justify-end py-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-zinc-500 py-16">
                <p>No messages yet</p>
                <p className="text-sm mt-1">Say hello 👋</p>
              </div>
            )}

            {messages.map((msg) => {
              const mine = msg.sender_id === userId;
              const isTip = msg.media_type === 'tip' || (msg.content || '').includes('💸 tipped');
              const locked = msg.is_locked && !canSeeMedia(msg);

              return (
                <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl overflow-hidden ${
                      mine ? 'rounded-br-md' : 'rounded-bl-md'
                    } ${isTip ? 'bg-gradient-to-r from-pink-600 to-rose-500' : ''}`}
                  >
                    {msg.media_url && msg.media_type === 'image' && (
                      locked ? (
                        <div className="relative">
                          <img
                            src={msg.media_url}
                            alt=""
                            className="w-full max-h-[280px] object-cover blur-xl scale-110"
                          />
                          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-4">
                            <Lock size={28} className="text-white mb-2" />
                            <p className="text-white text-sm font-medium mb-3">
                              Locked · £{Number(msg.unlock_price || 0).toFixed(2)}
                            </p>
                            <button
                              type="button"
                              onClick={() => unlockMessage(msg)}
                              disabled={unlockingId === msg.id}
                              className="bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2"
                            >
                              <Unlock size={16} />
                              {unlockingId === msg.id ? 'Unlocking...' : 'Unlock'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setViewer(msg.media_url)}
                          className="block w-full relative"
                        >
                          <img
                            src={msg.media_url}
                            alt=""
                            className="w-full max-h-[320px] object-cover"
                          />
                          {msg.is_locked && mine && (
                            <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                              <Lock size={10} /> £{Number(msg.unlock_price || 0).toFixed(2)}
                            </span>
                          )}
                        </button>
                      )
                    )}

                    <div className={`px-3.5 py-2 ${isTip ? '' : mine ? 'bg-pink-600' : 'bg-zinc-800'}`}>
                      {!!msg.content && (
                        <p className={`text-[15px] whitespace-pre-wrap break-words ${isTip ? 'font-medium' : ''}`}>
                          {msg.content}
                        </p>
                      )}
                      <p className={`text-[10px] ${msg.content ? 'mt-1' : ''} ${mine || isTip ? 'text-pink-200/80' : 'text-zinc-500'}`}>
                        {time(msg.created_at)}
                        {mine && <ReadTicks msg={msg} />}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {isOtherTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="border-t border-zinc-800 px-3 py-2"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          {preview && <PhotoPreviewBox />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-pink-400 hover:border-pink-500 flex items-center justify-center transition flex-shrink-0"
            >
              <ImagePlus size={20} />
            </button>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => onType(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 outline-none focus:border-pink-500"
              style={{ fontSize: 16 }}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || (!text.trim() && !file)}
              className="w-10 h-10 rounded-full bg-pink-600 disabled:opacity-40 flex items-center justify-center flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
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
              <p className={`text-xs ${isOtherTyping ? 'text-pink-400' : isOnline ? 'text-green-400' : 'text-zinc-400'}`}>
                {statusLine()}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setShowTip(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-600/20 border border-pink-500/40 text-pink-400 hover:bg-pink-600/30 transition text-sm font-medium"
          >
            <DollarSign size={16} />
            Tip
          </button>
        </div>

        <div ref={desktopRef} className="flex-1 overflow-y-scroll px-6 max-w-3xl w-full mx-auto">
          <div className="min-h-full flex flex-col justify-end py-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-zinc-500 py-16">
                <p>No messages yet</p>
                <p className="text-sm mt-1">Say hello 👋</p>
              </div>
            )}

            {messages.map((msg) => {
              const mine = msg.sender_id === userId;
              const isTip = msg.media_type === 'tip' || (msg.content || '').includes('💸 tipped');
              const locked = msg.is_locked && !canSeeMedia(msg);

              return (
                <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl overflow-hidden ${
                      mine ? 'rounded-br-md' : 'rounded-bl-md'
                    } ${isTip ? 'bg-gradient-to-r from-pink-600 to-rose-500' : ''}`}
                  >
                    {msg.media_url && msg.media_type === 'image' && (
                      locked ? (
                        <div className="relative">
                          <img
                            src={msg.media_url}
                            alt=""
                            className="w-full max-h-[280px] object-cover blur-xl scale-110"
                          />
                          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-4">
                            <Lock size={28} className="text-white mb-2" />
                            <p className="text-white text-sm font-medium mb-3">
                              Locked · £{Number(msg.unlock_price || 0).toFixed(2)}
                            </p>
                            <button
                              type="button"
                              onClick={() => unlockMessage(msg)}
                              disabled={unlockingId === msg.id}
                              className="bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2"
                            >
                              <Unlock size={16} />
                              {unlockingId === msg.id ? 'Unlocking...' : 'Unlock'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setViewer(msg.media_url)}
                          className="block w-full relative"
                        >
                          <img
                            src={msg.media_url}
                            alt=""
                            className="w-full max-h-[320px] object-cover"
                          />
                          {msg.is_locked && mine && (
                            <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                              <Lock size={10} /> £{Number(msg.unlock_price || 0).toFixed(2)}
                            </span>
                          )}
                        </button>
                      )
                    )}

                    <div className={`px-3.5 py-2 ${isTip ? '' : mine ? 'bg-pink-600' : 'bg-zinc-800'}`}>
                      {!!msg.content && (
                        <p className={`text-[15px] whitespace-pre-wrap break-words ${isTip ? 'font-medium' : ''}`}>
                          {msg.content}
                        </p>
                      )}
                      <p className={`text-[10px] ${msg.content ? 'mt-1' : ''} ${mine || isTip ? 'text-pink-200/80' : 'text-zinc-500'}`}>
                        {time(msg.created_at)}
                        {mine && <ReadTicks msg={msg} />}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {isOtherTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-3xl w-full mx-auto border-t border-zinc-800 px-6 py-4">
          {preview && <PhotoPreviewBox />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-pink-400 hover:border-pink-500 flex items-center justify-center transition flex-shrink-0"
            >
              <ImagePlus size={20} />
            </button>
            <input
              value={text}
              onChange={(e) => onType(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-3 text-sm outline-none focus:border-pink-500"
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
              disabled={sending || (!text.trim() && !file)}
              className="w-12 h-12 rounded-full bg-pink-600 hover:bg-pink-700 disabled:opacity-40 flex items-center justify-center transition flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}