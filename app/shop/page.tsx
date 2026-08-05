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
  Shield,
  Lock,
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
  reserved_for_id?: string | null;
  reserved_for_username?: string | null;
  created_at: string;
  creator?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

const emptyAddress = {
  full_name: '',
  line1: '',
  line2: '',
  city: '',
  county: '',
  postcode: '',
  country: 'United Kingdom',
  phone: '',
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
  const [address, setAddress] = useState(emptyAddress);
  const [showAddress, setShowAddress] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      // Public: available + reserved (sold/hidden hidden by RLS for non-owners)
      const { data, error } = await supabase
        .from('shop_items')
        .select('*')
        .in('status', ['available', 'reserved'])
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

  const canBuyItem = (item: ShopItem) => {
    if (!currentUserId) return false;
    if (item.creator_id === currentUserId) return false;
    if (item.status === 'sold' || item.status === 'hidden') return false;
    if (item.status === 'reserved') {
      return item.reserved_for_id === currentUserId;
    }
    return item.status === 'available';
  };

  const openItem = (item: ShopItem) => {
    setViewer(item);
    setPhotoIndex(0);
    setBuySuccess(false);
    setBuyError('');
    setBuyNote('');
    setShowAddress(false);
    setAddress(emptyAddress);
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
    if (!canBuyItem(viewer)) {
      setBuyError(
        viewer.status === 'reserved'
          ? 'This item is reserved for another buyer'
          : 'This item is not available'
      );
      return;
    }
    if (!showAddress) {
      setShowAddress(true);
      return;
    }
    if (
      !address.full_name.trim() ||
      !address.line1.trim() ||
      !address.city.trim() ||
      !address.county.trim() ||
      !address.postcode.trim() ||
      !address.country.trim()
    ) {
      setBuyError('Please complete your shipping details');
      return;
    }

    setBuying(true);
    setBuyError('');
    setBuySuccess(false);
    try {
      // Re-check item still available / reserved for me
      const { data: fresh } = await supabase
        .from('shop_items')
        .select('id, status, reserved_for_id, creator_id, title, price, category, condition, photos')
        .eq('id', viewer.id)
        .single();
      if (!fresh) throw new Error('Item not found');
      if (fresh.status === 'sold' || fresh.status === 'hidden') {
        throw new Error('This item is no longer available');
      }
      if (
        fresh.status === 'reserved' &&
        fresh.reserved_for_id !== currentUserId
      ) {
        throw new Error('This item is reserved for another buyer');
      }

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
          // Only county/country visible to creator — never full address
          shipping_city: address.city.trim(),
          shipping_county: address.county.trim(),
          shipping_country: address.country.trim(),
        })
        .select()
        .single();
      if (error) throw error;

      // Full address — buyer only (creators have no RLS access)
      const { error: addrErr } = await supabase.from('shop_order_addresses').insert({
        order_id: order.id,
        buyer_id: currentUserId,
        full_name: address.full_name.trim(),
        line1: address.line1.trim(),
        line2: address.line2.trim() || null,
        city: address.city.trim(),
        region: address.county.trim() || null,
        postcode: address.postcode.trim(),
        country: address.country.trim(),
        phone: address.phone.trim() || null,
      });
      if (addrErr) throw addrErr;

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
        const cover = viewer.photos?.[0] || null;
        const noteLine = buyNote.trim() ? buyNote.trim() : '';
        const content = [
          '🛒 ORDER_REQUEST',
          `order:${order.id}`,
          `title:${viewer.title}`,
          `price:${Number(viewer.price).toFixed(2)}`,
          `category:${viewer.category || ''}`,
          `condition:${viewer.condition || ''}`,
          noteLine ? `note:${noteLine}` : '',
          `ship:${address.county.trim()}, ${address.country.trim()}`,
          'Address is private — ship via platform label',
          'Open Dashboard → Accept or Decline',
        ]
          .filter(Boolean)
          .join('\n');

        await supabase.from('messages').insert({
          conversation_id: convoId,
          sender_id: currentUserId,
          content,
          media_url: cover,
          media_type: 'order_request',
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
      setShowAddress(false);
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
              <p className="text-sm text-zinc-500 flex items-center gap-1.5">
                <Shield size={14} className="text-pink-400" />
                Private shipping · your address stays hidden from creators
              </p>
            </div>

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

            <div className="flex gap-2 overflow-x-auto pb-3 mb-6">
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
                  const isReserved = item.status === 'reserved';
                  const reservedForMe =
                    isReserved && item.reserved_for_id === currentUserId;
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
                        {isReserved && (
                          <span
                            className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              reservedForMe
                                ? 'bg-pink-600 text-white'
                                : 'bg-amber-500/90 text-black'
                            }`}
                          >
                            {reservedForMe ? 'Reserved for you' : 'Reserved'}
                          </span>
                        )}
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
                {viewer.status === 'reserved' && (
                  <span className="absolute top-3 left-3 text-xs font-semibold bg-amber-500 text-black px-2.5 py-1 rounded-full">
                    {viewer.reserved_for_id === currentUserId
                      ? 'Reserved for you'
                      : 'Reserved'}
                  </span>
                )}
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

                <div className="flex items-start gap-2 text-xs text-zinc-400 bg-zinc-800/50 rounded-xl px-3 py-2.5">
                  <Lock size={14} className="text-pink-400 mt-0.5 flex-shrink-0" />
                  <p>
                    <span className="text-zinc-200 font-medium">Private shipping.</span>{' '}
                    Your full address is never shown to the creator. They only see
                    city & country. Labels are handled like Vinted — platform-protected.
                  </p>
                </div>

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
                      Creator notified · address stored privately
                    </p>
                  </div>
                ) : !canBuyItem(viewer) ? (
                  <p className="text-center text-sm text-amber-400/90 py-2">
                    {viewer.status === 'reserved'
                      ? 'Reserved for another buyer'
                      : 'Not available'}
                  </p>
                ) : (
                  <>
                    {!showAddress ? (
                      <>
                        <textarea
                          value={buyNote}
                          onChange={(e) => setBuyNote(e.target.value)}
                          placeholder="Optional note to the creator…"
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
                          Continue to shipping
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-zinc-200">
                          Shipping address (private)
                        </p>
                        <input
                          value={address.full_name}
                          onChange={(e) =>
                            setAddress({ ...address, full_name: e.target.value })
                          }
                          placeholder="Full name"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <input
                          value={address.line1}
                          onChange={(e) =>
                            setAddress({ ...address, line1: e.target.value })
                          }
                          placeholder="Address line 1"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <input
                          value={address.line2}
                          onChange={(e) =>
                            setAddress({ ...address, line2: e.target.value })
                          }
                          placeholder="Address line 2 (optional)"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <input
                          value={address.city}
                          onChange={(e) =>
                            setAddress({ ...address, city: e.target.value })
                          }
                          placeholder="Town / city"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={address.county}
                            onChange={(e) =>
                              setAddress({ ...address, county: e.target.value })
                            }
                            placeholder="County"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                          />
                          <input
                            value={address.postcode}
                            onChange={(e) =>
                              setAddress({ ...address, postcode: e.target.value })
                            }
                            placeholder="Postcode"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                          />
                        </div>
                        <input
                          value={address.country}
                          onChange={(e) =>
                            setAddress({ ...address, country: e.target.value })
                          }
                          placeholder="Country"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <input
                          value={address.phone}
                          onChange={(e) =>
                            setAddress({ ...address, phone: e.target.value })
                          }
                          placeholder="Phone (optional)"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        {buyError && (
                          <p className="text-sm text-red-400">{buyError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddress(false)}
                            className="flex-1 py-3 rounded-xl border border-zinc-700 text-sm"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={requestBuy}
                            disabled={buying}
                            className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold text-sm disabled:opacity-50"
                          >
                            {buying ? 'Sending…' : 'Request to buy'}
                          </button>
                        </div>
                      </div>
                    )}
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
