'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Search,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';

const CATEGORIES = [
  'All',
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

type ShopItem = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  price: number;
  category: string;
  condition: string;
  photos: string[];
  status: string;
  created_at: string;
  creator?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export default function ShopPage() {
  const supabase = createClient();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [viewer, setViewer] = useState<ShopItem | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyNote, setBuyNote] = useState('');
  const [buySuccess, setBuySuccess] = useState(false);
  const [buyError, setBuyError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const { data, error } = await supabase
        .from('shop_items')
        .select('*')
        .eq('status', 'available')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setItems([]);
        setLoading(false);
        return;
      }

      const rows = data || [];
      const creatorIds = [...new Set(rows.map((r) => r.creator_id))];
      let profileMap = new Map<string, any>();

      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', creatorIds);
        profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      }

      setItems(
        rows.map((row) => ({
          ...row,
          photos: Array.isArray(row.photos) ? row.photos : [],
          creator: profileMap.get(row.creator_id) || null,
        }))
      );
      setLoading(false);
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!q) return true;
      const hay = `${item.title} ${item.description || ''} ${item.category} ${
        item.creator?.username || ''
      } ${item.creator?.display_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, category, search]);

  const openItem = (item: ShopItem) => {
    setViewer(item);
    setPhotoIndex(0);
    setBuySuccess(false);
    setBuyError('');
    setBuyNote('');
  };

  const nextPhoto = () => {
    if (!viewer || viewer.photos.length < 2) return;
    setPhotoIndex((i) => (i + 1) % viewer.photos.length);
  };

  const prevPhoto = () => {
    if (!viewer || viewer.photos.length < 2) return;
    setPhotoIndex((i) => (i - 1 + viewer.photos.length) % viewer.photos.length);
  };


  const requestBuy = async () => {
    if (!viewer || !currentUserId || buying) return;
    if (viewer.creator_id === currentUserId) {
      setBuyError("You can't order your own item");
      return;
    }
    setBuying(true);
    setBuyError('');
    setBuySuccess(false);
    try {
      const { data: order, error } = await supabase
        .from('shop_orders')
        .insert({
          item_id: viewer.id,
          creator_id: viewer.creator_id,
          buyer_id: currentUserId,
          item_title: viewer.title,
          item_price: viewer.price,
          status: 'requested',
          buyer_note: buyNote.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Message creator in chat
      const otherId = viewer.creator_id;
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_1.eq.${currentUserId},participant_2.eq.${otherId}),and(participant_1.eq.${otherId},participant_2.eq.${currentUserId})`
        )
        .maybeSingle();

      let convoId = existing?.id;
      if (!convoId) {
        const { data: created } = await supabase
          .from('conversations')
          .insert({
            participant_1: currentUserId,
            participant_2: otherId,
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        convoId = created?.id;
      }

      if (convoId) {
        const note = buyNote.trim()
          ? `\nNote: ${buyNote.trim()}`
          : '';
        await supabase.from('messages').insert({
          conversation_id: convoId,
          sender_id: currentUserId,
          content: `🛒 Order request: "${viewer.title}" · £${Number(viewer.price).toFixed(2)}${note}\n\n(Payment setup coming soon — please confirm if available.)`,
        });
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', convoId);
      }

      await createNotification({
        userId: viewer.creator_id,
        actorId: currentUserId,
        type: 'unlock',
        title: 'New shop order request',
        body: `${viewer.title} · £${Number(viewer.price).toFixed(2)}`,
        link: '/dashboard',
      });

      setBuySuccess(true);
      setBuyNote('');
    } catch (err: any) {
      console.error(err);
      setBuyError(err.message || 'Could not place order');
    } finally {
      setBuying(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-8">
          <div className="p-4 lg:p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
                <ShoppingBag className="text-pink-500" size={28} />
                Shop
              </h1>
              <p className="text-sm text-zinc-500">
                Physical items from creators · ships from the seller
              </p>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items or creators..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-pink-500 text-sm"
              />
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-thin">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${
                    category === c
                      ? 'bg-pink-600 border-pink-500 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-pulse"
                  >
                    <div className="aspect-square bg-zinc-800" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-zinc-800 rounded w-3/4" />
                      <div className="h-3 bg-zinc-800 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <Package className="mx-auto text-zinc-600 mb-3" size={40} />
                <p className="text-zinc-400 text-lg">No items found</p>
                <p className="text-zinc-500 text-sm mt-2">
                  {items.length === 0
                    ? 'Creators haven’t listed anything yet'
                    : 'Try another category or search'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
                {filtered.map((item) => {
                  const cover = item.photos[0];
                  const name =
                    item.creator?.display_name ||
                    item.creator?.username ||
                    'Creator';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openItem(item)}
                      className="text-left bg-zinc-900 border border-zinc-800 hover:border-pink-500/40 rounded-2xl overflow-hidden transition group"
                    >
                      <div className="aspect-square bg-zinc-800 relative overflow-hidden">
                        {cover ? (
                          <img
                            src={cover}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Package size={36} />
                          </div>
                        )}
                        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white px-2 py-0.5 rounded-full">
                          {item.category}
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-pink-400 font-semibold text-sm mt-0.5">
                          £{Number(item.price).toFixed(2)}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1 truncate">
                          {item.condition} · {name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Item detail modal */}
        {viewer && (
          <div
            className="fixed inset-0 z-[80] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setViewer(null)}
          >
            <div
              className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative aspect-square bg-zinc-800">
                {viewer.photos[photoIndex] ? (
                  <img
                    src={viewer.photos[photoIndex]}
                    alt={viewer.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <Package size={48} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X size={18} />
                </button>
                {viewer.photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevPhoto}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={nextPhoto}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {viewer.photos.map((_, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            i === photoIndex ? 'bg-pink-500' : 'bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">{viewer.title}</h2>
                  <p className="text-2xl font-bold text-pink-400 mt-1">
                    £{Number(viewer.price).toFixed(2)}
                  </p>
                  <p className="text-sm text-zinc-400 mt-1">
                    {viewer.category} · {viewer.condition}
                  </p>
                </div>

                {viewer.description && (
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {viewer.description}
                  </p>
                )}

                {viewer.creator && (
                  <Link
                    href={`/${viewer.creator.username}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 transition"
                    onClick={() => setViewer(null)}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-sm font-bold">
                      {viewer.creator.avatar_url ? (
                        <img
                          src={viewer.creator.avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        (viewer.creator.display_name || viewer.creator.username)
                          .charAt(0)
                          .toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {viewer.creator.display_name || viewer.creator.username}
                      </p>
                      <p className="text-xs text-zinc-500">
                        @{viewer.creator.username}
                      </p>
                    </div>
                  </Link>
                )}

                {viewer.creator_id === currentUserId ? (
                  <p className="text-center text-sm text-zinc-500 py-2">
                    This is your listing
                  </p>
                ) : buySuccess ? (
                  <div className="rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3 text-center">
                    <p className="text-green-400 font-medium text-sm">
                      Order requested
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      The creator was notified and messaged in chat
                    </p>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={buyNote}
                      onChange={(e) => setBuyNote(e.target.value)}
                      placeholder="Optional note (size, shipping info…)"
                      rows={2}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500 resize-none"
                    />
                    {buyError && (
                      <p className="text-sm text-red-400">{buyError}</p>
                    )}
                    <button
                      type="button"
                      onClick={requestBuy}
                      disabled={buying || !currentUserId}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 font-semibold transition disabled:opacity-50"
                    >
                      {buying ? 'Sending…' : 'Request to buy'}
                    </button>
                    <p className="text-center text-xs text-zinc-500">
                      No payment yet — creator confirms, then you arrange pay/ship
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
