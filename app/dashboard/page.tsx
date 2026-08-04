'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  DollarSign, TrendingUp, Film, Plus, Radio, Wallet, Eye,
  ShoppingBag, X, Settings, Package, Pencil, Trash2, Image as ImageIcon,
  ChevronLeft, ChevronRight, Heart, Users, Clock, Search, Phone
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

type Item = {
  id: string;
  creator_id?: string;
  title: string;
  description?: string | null;
  price: number;
  category: string;
  condition: string;
  photos: string[];
  status?: 'available' | 'sold' | 'hidden';
  created_at?: string;
};

const SHOP_CATEGORIES = [
  'Underwear',
  'Socks',
  'Heels',
  'Boots',
  'Shoes',
  'Sandals',
  'Flip Flops',
  'Tights / Stockings',
  'Lingerie',
  'Other',
];

export default function DashboardPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const [clipForm, setClipForm] = useState({
    title: '',
    description: '',
    price: 9.99,
    category: '',
  });
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    price: 25,
    category: 'Underwear',
    condition: 'Worn',
    photos: [] as string[],
  });
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [pricing, setPricing] = useState({
    privatePerMinute: 8,
    minPrivateMinutes: 5,
    tipMenuEnabled: true,
  });
  const [myClips] = useState([
    { id: 1, title: 'Morning Stretch Session', price: 12.99, sales: 0 },
    { id: 2, title: 'Private JOI Custom', price: 45.0, sales: 0 },
  ]);
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [shopOrders, setShopOrders] = useState<any[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [subCount, setSubCount] = useState(0);
  const [mySubscriptions, setMySubscriptions] = useState<any[]>([]);
  const [mySubCount, setMySubCount] = useState(0);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(data);
      if (data?.account_type === 'creator') {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('creator_id', user.id)
          .eq('status', 'active')
          .order('started_at', { ascending: false });
        if (subs && subs.length > 0) {
          const ids = subs.map((s) => s.subscriber_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', ids);
          const map = new Map((profiles || []).map((p) => [p.id, p]));
          const enriched = subs.map((s) => ({
            ...s,
            subscriber: map.get(s.subscriber_id) || null,
          }));
          setSubscribers(enriched);
          setSubCount(enriched.length);
        } else {
          setSubscribers([]);
          setSubCount(0);
        }
      } else {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('subscriber_id', user.id)
          .eq('status', 'active')
          .order('started_at', { ascending: false });
        if (subs && subs.length > 0) {
          const ids = subs.map((s) => s.creator_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', ids);
          const map = new Map((profiles || []).map((p) => [p.id, p]));
          const enriched = subs.map((s) => ({
            ...s,
            creator: map.get(s.creator_id) || null,
          }));
          setMySubscriptions(enriched);
          setMySubCount(enriched.length);
        } else {
          setMySubscriptions([]);
          setMySubCount(0);
        }
      }
      if (data?.account_type === 'creator') {
        const { data: items } = await supabase
          .from('shop_items')
          .select('*')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false });
        setMyItems(
          (items || []).map((row: any) => ({
            ...row,
            photos: Array.isArray(row.photos) ? row.photos : [],
          }))
        );

        const { data: orders } = await supabase
          .from('shop_orders')
          .select('*')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setShopOrders(orders || []);
      }

      setLoading(false);
    };
    loadProfile();
  }, []);

  const displayName = profile?.display_name || profile?.username || 'User';
  const isCreator = profile?.account_type === 'creator';

  const handleCreateClip = () => {
    if (!clipForm.title) return;
    setCreating(true);
    setTimeout(() => {
      setCreating(false);
      setShowUpload(false);
      setClipForm({ title: '', description: '', price: 9.99, category: '' });
      alert('Clip uploaded successfully! (Demo)');
    }, 1200);
  };

  const openEditItem = (item: Item) => {
    setEditingItem(item);
    setPhotoFiles([]);
    setItemForm({
      title: item.title,
      description: item.description || '',
      price: item.price,
      category: item.category,
      condition: item.condition || 'Worn',
      photos: item.photos || [],
    });
    setShowItemForm(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remainingSlots = 3 - itemForm.photos.length;
    if (remainingSlots <= 0) {
      alert('You can only upload a maximum of 3 photos.');
      return;
    }
    const filesToAdd = Array.from(files).slice(0, remainingSlots);
    const previews = filesToAdd.map((file) => URL.createObjectURL(file));
    setPhotoFiles((prev) => [...prev, ...filesToAdd]);
    setItemForm((prev) => ({
      ...prev,
      photos: [...prev.photos, ...previews],
    }));
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setItemForm((prev) => {
      const url = prev.photos[index];
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      return { ...prev, photos: prev.photos.filter((_, i) => i !== index) };
    });
    // photoFiles only tracks NEW files in order after existing remote urls
    setPhotoFiles((prev) => {
      const remoteCount = itemForm.photos.filter((u) => !u.startsWith('blob:')).length;
      const fileIndex = index - remoteCount;
      if (fileIndex < 0) return prev;
      return prev.filter((_, i) => i !== fileIndex);
    });
  };

  const resetItemForm = () => {
    itemForm.photos.forEach((u) => {
      if (u.startsWith('blob:')) URL.revokeObjectURL(u);
    });
    setItemForm({
      title: '',
      description: '',
      price: 25,
      category: 'Underwear',
      condition: 'Worn',
      photos: [],
    });
    setPhotoFiles([]);
    setEditingItem(null);
  };

  const handleSaveItem = async () => {
    if (!itemForm.title.trim()) return;
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      // Keep existing remote URLs; upload new blob files
      const remotePhotos = itemForm.photos.filter((u) => !u.startsWith('blob:'));
      const uploaded: string[] = [];
      for (let i = 0; i < photoFiles.length; i++) {
        const file = photoFiles[i];
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('shop-items')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const {
          data: { publicUrl },
        } = supabase.storage.from('shop-items').getPublicUrl(path);
        uploaded.push(publicUrl);
      }
      const photos = [...remotePhotos, ...uploaded].slice(0, 3);

      if (editingItem) {
        const { data, error } = await supabase
          .from('shop_items')
          .update({
            title: itemForm.title.trim(),
            description: itemForm.description.trim() || null,
            price: Number(itemForm.price) || 0,
            category: itemForm.category,
            condition: itemForm.condition,
            photos,
          })
          .eq('id', editingItem.id)
          .eq('creator_id', user.id)
          .select()
          .single();
        if (error) throw error;
        setMyItems((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? { ...item, ...data, photos: data.photos || [] }
              : item
          )
        );
      } else {
        const { data, error } = await supabase
          .from('shop_items')
          .insert({
            creator_id: user.id,
            title: itemForm.title.trim(),
            description: itemForm.description.trim() || null,
            price: Number(itemForm.price) || 0,
            category: itemForm.category,
            condition: itemForm.condition,
            photos,
            status: 'available',
          })
          .select()
          .single();
        if (error) throw error;
        setMyItems((prev) => [{ ...data, photos: data.photos || [] }, ...prev]);
      }

      setShowItemForm(false);
      resetItemForm();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to save item');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const { error } = await supabase.from('shop_items').delete().eq('id', id);
      if (error) throw error;
      setMyItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const markItemStatus = async (id: string, status: 'available' | 'sold' | 'hidden') => {
    try {
      const { error } = await supabase
        .from('shop_items')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      setMyItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const openGallery = (item: Item) => {
    if (item.photos.length === 0) return;
    setViewingItem(item);
    setPhotoIndex(0);
  };

  const nextPhoto = () => {
    if (!viewingItem) return;
    setPhotoIndex((prev) => (prev + 1) % viewingItem.photos.length);
  };

  const prevPhoto = () => {
    if (!viewingItem) return;
    setPhotoIndex(
      (prev) => (prev - 1 + viewingItem.photos.length) % viewingItem.photos.length
    );
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50) nextPhoto();
    else if (distance < -50) prevPhoto();
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-zinc-400">Loading dashboard...</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // ==================== SUB DASHBOARD ====================
  if (!isCreator) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
            <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h1 className="text-3xl font-bold">Welcome back, {displayName}</h1>
                  <p className="text-zinc-400 mt-1">Here’s what’s happening with your account</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/calls"
                    className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-700 hover:border-pink-500/50 px-4 py-2.5 rounded-xl text-sm font-medium transition"
                  >
                    <Phone size={18} className="text-pink-400" /> Call history
                  </Link>
                  <Link
                    href="/discover"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 px-5 py-2.5 rounded-xl text-sm font-medium transition"
                  >
                    <Search size={18} /> Discover Creators
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <DollarSign size={16} /> Spent This Month
                  </div>
                  <p className="text-2xl font-bold">£0.00</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <Heart size={16} /> Active Subscriptions
                  </div>
                  <p className="text-2xl font-bold">{mySubCount}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                    <Film size={16} /> Clips Owned
                  </div>
                  <p className="text-2xl font-bold">0</p>
                </div>
                <div className="bg-gradient-to-br from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-zinc-300 text-sm mb-1">
                    <Wallet size={16} /> Wallet Balance
                  </div>
                  <p className="text-2xl font-bold text-pink-400">£0.00</p>
                  <button className="mt-3 text-xs text-pink-400 hover:text-pink-300 font-medium">
                    + Top Up
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Heart size={20} className="text-pink-400" /> Your Subscriptions
                    </h2>
                    <Link href="/subscriptions" className="text-sm text-pink-400 hover:text-pink-300">
                      View all
                    </Link>
                  </div>
                  {mySubscriptions.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 flex-1">
                      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                        <Heart size={28} className="opacity-40" />
                      </div>
                      <p className="text-sm mb-1">No active subscriptions</p>
                      <p className="text-xs text-zinc-600 mb-5">
                        Subscribe to creators to unlock exclusive content
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 flex-1 mb-5">
                      {mySubscriptions.slice(0, 5).map((sub) => {
                        const name =
                          sub.creator?.display_name ||
                          sub.creator?.username ||
                          'Creator';
                        const username = sub.creator?.username;
                        const initial = name.charAt(0).toUpperCase();
                        return (
                          <Link
                            key={sub.id}
                            href={username ? `/${username}` : '/subscriptions'}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/70 transition"
                          >
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                              {sub.creator?.avatar_url ? (
                                <img
                                  src={sub.creator.avatar_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                initial
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{name}</p>
                              <p className="text-xs text-zinc-400 truncate">
                                {username ? `@${username}` : ''}
                                {sub.started_at ? ` · since ${formatDate(sub.started_at)}` : ''}
                              </p>
                            </div>
                            <span className="text-sm text-pink-400 font-medium flex-shrink-0">
                              £{Number(sub.price || 0).toFixed(2)}/mo
                            </span>
                          </Link>
                        );
                      })}
                      {mySubscriptions.length > 5 && (
                        <p className="text-xs text-zinc-500 text-center pt-1">
                          +{mySubscriptions.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                  <Link
                    href="/subscriptions"
                    className="w-full text-center px-5 py-2.5 bg-pink-600 hover:bg-pink-700 rounded-xl text-sm font-medium transition text-white"
                  >
                    Manage Subscriptions
                  </Link>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Phone size={20} className="text-pink-400" /> Call history
                    </h2>
                    <Link href="/calls" className="text-sm text-pink-400 hover:text-pink-300">
                      View all
                    </Link>
                  </div>
                  <div className="text-center py-10 text-zinc-500">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                      <Phone size={28} className="opacity-40" />
                    </div>
                    <p className="text-sm mb-1">Voice calls with creators</p>
                    <p className="text-xs text-zinc-600 mb-5">
                      Past calls and spend appear here
                    </p>
                    <Link
                      href="/calls"
                      className="inline-flex items-center gap-2 text-sm text-pink-400 hover:text-pink-300 font-medium"
                    >
                      Open call history →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // ==================== CREATOR DASHBOARD ====================
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold">Welcome, {displayName}</h1>
                <p className="text-zinc-400 mt-1">Manage your content and earnings</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/calls"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium border border-zinc-700 hover:border-pink-500/50 bg-zinc-900 transition text-sm"
                >
                  <Phone size={18} className="text-pink-400" /> Call history
                </Link>
                <button
                  onClick={() => setIsLive(!isLive)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition ${
                    isLive
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90'
                  }`}
                >
                  <Radio size={18} />
                  {isLive ? 'End Stream' : 'Go Live'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <DollarSign size={16} /> Today
                </div>
                <p className="text-2xl font-bold">£0.00</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <TrendingUp size={16} /> This Week
                </div>
                <p className="text-2xl font-bold">£0.00</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <Wallet size={16} /> This Month
                </div>
                <p className="text-2xl font-bold">£0.00</p>
              </div>
              <div className="bg-gradient-to-br from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-300 text-sm mb-1">
                  <Heart size={16} /> Subscribers
                </div>
                <p className="text-2xl font-bold text-pink-400">{subCount}</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center">
                  <Phone className="text-pink-400" size={22} />
                </div>
                <div>
                  <p className="font-semibold">Voice call history</p>
                  <p className="text-sm text-zinc-400">
                    Past calls, duration, earnings and ratings
                  </p>
                </div>
              </div>
              <Link
                href="/calls"
                className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-sm font-medium transition text-center"
              >
                View calls
              </Link>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users size={20} className="text-pink-400" /> Your Subscribers
                </h2>
                <span className="text-sm text-zinc-400">{subCount} active</span>
              </div>
              {subscribers.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  <Users size={32} className="mx-auto mb-2 opacity-40" />
                  No subscribers yet. Enable subscriptions in Settings and share your profile.
                </div>
              ) : (
                <div className="space-y-2">
                  {subscribers.map((sub) => {
                    const name =
                      sub.subscriber?.display_name ||
                      sub.subscriber?.username ||
                      'User';
                    const initial = name.charAt(0).toUpperCase();
                    return (
                      <Link
                        key={sub.id}
                        href={`/${sub.subscriber?.username}`}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/70 transition"
                      >
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                          {sub.subscriber?.avatar_url ? (
                            <img
                              src={sub.subscriber.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            initial
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            @{sub.subscriber?.username} · since {formatDate(sub.started_at)}
                          </p>
                        </div>
                        <span className="text-sm text-pink-400 font-medium flex-shrink-0">
                          £{Number(sub.price || 0).toFixed(2)}/mo
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center">
                  <Wallet className="text-pink-400" size={22} />
                </div>
                <div>
                  <p className="font-semibold">Weekly Payout</p>
                  <p className="text-sm text-zinc-400">Next payout: Friday · £0.00 pending</p>
                </div>
              </div>
              <button className="px-5 py-2.5 rounded-xl border border-zinc-700 text-sm font-medium hover:bg-zinc-800 transition">
                Withdraw
              </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
              <div className="flex items-center gap-2 mb-5">
                <Settings size={20} className="text-pink-400" />
                <h2 className="text-lg font-semibold">Pricing Settings</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Private Session (per minute)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                    <input
                      type="number"
                      value={pricing.privatePerMinute}
                      onChange={(e) =>
                        setPricing({ ...pricing, privatePerMinute: Number(e.target.value) })
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Minimum Private Minutes
                  </label>
                  <input
                    type="number"
                    value={pricing.minPrivateMinutes}
                    onChange={(e) =>
                      setPricing({ ...pricing, minPrivateMinutes: Number(e.target.value) })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      className={`w-11 h-6 rounded-full relative transition ${
                        pricing.tipMenuEnabled ? 'bg-pink-600' : 'bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                          pricing.tipMenuEnabled ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </div>
                    <span className="text-sm">Enable Tip Menu</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <DollarSign size={20} className="text-pink-400" /> Recent Tips
                </h2>
                <p className="text-zinc-500 text-sm py-8 text-center">No tips yet</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Film size={20} className="text-pink-400" /> My Clips
                  </h2>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-1.5 text-sm bg-pink-600 hover:bg-pink-700 px-3 py-1.5 rounded-lg transition"
                  >
                    <Plus size={16} /> Upload
                  </button>
                </div>
                <div className="space-y-3">
                  {myClips.map((clip) => (
                    <div key={clip.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50">
                      <div className="w-14 h-10 rounded-lg bg-zinc-700 flex items-center justify-center">
                        <Film size={18} className="text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{clip.title}</p>
                        <p className="text-xs text-zinc-400 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <ShoppingBag size={12} /> {clip.sales}
                          </span>
                          <span>·</span>
                          <span>£{clip.price.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

                          {shopOrders.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
                  <h2 className="text-lg font-semibold mb-4">Shop order requests</h2>
                  <div className="space-y-3">
                    {shopOrders.map((o) => (
                      <div
                        key={o.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-zinc-800 last:border-0"
                      >
                        <div>
                          <p className="font-medium text-sm">{o.item_title}</p>
                          <p className="text-xs text-zinc-500">
                            £{Number(o.item_price).toFixed(2)} · {o.status}
                            {o.buyer_note ? ` · "${o.buyer_note}"` : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {o.status === 'requested' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await supabase
                                    .from('shop_orders')
                                    .update({ status: 'accepted' })
                                    .eq('id', o.id);
                                  setShopOrders((prev) =>
                                    prev.map((x) =>
                                      x.id === o.id ? { ...x, status: 'accepted' } : x
                                    )
                                  );
                                }}
                                className="text-xs px-3 py-1.5 rounded-lg bg-pink-600 text-white"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await supabase
                                    .from('shop_orders')
                                    .update({ status: 'cancelled' })
                                    .eq('id', o.id);
                                  setShopOrders((prev) =>
                                    prev.map((x) =>
                                      x.id === o.id ? { ...x, status: 'cancelled' } : x
                                    )
                                  );
                                }}
                                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400"
                              >
                                Decline
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

<div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Package size={20} className="text-pink-400" /> Physical Items for Sale
                </h2>
                <button
                  onClick={() => {
                    setEditingItem(null);
                    setItemForm({
                      title: '',
                      description: '',
                      price: 25,
                      category: 'Underwear',
                      condition: 'Worn',
                      photos: [],
                    });
                    setShowItemForm(true);
                  }}
                  className="flex items-center gap-1.5 text-sm bg-pink-600 hover:bg-pink-700 px-3 py-1.5 rounded-lg transition"
                >
                  <Plus size={16} /> Add Item
                </button>
              </div>
              {myItems.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  <Package size={32} className="mx-auto mb-2 opacity-40" />
                  No items listed yet. Sell underwear, heels, socks and more!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-zinc-800/60 border border-zinc-700 rounded-xl overflow-hidden"
                    >
                      <div
                        className="aspect-[4/3] bg-zinc-700 relative cursor-pointer"
                        onClick={() => openGallery(item)}
                      >
                        {item.photos.length > 0 ? (
                          <img
                            src={item.photos[0]}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon size={32} className="text-zinc-500" />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <p className="font-medium leading-tight">{item.title}</p>
                            <p className="text-xs text-zinc-400 mt-1">
                              {item.category} · {item.condition} · {item.status === 'sold' ? 'Sold' : 'Available'}
                            </p>
                          </div>
                          <span className="font-semibold text-pink-400 whitespace-nowrap">
                            £{item.price}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditItem(item)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/70 text-red-400 transition"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isLive && (
              <div className="rounded-2xl border border-pink-500/40 bg-pink-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full">LIVE</div>
                  <div>
                    <p className="font-semibold">You are currently live</p>
                    <p className="text-sm text-zinc-400 flex items-center gap-1">
                      <Eye size={14} /> 0 watching
                    </p>
                  </div>
                </div>
                <Link href="/live/demo" className="text-sm font-medium text-pink-400 hover:text-pink-300">
                  View Stream →
                </Link>
              </div>
            )}
          </div>
        </main>

        {viewingItem && viewingItem.photos.length > 0 && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <button
              onClick={() => setViewingItem(null)}
              className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
            >
              <X size={28} />
            </button>
            <button
              onClick={prevPhoto}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 p-2 rounded-full z-10"
            >
              <ChevronLeft size={28} />
            </button>
            <div className="max-w-3xl w-full select-none">
              <img
                src={viewingItem.photos[photoIndex]}
                alt=""
                className="w-full max-h-[80vh] object-contain rounded-xl pointer-events-none"
              />
              <div className="text-center mt-4 text-sm text-zinc-400">
                {photoIndex + 1} / {viewingItem.photos.length} · {viewingItem.title}
              </div>
            </div>
            <button
              onClick={nextPhoto}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 p-2 rounded-full z-10"
            >
              <ChevronRight size={28} />
            </button>
          </div>
        )}

        {showUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold">Upload New Clip</h2>
                <button onClick={() => setShowUpload(false)} className="text-zinc-400 hover:text-white">
                  <X size={22} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Title</label>
                  <input
                    type="text"
                    value={clipForm.title}
                    onChange={(e) => setClipForm({ ...clipForm, title: e.target.value })}
                    placeholder="Clip title"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Description</label>
                  <textarea
                    value={clipForm.description}
                    onChange={(e) => setClipForm({ ...clipForm, description: e.target.value })}
                    placeholder="Describe your clip..."
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Price (£)</label>
                    <input
                      type="number"
                      value={clipForm.price}
                      onChange={(e) => setClipForm({ ...clipForm, price: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Category</label>
                    <select
                      value={clipForm.category}
                      onChange={(e) => setClipForm({ ...clipForm, category: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                    >
                      <option value="">Select category</option>
                      <option value="Dominatrix">Dominatrix</option>
                      <option value="Fitness">Fitness</option>
                      <option value="Lifestyle">Lifestyle</option>
                      <option value="Custom">Custom</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowUpload(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateClip}
                  disabled={creating || !clipForm.title}
                  className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 font-medium transition disabled:opacity-50"
                >
                  {creating ? 'Uploading...' : 'Publish Clip'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showItemForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold">
                  {editingItem ? 'Edit Item' : 'Add Physical Item'}
                </h2>
                <button
                  onClick={() => {
                    setShowItemForm(false);
                    setEditingItem(null);
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Photos (max 3)</label>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {itemForm.photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800">
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePhoto(index)}
                          className="absolute top-1 right-1 bg-black/70 rounded-full p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {itemForm.photos.length < 3 && (
                      <label className="aspect-square rounded-xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:border-pink-500 transition">
                        <ImageIcon size={24} className="text-zinc-500 mb-1" />
                        <span className="text-xs text-zinc-500">Add Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Item Title</label>
                  <input
                    type="text"
                    value={itemForm.title}
                    onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                    placeholder="e.g. Black Lace Panties (Worn)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Description</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    placeholder="Describe the item..."
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Price (£)</label>
                    <input
                      type="number"
                      value={itemForm.price}
                      onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Category</label>
                    <select
                      value={itemForm.category}
                      onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                    >
                      {SHOP_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Condition</label>
                  <select
                    value={itemForm.condition}
                    onChange={(e) => setItemForm({ ...itemForm, condition: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                  >
                    <option value="New">New / Unworn</option>
                    <option value="Worn">Worn</option>
                    <option value="Heavily Worn">Heavily Worn</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowItemForm(false);
                    setEditingItem(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveItem}
                  disabled={creating || !itemForm.title}
                  className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 font-medium transition disabled:opacity-50"
                >
                  {creating ? 'Saving...' : editingItem ? 'Save Changes' : 'List Item'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
