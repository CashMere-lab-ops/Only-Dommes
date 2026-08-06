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

const CARRIERS = [
  {
    id: 'inpost',
    label: 'InPost',
    holdHours: 72,
    holdLabel: '72 hours',
  },
  {
    id: 'evri',
    label: 'Evri',
    holdHours: 240,
    holdLabel: '10 days',
  },
  {
    id: 'royal_mail',
    label: 'Royal Mail',
    holdHours: 168,
    holdLabel: '7 days',
  },
  {
    id: 'yodel',
    label: 'Yodel',
    holdHours: 168,
    holdLabel: '7 days',
  },
] as const;

const emptyPudo = {
  carrier: 'inpost' as string,
  point_name: '',
  point_id: '',
  point_postcode: '',
  point_town: '',
  point_line: '',
  collection_name: '',
  collection_phone: '',
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
  const [pudo, setPudo] = useState(emptyPudo);
  const [showPudo, setShowPudo] = useState(false);
  const [searchPostcode, setSearchPostcode] = useState('');
  const [pointResults, setPointResults] = useState<any[]>([]);
  const [searchingPoints, setSearchingPoints] = useState(false);
  const [searchHint, setSearchHint] = useState('');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

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
    setShowPudo(false);
      setPudo(emptyPudo);
    setPudo(emptyPudo);
  };

  const nextPhoto = () => {
    if (!viewer || viewer.photos.length < 2) return;
    setPhotoIndex((i) => (i + 1) % viewer.photos.length);
  };

  const prevPhoto = () => {
    if (!viewer || viewer.photos.length < 2) return;
    setPhotoIndex((i) => (i - 1 + viewer.photos.length) % viewer.photos.length);
  };

  const searchPoints = async () => {
    const pc = searchPostcode.trim();
    if (!pc || pc.replace(/\s/g, '').length < 5) {
      setSearchHint('Enter a full UK postcode');
      return;
    }
    setSearchingPoints(true);
    setSearchHint('');
    setPointResults([]);
    setSelectedPointId(null);
    try {
      const res = await fetch(
        `/api/shipping/points?carrier=${encodeURIComponent(pudo.carrier)}&postcode=${encodeURIComponent(pc)}`,
        { cache: 'no-store' }
      );
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        setSearchHint('Search returned an invalid response. Try again after deploy.');
        return;
      }
      if (data.error) {
        setSearchHint(data.error);
      } else if (data.message) {
        setSearchHint(data.message);
      }
      setPointResults(Array.isArray(data.points) ? data.points : []);
      if (
        data.live &&
        (!data.points || data.points.length === 0) &&
        !data.error &&
        !data.message
      ) {
        setSearchHint('No points found near that postcode');
      }
    } catch (e: any) {
      setSearchHint(e?.message || 'Could not search points');
    } finally {
      setSearchingPoints(false);
    }
  };

  const selectPoint = (pt: any) => {
    setSelectedPointId(pt.id);
    setPudo((prev) => ({
      ...prev,
      point_id: pt.id || '',
      point_name: pt.name || '',
      point_line: pt.line || '',
      point_town: pt.town || '',
      point_postcode: pt.postcode || searchPostcode.trim(),
    }));
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
    if (!showPudo) {
      setShowPudo(true);
      return;
    }
    if (
      !pudo.carrier ||
      !pudo.point_name.trim() ||
      !pudo.point_postcode.trim() ||
      !pudo.point_town.trim() ||
      !pudo.collection_name.trim() ||
      !pudo.collection_phone.trim()
    ) {
      setBuyError('Please complete pick-up point details');
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

      const carrierMeta = CARRIERS.find((c) => c.id === pudo.carrier) || CARRIERS[0];
      const deadline = new Date(
        Date.now() + carrierMeta.holdHours * 60 * 60 * 1000
      ).toISOString();

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
          shipping_country: 'United Kingdom',
          shipping_county: pudo.point_town.trim(),
          shipping_city: pudo.point_town.trim(),
          shipping_carrier: pudo.carrier,
          shipping_point_name: pudo.point_name.trim(),
          shipping_point_id: pudo.point_id.trim() || null,
          shipping_point_postcode: pudo.point_postcode.trim(),
          shipping_point_town: pudo.point_town.trim(),
          shipping_point_line: pudo.point_line.trim() || null,
          collection_name: pudo.collection_name.trim(),
          collection_phone: pudo.collection_phone.trim(),
          collection_deadline: deadline,
        })
        .select()
        .single();
      if (error) throw error;

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
          `ship:${pudo.carrier} · ${pudo.point_name.trim()} · ${pudo.point_town.trim()}`,
          'Locker / pick-up only — no home delivery',
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
      setShowPudo(false);
      setPudo(emptyPudo);
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
                Lockers & pick-up points only · no home delivery
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
                    <span className="text-zinc-200 font-medium">Locker & pick-up only.</span>{' '}
                    No home delivery. Seller drops off at a point; you collect from yours. Home addresses are not used.
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
                      Creator notified · pick-up point saved
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
                    {!showPudo ? (
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
                          Continue to pick-up
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-zinc-200">
                          Choose carrier & pick-up point
                        </p>
                        <p className="text-xs text-zinc-500">
                          Home delivery is not available. Collect from a locker or
                          parcel shop. Uncollected parcels auto-cancel after the
                          carrier hold time.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {CARRIERS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setPudo({ ...pudo, carrier: c.id });
                                setPointResults([]);
                                setSelectedPointId(null);
                                setSearchHint('');
                              }}
                              className={`text-left px-3 py-2.5 rounded-xl border text-sm transition ${
                                pudo.carrier === c.id
                                  ? 'border-pink-500 bg-pink-500/10 text-white'
                                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600'
                              }`}
                            >
                              <span className="font-medium block">{c.label}</span>
                              <span className="text-[11px] text-zinc-500">
                                Hold {c.holdLabel}
                                {c.id === 'inpost' ? ' · live map' : ''}
                              </span>
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <input
                            value={searchPostcode}
                            onChange={(e) => setSearchPostcode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchPoints();
                              }
                            }}
                            placeholder="Your postcode e.g. M1 1AE"
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                          />
                          <button
                            type="button"
                            onClick={searchPoints}
                            disabled={searchingPoints}
                            className="px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-600 text-sm font-medium hover:border-pink-500 transition disabled:opacity-50"
                          >
                            {searchingPoints ? '…' : 'Find'}
                          </button>
                        </div>

                        {searchHint && (
                          <p className="text-xs text-zinc-400">{searchHint}</p>
                        )}

                        {pointResults.length > 0 && (
                          <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-zinc-800 p-1.5">
                            {pointResults.map((pt) => (
                              <button
                                key={pt.id}
                                type="button"
                                onClick={() => selectPoint(pt)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition ${
                                  selectedPointId === pt.id
                                    ? 'bg-pink-600/20 border border-pink-500'
                                    : 'bg-zinc-800/80 border border-transparent hover:border-zinc-600'
                                }`}
                              >
                                <span className="font-medium text-zinc-100 block">
                                  {pt.name}
                                </span>
                                <span className="text-xs text-zinc-400 block">
                                  {[pt.line, pt.town, pt.postcode]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                                {pt.meta && (
                                  <span className="text-[10px] text-zinc-500">
                                    Availability {pt.meta}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {selectedPointId && (
                          <p className="text-xs text-pink-400">
                            Selected: {pudo.point_name}
                          </p>
                        )}

                        {/* Manual fallback / edit */}
                        <p className="text-[11px] text-zinc-500 pt-1">
                          {pudo.carrier === 'inpost'
                            ? 'Or type a point manually if search misses it'
                            : 'Enter your collect point details below'}
                        </p>
                        <input
                          value={pudo.point_name}
                          onChange={(e) =>
                            setPudo({ ...pudo, point_name: e.target.value })
                          }
                          placeholder="Locker / shop name"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <input
                          value={pudo.point_id}
                          onChange={(e) =>
                            setPudo({ ...pudo, point_id: e.target.value })
                          }
                          placeholder="Point ID (optional)"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <input
                          value={pudo.point_line}
                          onChange={(e) =>
                            setPudo({ ...pudo, point_line: e.target.value })
                          }
                          placeholder="Point address line (optional)"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={pudo.point_town}
                            onChange={(e) =>
                              setPudo({ ...pudo, point_town: e.target.value })
                            }
                            placeholder="Town"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                          />
                          <input
                            value={pudo.point_postcode}
                            onChange={(e) =>
                              setPudo({ ...pudo, point_postcode: e.target.value })
                            }
                            placeholder="Postcode"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                          />
                        </div>
                        <input
                          value={pudo.collection_name}
                          onChange={(e) =>
                            setPudo({ ...pudo, collection_name: e.target.value })
                          }
                          placeholder="Name for collection"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        <input
                          value={pudo.collection_phone}
                          onChange={(e) =>
                            setPudo({ ...pudo, collection_phone: e.target.value })
                          }
                          placeholder="Mobile for collection SMS"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                        />
                        {buyError && (
                          <p className="text-sm text-red-400">{buyError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowPudo(false)}
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
