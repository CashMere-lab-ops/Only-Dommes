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
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    const scroll = (el: HTMLDivElement | null) => {
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };

    scroll(mobileScrollRef.current);
    scroll(desktopScrollRef.current);

    requestAnimationFrame(() => {
      scroll(mobileScrollRef.current);
      scroll(desktopScrollRef.current);
    });

    setTimeout(() => {
      scroll(mobileScrollRef.current);
      scroll(desktopScrollRef.current);
    }, 50);

    setTimeout(() => {
      scroll(mobileScrollRef.current);
      scroll(desktopScrollRef.current);
    }, 200);
  };

  useEffect(() => {
    const loadChat = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUserId(user.id);

      const { data: convo, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (error || !convo) {
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

      setOtherUser(profile);

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      setMessages(msgs || []);
      setLoading(false);

      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id);
    };

    if (conversationId) loadChat();
  }, [conversationId]);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [loading, messages.length]);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    const channel = supabase.channel(`chat-room-${conversationId}`, {
      config: { broadcast: { self: false } },
    });

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
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.userId !== currentUserId) {
          setIsOtherTyping(!!payload.payload?.isTyping);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  const sendTyping = (isTyping: boolean) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId, isTyping },
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    sendTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 3000);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be under 10MB');
      return;
    }

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedImage) || !currentUserId || sending) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(false);

    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      // Upload image if selected
      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `${currentUserId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(fileName, selectedImage);

        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage
          .from('chat-media')
          .getPublicUrl(fileName);

        mediaUrl = publicUrl.publicUrl;
        mediaType = 'image';
        clearSelectedImage();
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: content || (mediaUrl ? '' : ''),
          media_url: mediaUrl,
          media_type: mediaType,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error('Send error:', err);
      alert('Failed to send message');
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateLabel = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const groupedMessages: { label: string; messages: any[] }[] = [];
  messages.forEach((msg) => {
    const label = formatDateLabel(msg.created_at);
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({ label, messages: [msg] });
    }
  });

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <div className="hidden lg:block">
            <Sidebar />
          </div>
          <main className="flex-1 flex items-center justify-center">
            <p className="text-zinc-400">Loading chat...</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const name = otherUser?.display_name || otherUser?.username || 'User';
  const initial = name.charAt(0).toUpperCase();

  const MessageList = () => (
    <div className="min-h-full flex flex-col justify-end py-2">
      {groupedMessages.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-base">No messages yet</p>
          <p className="text-sm mt-1 text-zinc-600">Say hello 👋</p>
        </div>
      ) : (
        groupedMessages.map((group) => (
          <div key={group.label}>
            <div className="flex items-center justify-center my-4">
              <span className="text-[11px] font-medium text-zinc-500 bg-zinc-900/80 px-3 py-1 rounded-full">
                {group.label}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.messages.map((msg) => {
                const isMine = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl overflow-hidden ${
                        isMine
                          ? 'bg-pink-600 text-white rounded-br-md'
                          : 'bg-zinc-800 text-white rounded-bl-md'
                      }`}
                    >
                      {/* Image */}
                      {msg.media_url && msg.media_type === 'image' && (
                        <img
                          src={msg.media_url}
                          alt="Shared"
                          className="w-full max-h-72 object-cover cursor-pointer"
                          onClick={() => window.open(msg.media_url, '_blank')}
                        />
                      )}

                      {/* Text */}
                      {msg.content && (
                        <div className="px-3.5 py-2">
                          <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        </div>
                      )}

                      {/* Time */}
                      <div
                        className={`px-3.5 pb-2 ${
                          !msg.content && msg.media_url ? 'pt-1.5' : ''
                        }`}
                      >
                        <p
                          className={`text-[10px] ${
                            isMine ? 'text-pink-200/80' : 'text-zinc-500'
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {isOtherTyping && (
        <div className="flex justify-start mt-2">
          <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}
    </div>
  );

  const InputBar = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex-shrink-0 border-t border-zinc-800 px-3 lg:px-6 py-2 lg:py-4">
      {/* Image preview */}
      {imagePreview && (
        <div className="mb-3 relative inline-block">
          <img
            src={imagePreview}
            alt="Preview"
            className="h-24 w-24 object-cover rounded-xl border border-zinc-700"
          />
          <button
            type="button"
            onClick={clearSelectedImage}
            className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 lg:gap-3">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleImageSelect}
          className="hidden"
        />

        {/* Image button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-pink-400 hover:border-pink-500 transition flex-shrink-0"
        >
          <ImagePlus size={20} />
        </button>

        <input
          type="text"
          value={newMessage}
          onChange={handleInputChange}
          placeholder="Message..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 lg:py-3 outline-none focus:border-pink-500"
          style={{ fontSize: isMobile ? '16px' : '14px' }}
        />

        <button
          type="submit"
          disabled={(!newMessage.trim() && !selectedImage) || sending}
          className={`${
            isMobile ? 'w-10 h-10' : 'w-12 h-12'
          } rounded-full bg-pink-600 hover:bg-pink-700 flex items-center justify-center transition disabled:opacity-40 flex-shrink-0`}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* MOBILE */}
        <div className="lg:hidden fixed inset-0 bg-zinc-950 flex flex-col z-50">
          <div className="flex-shrink-0 border-b border-zinc-800 px-3 py-3 flex items-center gap-3">
            <button onClick={() => router.push('/messages')} className="text-zinc-400 p-1">
              <ArrowLeft size={24} />
            </button>
            <Link href={`/${otherUser?.username}`} className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{name}</p>
                <p className="text-xs text-zinc-400 truncate">
                  {isOtherTyping ? 'typing...' : `@${otherUser?.username}`}
                </p>
              </div>
            </Link>
          </div>

          <div
            ref={mobileScrollRef}
            className="flex-1 overflow-y-scroll px-3"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <MessageList />
          </div>

          <div style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}>
            <InputBar isMobile />
          </div>
        </div>

        {/* DESKTOP */}
        <main className="hidden lg:flex flex-1 flex-col h-screen overflow-hidden">
          <div className="flex-shrink-0 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
            <Link href="/messages" className="text-zinc-400 hover:text-white">
              <ArrowLeft size={22} />
            </Link>
            <Link href={`/${otherUser?.username}`} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">{name}</p>
                <p className="text-xs text-zinc-400">
                  {isOtherTyping ? 'typing...' : `@${otherUser?.username}`}
                </p>
              </div>
            </Link>
          </div>

          <div
            ref={desktopScrollRef}
            className="flex-1 overflow-y-scroll px-6 max-w-3xl w-full mx-auto"
          >
            <MessageList />
          </div>

          <div className="max-w-3xl w-full mx-auto">
            <InputBar />
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}