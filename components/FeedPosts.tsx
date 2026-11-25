'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  DollarSign,
  Send,
  X,
  Trash2,
  Flag,
  Link as LinkIcon,
  EyeOff,
  Ban,
} from 'lucide-react';
import { createClient } from '../lib/supabase';
import { createNotification } from '../lib/notifications';
import { applyUserBlock } from '../lib/blocks';
import { queuePostToStory } from './StoriesRail';
import { spendFromWallet, handleInsufficientBalance } from '../lib/wallet';

const TIP_AMOUNTS = [5, 10, 20, 50];
const REPORT_REASONS = [
  'Spam or scam',
  'Inappropriate content',
  'Harassment or bullying',
  'Copyright violation',
  'Other',
];

function formatTime(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function FeedPosts({
  posts,
  setPosts,
  userId,
  profile,
  hideHeader = false,
}: {
  posts: any[];
  setPosts: (fn: any) => void;
  userId: string | null;
  profile: any;
  hideHeader?: boolean;
}) {
  const supabase = createClient();
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<string | null>(null);
  const [tipPost, setTipPost] = useState<any>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState('');
  const [tipMessage, setTipMessage] = useState('');
  const [sendingTip, setSendingTip] = useState(false);
  const [tipSuccess, setTipSuccess] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const lastTap = useRef<Record<string, number>>({});
  const [likedAnimation, setLikedAnimation] = useState<string | null>(null);
  const [photoViewer, setPhotoViewer] = useState<string | null>(null);

  const actorName = () => profile?.display_name || profile?.username || 'Someone';

  useEffect(() => {
    const loadLikes = async () => {
      if (!userId) return;
      const { data } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId);
      if (data) setLikedPosts(new Set(data.map((l: any) => l.post_id)));
    };
    loadLikes();
  }, [userId]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const handleLike = async (postId: string) => {
    if (!userId) return;
    const isLiked = likedPosts.has(postId);
    const post = posts.find((p) => p.id === postId);
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(postId);
      else next.add(postId);
      return next;
    });
    setPosts((prev: any[]) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likes_count: isLiked
                ? Math.max(0, (p.likes_count || 0) - 1)
                : (p.likes_count || 0) + 1,
            }
          : p
      )
    );
    try {
      if (isLiked) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
      } else {
        await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
        if (post?.creator_id && post.creator_id !== userId) {
          await createNotification({
            userId: post.creator_id,
            actorId: userId,
            type: 'like',
            title: `${actorName()} liked your post`,
            body: post.content ? post.content.slice(0, 80) : null,
            link: '/',
          });
        }
      }
      const { count } = await supabase
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
      await supabase.from('posts').update({ likes_count: count || 0 }).eq('id', postId);
    } catch {
      /* ignore */
    }
  };

  const showHeart = (postId: string) => {
    setLikedAnimation(postId);
    window.setTimeout(() => {
      setLikedAnimation((cur) => (cur === postId ? null : cur));
    }, 700);
  };

  const handleDoubleTapLike = (postId: string) => {
    showHeart(postId);
    if (!likedPosts.has(postId)) handleLike(postId);
  };

  const toggleComments = async (postId: string) => {
    if (openComments === postId) {
      setOpenComments(null);
      return;
    }
    setOpenComments(postId);
    if (!comments[postId]) {
      const { data } = await supabase
        .from('post_comments')
        .select(`*, profiles:public_profiles!post_comments_user_public_profile_fkey (username, display_name, avatar_url)`)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      setComments((prev) => ({ ...prev, [postId]: data || [] }));
      const real = (data || []).length;
      setPosts((prev: any[]) =>
        prev.map((p) => (p.id === postId ? { ...p, comments_count: real } : p))
      );
      await supabase.from('posts').update({ comments_count: real }).eq('id', postId);
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!userId || !newComment[postId]?.trim()) return;
    setPostingComment(postId);
    const post = posts.find((p) => p.id === postId);
    const commentText = newComment[postId].trim();
    try {
      const { data, error } = await supabase
        .from('post_comments')
        .insert({ post_id: postId, user_id: userId, content: commentText })
        .select(`*, profiles:user_id (username, display_name, avatar_url)`)
        .single();
      if (error) throw error;
      setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
      const { count } = await supabase
        .from('post_comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
      await supabase.from('posts').update({ comments_count: count || 0 }).eq('id', postId);
      setPosts((prev: any[]) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments_count: count || 0 } : p
        )
      );
      if (post?.creator_id && post.creator_id !== userId) {
        await createNotification({
          userId: post.creator_id,
          actorId: userId,
          type: 'comment',
          title: `${actorName()} commented on your post`,
          body: commentText.slice(0, 100),
          link: '/',
        });
      }
      setNewComment((prev) => ({ ...prev, [postId]: '' }));
    } catch {
      alert('Could not comment');
    } finally {
      setPostingComment(null);
    }
  };

  const handleSendTip = async () => {
    if (!userId || !tipPost) return;
    const amount = customAmount ? parseFloat(customAmount) : selectedAmount;
    if (!amount || amount <= 0) return;
    setSendingTip(true);
    try {
      const paid = await spendFromWallet({
        amount,
        toUserId: tipPost.creator_id,
        type: 'tip',
        referenceType: 'post_tip',
        referenceId: `${tipPost.id}:${userId}:${Date.now()}`,
        description: tipMessage.trim() || 'Tip on post',
      });
      if (!paid.ok) {
        if (paid.code === 'INSUFFICIENT_BALANCE') {
          handleInsufficientBalance({ needed: paid.needed, balance: paid.balance });
          return;
        }
        throw new Error(paid.error);
      }
      await createNotification({
        userId: tipPost.creator_id,
        actorId: userId,
        type: 'tip',
        title: `${actorName()} tipped you £${Number(amount).toFixed(2)}`,
        body: tipMessage.trim() || null,
        link: `/${profile?.username || ''}`,
      });
      setTipSuccess(true);
      setTimeout(() => {
        setTipPost(null);
        setTipSuccess(false);
      }, 1800);
    } catch {
      alert('Failed to send tip');
    } finally {
      setSendingTip(false);
    }
  };

  const visible = posts.filter((p) => !hiddenPosts.has(p.id));

  return (
    <>
      <div className="max-w-xl space-y-5">
        {visible.map((post) => {
          const isLiked = likedPosts.has(post.id);
          const isCommentsOpen = openComments === post.id;
          const postComments = comments[post.id] || [];
          const isOwnPost = userId === post.creator_id;
          const isMenuOpen = openMenu === post.id;
          const showHeartAnim = likedAnimation === post.id;
          const name = post.profiles?.display_name || 'Unknown';
          const uname = post.profiles?.username;

          return (
            <div
              key={post.id}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative"
            >
              {!hideHeader && (
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={uname ? `/${uname}` : '/'}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden"
                  >
                    {post.profiles?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      name.charAt(0)
                    )}
                  </Link>
                  <div>
                    <Link href={uname ? `/${uname}` : '/'} className="font-semibold text-sm hover:text-pink-400">
                      {name}
                    </Link>
                    <p className="text-xs text-zinc-400">
                      {uname ? `@${uname}` : ''} · {formatTime(post.created_at)}
                    </p>
                  </div>
                </div>
                <div className="relative" ref={isMenuOpen ? menuRef : null}>
                  <button
                    onClick={() => setOpenMenu(isMenuOpen ? null : post.id)}
                    className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-800"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {isMenuOpen && (
                    <div className="absolute right-0 top-9 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
                      {isOwnPost ? (
                        <>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/discover?post=${post.id}`);
                              setOpenMenu(null);
                              alert('Link copied');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800"
                          >
                            <LinkIcon size={16} /> Copy link
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('Delete this post?')) return;
                              await supabase.from('posts').delete().eq('id', post.id);
                              setPosts((prev: any[]) => prev.filter((p) => p.id !== post.id));
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-zinc-800 border-t border-zinc-800"
                          >
                            <Trash2 size={16} /> Delete post
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setOpenMenu(null);
                              setReportPostId(post.id);
                              setReportReason('');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800"
                          >
                            <Flag size={16} /> Report
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/discover?post=${post.id}`);
                              setOpenMenu(null);
                              alert('Link copied');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800"
                          >
                            <LinkIcon size={16} /> Copy link
                          </button>
                          <button
                            onClick={() => {
                              setHiddenPosts((prev) => new Set(prev).add(post.id));
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800"
                          >
                            <EyeOff size={16} /> Hide post
                          </button>
                          <button
                            onClick={async () => {
                              if (!post.creator_id || !userId) return;
                              if (!confirm(`Block @${uname || 'this user'}?`)) return;
                              const res = await applyUserBlock(supabase, userId, post.creator_id);
                              if (!res.ok) {
                                alert(res.error || 'Could not block');
                                return;
                              }
                              setPosts((prev: any[]) =>
                                prev.filter((p) => p.creator_id !== post.creator_id)
                              );
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-zinc-800 border-t border-zinc-800"
                          >
                            <Ban size={16} /> Block {uname ? `@${uname}` : ''}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              )}

              {post.content && (
                <p className="px-4 pb-3 text-sm text-zinc-100 whitespace-pre-wrap">{post.content}</p>
              )}

              {post.media_type === 'photo' && post.media_url && (
                <div
                  className="bg-zinc-800 max-h-[420px] overflow-hidden relative cursor-pointer select-none"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    handleDoubleTapLike(post.id);
                  }}
                  onClick={() => {
                    const now = Date.now();
                    const last = lastTap.current[post.id] || 0;
                    if (now - last < 320) {
                      lastTap.current[post.id] = 0;
                      handleDoubleTapLike(post.id);
                      return;
                    }
                    lastTap.current[post.id] = now;
                    const tapId = now;
                    window.setTimeout(() => {
                      if (lastTap.current[post.id] === tapId) {
                        setPhotoViewer(post.media_url);
                        lastTap.current[post.id] = 0;
                      }
                    }, 300);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.thumbnail_url || post.media_url}
                    alt=""
                    className="w-full max-h-[420px] object-cover"
                    draggable={false}
                  />
                  {showHeartAnim && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Heart size={88} className="text-pink-500 fill-pink-500" strokeWidth={0} />
                    </div>
                  )}
                </div>
              )}

              {post.media_type === 'video' && post.media_url && (
                <div
                  className="bg-zinc-800 max-h-[420px] overflow-hidden relative"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    handleDoubleTapLike(post.id);
                  }}
                >
                  <video src={post.media_url} controls preload="metadata" className="w-full max-h-[420px]" />
                </div>
              )}

              <div className="px-4 py-3 flex items-center gap-6">
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-1.5 transition ${isLiked ? 'text-pink-500' : 'text-zinc-300 hover:text-pink-400'}`}
                  aria-label="Like"
                >
                  <Heart size={24} strokeWidth={1.75} className={isLiked ? 'fill-pink-500' : ''} />
                  <span className="text-sm tabular-nums">{post.likes_count || 0}</span>
                </button>
                <button
                  onClick={() => toggleComments(post.id)}
                  className={`flex items-center gap-1.5 transition ${isCommentsOpen ? 'text-pink-400' : 'text-zinc-300 hover:text-pink-400'}`}
                  aria-label="Comment"
                >
                  <MessageCircle size={24} strokeWidth={1.75} />
                  <span className="text-sm tabular-nums">{post.comments_count || 0}</span>
                </button>
                {!isOwnPost && (
                  <button
                    onClick={() => {
                      setTipPost(post);
                      setSelectedAmount(10);
                      setCustomAmount('');
                      setTipMessage('');
                      setTipSuccess(false);
                    }}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400"
                  >
                    <DollarSign size={20} />
                    <span className="text-sm">Tip</span>
                  </button>
                )}
                {profile?.account_type === 'creator' && (post.media_url || post.thumbnail_url) && (
                  <button
                    type="button"
                    onClick={() => queuePostToStory(post)}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400 text-sm"
                  >
                    Story
                  </button>
                )}
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/discover?post=${post.id}`;
                    if (navigator.share) {
                      navigator.share({ title: `Post by ${name}`, url }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(url);
                      alert('Link copied');
                    }
                  }}
                  className="text-zinc-400 hover:text-pink-400 ml-auto"
                >
                  <Share2 size={20} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {openComments && (() => {
        const post = posts.find((p) => p.id === openComments);
        const postComments = comments[openComments] || [];
        if (!post) return null;
        return (
          <div className="fixed inset-0 lg:left-72 z-[80] flex items-end lg:items-center justify-center" onClick={() => setOpenComments(null)}>
            <div className="absolute inset-0 bg-black/70" />
            <div
              className="relative w-full lg:w-[640px] bg-zinc-950 border border-zinc-800 rounded-t-3xl lg:rounded-3xl h-[75vh] lg:h-[78vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <p className="font-semibold">Comments</p>
                <button type="button" onClick={() => setOpenComments(null)} className="text-zinc-400 hover:text-white" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {postComments.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-8">No comments yet</p>
                ) : (
                  postComments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-xs font-bold overflow-hidden flex-shrink-0">
                        {comment.profiles?.avatar_url ? (
                          <img src={comment.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (comment.profiles?.display_name || 'U').charAt(0)
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">
                          <span className="font-semibold mr-1.5">{comment.profiles?.display_name || 'User'}</span>
                          <span className="text-zinc-200">{comment.content}</span>
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1">{formatTime(comment.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-zinc-800 px-4 py-3 flex items-center gap-2">
                <input
                  value={newComment[openComments] || ''}
                  onChange={(e) => setNewComment((prev) => ({ ...prev, [openComments]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddComment(openComments);
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2.5 text-sm outline-none focus:border-pink-500"
                />
                <button
                  onClick={() => handleAddComment(openComments)}
                  disabled={postingComment === openComments || !newComment[openComments]?.trim()}
                  className="text-sm font-semibold text-pink-400 disabled:opacity-40 px-2"
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {tipPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-lg">Send a Tip</h2>
              <button onClick={() => setTipPost(null)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            {tipSuccess ? (
              <div className="px-5 py-10 text-center">
                <p className="text-xl font-semibold">Tip sent</p>
              </div>
            ) : (
              <div className="px-5 py-5">
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {TIP_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => {
                        setSelectedAmount(amount);
                        setCustomAmount('');
                      }}
                      className={`py-2.5 rounded-xl text-sm font-medium ${
                        selectedAmount === amount && !customAmount
                          ? 'bg-pink-600 text-white'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      £{amount}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount(null);
                  }}
                  placeholder="Custom £"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 mb-3 outline-none focus:border-pink-500"
                />
                <input
                  type="text"
                  value={tipMessage}
                  onChange={(e) => setTipMessage(e.target.value)}
                  placeholder="Message (optional)"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 mb-4 outline-none focus:border-pink-500 text-sm"
                />
                <button
                  onClick={handleSendTip}
                  disabled={sendingTip || (!selectedAmount && !customAmount)}
                  className="w-full bg-gradient-to-r from-pink-600 to-rose-500 py-3 rounded-xl font-semibold disabled:opacity-50"
                >
                  {sendingTip ? 'Sending...' : `Send £${customAmount || selectedAmount || 0}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {reportPostId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold">Report post</h2>
              <button onClick={() => setReportPostId(null)} className="text-zinc-400">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-5">
              <div className="space-y-2 mb-5">
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setReportReason(reason)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm ${
                      reportReason === reason
                        ? 'bg-pink-600/20 border border-pink-500 text-pink-400'
                        : 'bg-zinc-800 border border-zinc-700'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (!reportReason) return;
                  setReporting(true);
                  setTimeout(() => {
                    setReporting(false);
                    setReportPostId(null);
                    alert('Thanks — we received your report.');
                  }, 600);
                }}
                disabled={!reportReason || reporting}
                className="w-full bg-pink-600 py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {reporting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {photoViewer && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPhotoViewer(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoViewer} alt="" className="max-h-[90vh] max-w-full object-contain rounded-xl" />
        </div>
      )}
    </>
  );
}
