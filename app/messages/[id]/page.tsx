'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, ImagePlus, X } from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import AuthGuard from '../../../components/AuthGuard';
import { createClient } from '../../../lib/supabase';

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
  const [otherUser, setOtherUser] = useState<any>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const mobileRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const scrollBottom = () => {
    [mobileRef.current, desktopRef.current].forEach((el) => {
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // Load chat once
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', otherId)
        .single();

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!alive) return;
      setOtherUser(profile);
      setMessages(msgs || []);
      setLoading(false);

      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id);

      setTimeout(scrollBottom, 100);
    };

    load();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // Realtime
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
        (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setTimeout(scrollBottom, 50);
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
    if (fileRef.current) fileRef.current.value = '';
  };

  const send = async () => {
    if (sending || !userId) return;
    if (!text.trim() && !file) return;

    setSending(true);
    const messageText = text.trim();
    const imageFile = file;

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
          .upload(path, imageFile, {
            contentType: imageFile.type,
          });

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

      setTimeout(scrollBottom, 80);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to send');
      setText(messageText);
    } finally {
      setSending(false);
    }
  };

  const time = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
          <p className="text-zinc-400">Loading chat...</p>
        </div>
      </AuthGuard>
    );
  }

  const displayName = otherUser?.display_name || otherUser?.username || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  const Bubbles = () => (
    <div className="min-h-full flex flex-col justify-end py-3 space-y-2">
      {messages.length === 0 && (
        <div className="text-center text-zinc-500 py-16">
          <p>No messages yet</p>
          <p className="text-sm mt-1">Say hello 👋</p>
        </div>
      )}

      {messages.map((msg) => {
        const mine = msg.sender_id === userId;
        return (
          <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl overflow-hidden ${mine ? 'rounded-br-md' : 'rounded-bl-md'}`}>
              {msg.media_url && (
                <button type="button" onClick={() => setViewer(msg.media_url)} className="block w-full">
                  <img src={msg.media_url} alt="" className="w-full max-h-[320px] object-cover" />
                </button>
              )}
              <div className={`px-3.5 py-2 ${mine ? 'bg-pink-600' : 'bg-zinc-800'}`}>
                {!!msg.content && (
                  <p className="text-[15px] whitespace-pre-wrap break-words">{msg.content}</p>
                )}
                <p className={`text-[10px] ${msg.content ? 'mt-1' : ''} ${mine ? 'text-pink-200/80' : 'text-zinc-500'}`}>
                  {time(msg.created_at)}
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
  );

  const Composer = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="border-t border-zinc-800 px-3 lg:px-6 py-2 lg:py-4">
      {preview && (
        <div className="mb-2 relative inline-block">
          <img src={preview} alt="" className="h-20 w-20 object-cover rounded-xl border border-zinc-700" />
          <button type="button" onClick={clearImage} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-pink-400 hover:border-pink-500 flex items-center justify-center transition"
        >
          <ImagePlus size={20} />
        </button>

        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder="Message..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 outline-none focus:border-pink-500"
          style={{ fontSize: mobile ? 16 : 14 }}
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
          className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-pink-600 hover:bg-pink-700 disabled:opacity-40 flex items-center justify-center transition"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {viewer && (
          <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-3" onClick={() => setViewer(null)}>
            <button type="button" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
              <X size={20} />
            </button>
            <img src={viewer} alt="" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        )}

        {/* Mobile */}
        <div className="lg:hidden fixed inset-0 z-50 bg-zinc-950 flex flex-col">
          <div className="border-b border-zinc-800 px-3 py-3 flex items-center gap-3">
            <button type="button" onClick={() => router.push('/messages')} className="text-zinc-400 p-1">
              <ArrowLeft size={24} />
            </button>
            <Link href={`/${otherUser?.username}`} className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center font-bold">
                {otherUser?.avatar_url ? <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{displayName}</p>
                <p className="text-xs text-zinc-400 truncate">{isOtherTyping ? 'typing...' : `@${otherUser?.username}`}</p>
              </div>
            </Link>
          </div>

          <div ref={mobileRef} className="flex-1 overflow-y-scroll px-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Bubbles />
          </div>

          <div style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}>
            <Composer mobile />
          </div>
        </div>

        {/* Desktop */}
        <main className="hidden lg:flex flex-1 flex-col h-screen">
          <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
            <Link href="/messages" className="text-zinc-400 hover:text-white">
              <ArrowLeft size={22} />
            </Link>
            <Link href={`/${otherUser?.username}`} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center font-bold">
                {otherUser?.avatar_url ? <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
              </div>
              <div>
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-zinc-400">{isOtherTyping ? 'typing...' : `@${otherUser?.username}`}</p>
              </div>
            </Link>
          </div>

          <div ref={desktopRef} className="flex-1 overflow-y-scroll px-6 max-w-3xl w-full mx-auto">
            <Bubbles />
          </div>

          <div className="max-w-3xl w-full mx-auto">
            <Composer />
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}