'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  DollarSign, TrendingUp, Film, Plus, Radio, Wallet, Eye,
  ShoppingBag, X, Settings, Package, Pencil, Trash2, Image as ImageIcon,
  ChevronLeft, ChevronRight, ChevronDown, Heart, Users, Clock, Search, Phone,
  Download, ArrowDownLeft, ArrowUpRight, List
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';
import { notifyBalanceUpdated } from '../../lib/wallet';

type Item = {
  id: string;
  creator_id?: string;
  title: string;
  description?: string | null;
  price: number;
  category: string;
  condition: string;
  photos: string[];
  status?: 'available' | 'reserved' | 'sold' | 'hidden';
  reserved_for_id?: string | null;
  reserved_for_username?: string | null;
  created_at?: string;
};

const MIN_PAYOUT = 100;

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
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [clipThumb, setClipThumb] = useState<File | null>(null);
  const [clipCompressPct, setClipCompressPct] = useState(0);
  const [clipCompressStatus, setClipCompressStatus] = useState('');
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
    subscriptionsEnabled: false,
    subscriptionPrice: 9.99,
    messagePrice: 0,
    minTipGbp: 2,
    livePrivateEnabled: true,
    privatePerMinute: 8,
    minPrivateMinutes: 5,
    voiceCallsEnabled: false,
    voiceRate: 3,
    voiceMinMinutes: 3,
    voiceMaxMinutes: 30,
    tipMenuEnabled: true,
  });
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingMsg, setPricingMsg] = useState('');
  const [myClips, setMyClips] = useState<
    {
      id: string;
      title: string;
      price: number;
      sales: number;
      thumbnail_url?: string | null;
      video_url?: string;
      is_published?: boolean;
    }[]
  >([]);
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [itemFilter, setItemFilter] = useState<'all' | 'available' | 'reserved' | 'sold' | 'hidden'>('all');
  const [reserveUsername, setReserveUsername] = useState('');
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [reserveResults, setReserveResults] = useState<any[]>([]);
  const [reserveSearching, setReserveSearching] = useState(false);
  const [selectedReserveUser, setSelectedReserveUser] = useState<{
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null>(null);

  useEffect(() => {
    const q = reserveUsername.trim().toLowerCase().replace(/^@/, '');
    if (q.length < 3) {
      setReserveResults([]);
      setReserveSearching(false);
      return;
    }
    let cancelled = false;
    setReserveSearching(true);
    const t = window.setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `${q}%`)
        .limit(8);
      if (!cancelled) {
        setReserveResults(data || []);
        setReserveSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [reserveUsername]);
  const [shopOrders, setShopOrders] = useState<any[]>([]);
  const [buyerOrders, setBuyerOrders] = useState<any[]>([]);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [showAllBuyerOrders, setShowAllBuyerOrders] = useState(false);
  const [showAllShopOrders, setShowAllShopOrders] = useState(false);

  const formatCallDuration = (secs?: number) => {
    if (!secs || secs < 1) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatCallDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  };

  const orderStatusClass = (status: string) => {
    switch (status) {
      case 'label_ready':
        return 'bg-pink-500/20 text-pink-300';
      case 'requested':
        return 'bg-zinc-800 text-zinc-300';
      case 'accepted':
      case 'awaiting_payment':
        return 'bg-pink-500/15 text-pink-400';
      case 'paid':
        return 'bg-emerald-500/15 text-emerald-400';
      case 'shipped':
        return 'bg-amber-500/15 text-amber-400';
      case 'completed':
        return 'bg-green-500/15 text-green-400';
      case 'cancelled':
        return 'bg-red-500/10 text-red-400';
      default:
        return 'bg-zinc-800 text-zinc-400';
    }
  };

  const shopEscrow = async (
    orderId: string,
    action: 'accept' | 'release' | 'refund'
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please log in again');
    const res = await fetch('/api/wallet/shop-escrow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, order_id: orderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Escrow action failed');
    return data;
  };

  const [trackingDraft, setTrackingDraft] = useState<Record<string, string>>({});
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [subCount, setSubCount] = useState(0);
  const [mySubscriptions, setMySubscriptions] = useState<any[]>([]);
  const [mySubCount, setMySubCount] = useState(0);
  const [spentThisMonth, setSpentThisMonth] = useState(0);
  const [clipsOwned, setClipsOwned] = useState(0);
  const [earnToday, setEarnToday] = useState(0);
  const [earnWeek, setEarnWeek] = useState(0);
  const [earnMonth, setEarnMonth] = useState(0);
  const [earnAllTime, setEarnAllTime] = useState(0);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [payoutErr, setPayoutErr] = useState('');
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [recentTips, setRecentTips] = useState<
    {
      id: string;
      amount_gbp: number;
      created_at: string;
      description?: string | null;
      from_name: string;
      from_username?: string | null;
      from_avatar?: string | null;
    }[]
  >([]);
  const [allTxs, setAllTxs] = useState<any[]>([]);
  const [txFilter, setTxFilter] = useState<
    'all' | 'in' | 'out' | 'tips' | 'clips' | 'topup' | 'payout'
  >('all');
  const txSectionRef = useRef<HTMLDivElement | null>(null);
  const [txOpen, setTxOpen] = useState(false);

  const money = (n: number) =>
    `£${Number(n || 0).toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const txLabel = (type: string) => {
    const map: Record<string, string> = {
      tip_received: 'Tip received',
      tip_sent: 'Tip sent',
      clip_received: 'Clip sale',
      clip_sent: 'Clip purchase',
      unlock_received: 'Media unlock',
      unlock_sent: 'Unlocked media',
      call_received: 'Voice call earned',
      call_sent: 'Voice call paid',
      shop_received: 'Shop sale',
      shop_sent: 'Shop purchase',
      shop_held: 'Shop funds held',
      shop_released: 'Shop funds released',
      shop_refund: 'Shop refund',
      top_up: 'Wallet top-up',
      topup: 'Wallet top-up',
      payout: 'Payout',
      payout_requested: 'Payout requested',
      payout_paid: 'Payout sent',
      subscription_received: 'Subscription',
      subscription_sent: 'Subscription payment',
    };
    return map[type] || type.replace(/_/g, ' ');
  };

  const filteredTxs = allTxs.filter((tx) => {
    const amt = Number(tx.amount_gbp || 0);
    const t = String(tx.type || '');
    if (txFilter === 'all') return true;
    if (txFilter === 'in') return amt > 0;
    if (txFilter === 'out') return amt < 0;
    if (txFilter === 'tips') return t.includes('tip');
    if (txFilter === 'clips') return t.includes('clip');
    if (txFilter === 'topup') return t.includes('top');
    if (txFilter === 'payout') return t.includes('payout');
    return true;
  });

  const exportTxCsv = () => {
    const rows = filteredTxs.length ? filteredTxs : allTxs;
    if (!rows.length) {
      alert('No transactions to export');
      return;
    }
    const header = [
      'Date',
      'Type',
      'Label',
      'Amount GBP',
      'Balance after',
      'Description',
      'Reference',
    ];
    const lines = rows.map((tx) => {
      const d = tx.created_at
        ? new Date(tx.created_at).toISOString()
        : '';
      const cells = [
        d,
        tx.type || '',
        txLabel(String(tx.type || '')),
        Number(tx.amount_gbp || 0).toFixed(2),
        tx.balance_after != null ? Number(tx.balance_after).toFixed(2) : '',
        (tx.description || '').replace(/"/g, '""'),
        tx.reference_id || '',
      ];
      return cells.map((c) => `"${c}"`).join(',');
    });
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-of-dommes-transactions-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToTransactions = () => {
    setTxFilter('all');
    setTxOpen(true);
    setTimeout(() => {
      txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const savePricing = async () => {
    if (!profile?.id) return;
    setPricingSaving(true);
    setPricingMsg('');
    const mt = Math.min(500, Math.max(2, Number(pricing.minTipGbp) || 2));
    const { error } = await supabase
      .from('profiles')
      .update({
        subscriptions_enabled: pricing.subscriptionsEnabled,
        subscription_price: Number(pricing.subscriptionPrice) || 0,
        message_price: Number(pricing.messagePrice) || 0,
        min_tip_gbp: mt,
        live_private_enabled: pricing.livePrivateEnabled,
        live_private_rate_per_minute: Number(pricing.privatePerMinute) || 0,
        live_private_min_minutes: Math.max(1, Number(pricing.minPrivateMinutes) || 5),
        voice_calls_enabled: pricing.voiceCallsEnabled,
        voice_rate_per_minute: Number(pricing.voiceRate) || 0,
        voice_min_minutes: Math.min(15, Math.max(1, Number(pricing.voiceMinMinutes) || 3)),
        voice_max_minutes: Math.min(120, Math.max(5, Number(pricing.voiceMaxMinutes) || 30)),
      })
      .eq('id', profile.id);
    setPricingSaving(false);
    setPricingMsg(error ? error.message : 'Pricing saved');
    if (!error) {
      setTimeout(() => setPricingMsg(''), 2500);
    }
  };

  const openPayoutModal = () => {
    const bal = Number(profile?.balance_gbp || 0);
    setPayoutAmount(bal >= MIN_PAYOUT ? bal.toFixed(2) : '');
    setPayoutMsg('');
    setPayoutErr('');
    setShowPayoutModal(true);
  };

  const requestPayout = async () => {
    setPayoutLoading(true);
    setPayoutErr('');
    setPayoutMsg('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPayoutErr('Please log in again');
        setPayoutLoading(false);
        return;
      }
      const amountNum = Number(payoutAmount);
      const res = await fetch('/api/wallet/payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: Number.isFinite(amountNum) ? amountNum : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPayoutErr(data.error || 'Payout request failed');
        setPayoutLoading(false);
        return;
      }
      setPayoutMsg(data.message || 'Payout requested');
      if (typeof data.balance === 'number') {
        setProfile((p: any) => (p ? { ...p, balance_gbp: data.balance } : p));
        notifyBalanceUpdated(data.balance);
      }
      if (data.payout) {
        setPayoutHistory((prev) => [data.payout, ...prev]);
      }
    } catch {
      setPayoutErr('Network error — try again');
    }
    setPayoutLoading(false);
  };

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
        setPricing({
          subscriptionsEnabled: !!data.subscriptions_enabled,
          subscriptionPrice: Number(data.subscription_price ?? 9.99),
          messagePrice: Number(data.message_price ?? 0),
          minTipGbp: Number(data.min_tip_gbp ?? 2),
          livePrivateEnabled: data.live_private_enabled !== false,
          privatePerMinute: Number(
            data.live_private_rate_per_minute ?? data.voice_rate_per_minute ?? 8
          ),
          minPrivateMinutes: Number(
            data.live_private_min_minutes ?? data.voice_min_minutes ?? 5
          ),
          voiceCallsEnabled: !!data.voice_calls_enabled,
          voiceRate: Number(data.voice_rate_per_minute ?? 3),
          voiceMinMinutes: Number(data.voice_min_minutes ?? 3),
          voiceMaxMinutes: Number(data.voice_max_minutes ?? 30),
          tipMenuEnabled: data.tip_menu_enabled !== false,
        });
      }

      // Creator earnings from wallet ledger (tips, unlocks, calls, shop)
      if (data?.account_type === 'creator') {
        const { data: txs } = await supabase
          .from('wallet_transactions')
          .select('amount_gbp, type, created_at')
          .eq('user_id', user.id)
          .in('type', [
            'tip_received',
            'unlock_received',
            'call_received',
            'shop_received',
          ])
          .order('created_at', { ascending: false })
          .limit(500);

        const now = new Date();
        const startOfToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const day = now.getDay(); // 0 Sun
        const mondayOffset = day === 0 ? 6 : day - 1;
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let t = 0;
        let w = 0;
        let m = 0;
        let all = 0;
        (txs || []).forEach((tx: any) => {
          const amt = Number(tx.amount_gbp || 0);
          if (amt <= 0) return;
          all += amt;
          const when = new Date(tx.created_at);
          if (when >= startOfToday) t += amt;
          if (when >= startOfWeek) w += amt;
          if (when >= startOfMonth) m += amt;
        });
        setEarnToday(Math.round(t * 100) / 100);
        setEarnWeek(Math.round(w * 100) / 100);
        setEarnMonth(Math.round(m * 100) / 100);
        setEarnAllTime(Math.round(all * 100) / 100);

        // My clips
        const { data: clipRows } = await supabase
          .from('clips')
          .select(
            'id, title, price_gbp, sales_count, thumbnail_url, video_url, is_published'
          )
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        setMyClips(
          (clipRows || []).map((c: any) => ({
            id: c.id,
            title: c.title,
            price: Number(c.price_gbp || 0),
            sales: Number(c.sales_count || 0),
            thumbnail_url: c.thumbnail_url,
            video_url: c.video_url,
            is_published: c.is_published,
          }))
        );

        // Recent tips (with tipper profile)
        const { data: tipRows } = await supabase
          .from('wallet_transactions')
          .select(
            'id, amount_gbp, created_at, description, counterparty_id'
          )
          .eq('user_id', user.id)
          .eq('type', 'tip_received')
          .order('created_at', { ascending: false })
          .limit(20);

        if (tipRows && tipRows.length > 0) {
          const tipperIds = [
            ...new Set(
              tipRows
                .map((r: any) => r.counterparty_id)
                .filter(Boolean)
            ),
          ];
          let tipperMap = new Map<string, any>();
          if (tipperIds.length > 0) {
            const { data: tippers } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .in('id', tipperIds);
            tipperMap = new Map(
              (tippers || []).map((p: any) => [p.id, p])
            );
          }
          setRecentTips(
            tipRows.map((r: any) => {
              const p = tipperMap.get(r.counterparty_id);
              return {
                id: r.id,
                amount_gbp: Number(r.amount_gbp || 0),
                created_at: r.created_at,
                description: r.description,
                from_name:
                  p?.display_name || p?.username || 'Subscriber',
                from_username: p?.username || null,
                from_avatar: p?.avatar_url || null,
              };
            })
          );
        } else {
          setRecentTips([]);
        }

        // Payout history
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) {
            const pr = await fetch('/api/wallet/payout', {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            });
            if (pr.ok) {
              const pj = await pr.json();
              setPayoutHistory(pj.requests || []);
            }
          }
        } catch {
          /* ignore */
        }
      }

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
          .limit(40);
        // Hide draft orders that never held funds (failed payments)
        setShopOrders(
          (orders || []).filter(
            (o: any) =>
              o.funds_status === 'held' ||
              o.funds_status === 'pending_creator' ||
              o.funds_status === 'released' ||
              o.funds_status === 'refunded' ||
              o.status === 'paid' ||
              o.status === 'label_ready' ||
              o.status === 'shipped' ||
              o.status === 'completed'
          )
        );
      }

      // Orders this user placed as buyer
      const { data: myBuys } = await supabase
        .from('shop_orders')
        .select('*')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      setBuyerOrders(myBuys || []);

      // Full wallet ledger (subs + creators)
      const { data: ledger } = await supabase
        .from('wallet_transactions')
        .select(
          'id, type, amount_gbp, balance_after, description, reference_type, reference_id, counterparty_id, created_at'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(300);
      setAllTxs(ledger || []);

      // Sub stats: spent this month + clips owned
      {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        let spent = 0;
        for (const row of ledger || []) {
          const created = new Date(row.created_at);
          if (created < monthStart) continue;
          const amt = Number(row.amount_gbp || 0);
          // Money leaving the wallet (tips, clips, unlocks, calls, shop, subs)
          if (amt < 0) spent += Math.abs(amt);
        }
        setSpentThisMonth(Math.round(spent * 100) / 100);

        const { count: ownedCount } = await supabase
          .from('clip_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('buyer_id', user.id);
        setClipsOwned(ownedCount || 0);
      }

      // Recent voice calls (sub or creator)
      const { data: callRows } = await supabase
        .from('voice_calls')
        .select('*')
        .or(`creator_id.eq.${user.id},subscriber_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (callRows && callRows.length > 0) {
        const otherIds = [
          ...new Set(
            callRows.map((c: any) =>
              c.creator_id === user.id ? c.subscriber_id : c.creator_id
            )
          ),
        ];
        const { data: callProfiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', otherIds);
        const cmap = new Map((callProfiles || []).map((p: any) => [p.id, p]));
        setRecentCalls(
          callRows.map((c: any) => {
            const otherId =
              c.creator_id === user.id ? c.subscriber_id : c.creator_id;
            return { ...c, other: cmap.get(otherId) || null };
          })
        );
      } else {
        setRecentCalls([]);
      }

      setLoading(false);
    };
    loadProfile();

    // Live tips: realtime + short poll backup
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const mergeWalletRow = async (row: any, userId: string) => {
      if (!row) return;
      if (row.user_id && row.user_id !== userId) return;

      setAllTxs((prev) => {
        if (prev.some((t) => t.id === row.id)) return prev;
        return [row, ...prev].slice(0, 300);
      });

      const amt = Number(row.amount_gbp || 0);
      const created = new Date(row.created_at || Date.now());
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const inThisMonth = created >= monthStart;

      // Sub spend (money out)
      if (amt < 0 && inThisMonth) {
        setSpentThisMonth((v) => Math.round((v + Math.abs(amt)) * 100) / 100);
      }

      // Clip purchase → bump owned count
      if (row.type === 'clip_sent') {
        setClipsOwned((v) => v + 1);
      }

      // Creator tips still feed recent tips + earnings
      if (row.type === 'tip_received') {
        let from_name = 'Subscriber';
        let from_username: string | null = null;
        let from_avatar: string | null = null;
        if (row.counterparty_id) {
          const { data: p } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', row.counterparty_id)
            .maybeSingle();
          if (p) {
            from_name = p.display_name || p.username || from_name;
            from_username = p.username;
            from_avatar = p.avatar_url;
          }
        }

        const tip = {
          id: String(row.id),
          amount_gbp: Number(row.amount_gbp || 0),
          created_at: row.created_at || new Date().toISOString(),
          description: row.description,
          from_name,
          from_username,
          from_avatar,
        };

        setRecentTips((prev) => {
          if (prev.some((t) => t.id === tip.id)) return prev;
          return [tip, ...prev].slice(0, 20);
        });

        if (amt > 0) {
          setEarnToday((v) => Math.round((v + amt) * 100) / 100);
          setEarnWeek((v) => Math.round((v + amt) * 100) / 100);
          setEarnMonth((v) => Math.round((v + amt) * 100) / 100);
          setEarnAllTime((v) => Math.round((v + amt) * 100) / 100);
        }
      }

      if (typeof row.balance_after === 'number') {
        setProfile((p: any) =>
          p ? { ...p, balance_gbp: row.balance_after } : p
        );
        notifyBalanceUpdated(Number(row.balance_after));
      }
    };

    const refreshTipsQuiet = async (userId: string) => {
      const { data: tipRows } = await supabase
        .from('wallet_transactions')
        .select('id, amount_gbp, created_at, description, counterparty_id')
        .eq('user_id', userId)
        .eq('type', 'tip_received')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!tipRows) return;

      const tipperIds = [
        ...new Set(
          tipRows.map((r: any) => r.counterparty_id).filter(Boolean)
        ),
      ];
      let tipperMap = new Map<string, any>();
      if (tipperIds.length > 0) {
        const { data: tippers } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', tipperIds);
        tipperMap = new Map((tippers || []).map((p: any) => [p.id, p]));
      }

      setRecentTips(
        tipRows.map((r: any) => {
          const p = tipperMap.get(r.counterparty_id);
          return {
            id: r.id,
            amount_gbp: Number(r.amount_gbp || 0),
            created_at: r.created_at,
            description: r.description,
            from_name: p?.display_name || p?.username || 'Subscriber',
            from_username: p?.username || null,
            from_avatar: p?.avatar_url || null,
          };
        })
      );
    };

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      channel = supabase
        .channel(`dashboard-tips-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'wallet_transactions',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            mergeWalletRow(payload.new, user.id);
          }
        )
        .subscribe((status) => {
          // If realtime isn't enabled, status may be CHANNEL_ERROR / TIMED_OUT
          if (status === 'SUBSCRIBED') {
            console.log('[tips] realtime connected');
          }
        });

      // Backup: refresh tips + sub stats while dashboard is open
      pollTimer = setInterval(async () => {
        refreshTipsQuiet(user.id);
        // Spent this month + clips owned (sub dashboard)
        const { data: recentLedger } = await supabase
          .from('wallet_transactions')
          .select('amount_gbp, created_at, type')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(300);
        if (recentLedger) {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          let spent = 0;
          for (const row of recentLedger) {
            if (new Date(row.created_at) < monthStart) continue;
            const a = Number(row.amount_gbp || 0);
            if (a < 0) spent += Math.abs(a);
          }
          setSpentThisMonth(Math.round(spent * 100) / 100);
        }
        const { count } = await supabase
          .from('clip_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('buyer_id', user.id);
        setClipsOwned(count || 0);
      }, 12000);
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const displayName = profile?.display_name || profile?.username || 'User';
  const isCreator = profile?.account_type === 'creator';

  const tipTimeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  };

  const handleCreateClip = async () => {
    if (!clipForm.title.trim()) return;
    if (!clipFile) {
      alert('Please choose a video file');
      return;
    }
    if (!profile?.id) return;
    if (profile.account_type !== 'creator') {
      alert('Only creators can upload clips');
      return;
    }

    // Mux handles encoding; keep a hard ceiling so uploads don't hang forever
    const maxBytes = 2 * 1024 * 1024 * 1024; // 2GB
    if (clipFile.size > maxBytes) {
      alert('Video must be under 2GB.');
      return;
    }

    setCreating(true);
    setClipCompressPct(5);
    setClipCompressStatus('Getting secure upload…');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please log in again');
      }

      // 1) Create Mux direct upload
      const createRes = await fetch('/api/mux/create-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          cors_origin:
            typeof window !== 'undefined' ? window.location.origin : '*',
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.uploadUrl) {
        throw new Error(createJson.error || 'Could not start Mux upload');
      }

      const { uploadId, uploadUrl } = createJson;

      // 2) PUT file straight to Mux (progress via xhr)
      setClipCompressStatus('Uploading to Mux…');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader(
          'Content-Type',
          clipFile.type || 'application/octet-stream'
        );
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 70) + 5; // 5–75
          setClipCompressPct(Math.min(pct, 75));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(clipFile);
      });

      // 3) Poll until Mux asset is ready
      setClipCompressStatus('Processing video…');
      setClipCompressPct(80);

      let ready: {
        videoUrl: string;
        thumbnailUrl: string;
        playbackId: string;
        assetId: string;
        duration: number | null;
      } | null = null;

      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const stRes = await fetch(
          `/api/mux/asset-status?uploadId=${encodeURIComponent(uploadId)}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );
        const st = await stRes.json();
        if (!stRes.ok) throw new Error(st.error || 'Status check failed');

        if (st.ready && st.videoUrl && st.playbackId) {
          ready = {
            videoUrl: st.videoUrl,
            thumbnailUrl: st.thumbnailUrl,
            playbackId: st.playbackId,
            assetId: st.assetId,
            duration: st.duration ?? null,
          };
          break;
        }
        if (st.status === 'errored' || st.status === 'cancelled') {
          throw new Error('Mux could not process this video');
        }
        setClipCompressPct(Math.min(80 + i, 95));
        setClipCompressStatus(`Processing video… (${st.status || 'waiting'})`);
      }

      if (!ready) {
        throw new Error(
          'Processing is taking longer than expected. Try again in a minute.'
        );
      }

      setClipCompressPct(97);
      setClipCompressStatus('Saving clip…');

      // Optional custom thumbnail still goes to Supabase storage
      let thumbUrl: string | null = ready.thumbnailUrl || null;
      if (clipThumb) {
        const tExt = clipThumb.name.split('.').pop() || 'jpg';
        const tPath = `${profile.id}/thumbs/${Date.now()}.${tExt}`;
        const { error: tErr } = await supabase.storage
          .from('clips')
          .upload(tPath, clipThumb, {
            contentType: clipThumb.type || 'image/jpeg',
            upsert: false,
          });
        if (!tErr) {
          thumbUrl = supabase.storage.from('clips').getPublicUrl(tPath).data
            .publicUrl;
        }
      }

      // Instant 15s preview via Mux playback modifiers (no extra encode wait)
      const previewUrl = `https://stream.mux.com/${ready.playbackId}.m3u8?asset_start_time=0&asset_end_time=15`;

      const price = Math.max(0, Number(clipForm.price) || 0);
      const { data: row, error: insErr } = await supabase
        .from('clips')
        .insert({
          creator_id: profile.id,
          title: clipForm.title.trim(),
          description: clipForm.description.trim() || null,
          price_gbp: Math.round(price * 100) / 100,
          category: clipForm.category || 'Other',
          video_url: ready.videoUrl,
          preview_url: previewUrl,
          thumbnail_url: thumbUrl,
          duration_seconds: ready.duration,
          mux_asset_id: ready.assetId,
          mux_playback_id: ready.playbackId,
          mux_preview_playback_id: ready.playbackId,
          is_published: true,
        })
        .select(
          'id, title, price_gbp, sales_count, thumbnail_url, video_url, is_published, duration_seconds'
        )
        .single();

      if (insErr) throw insErr;

      setMyClips((prev) => [
        {
          id: row.id,
          title: row.title,
          price: Number(row.price_gbp),
          sales: Number(row.sales_count || 0),
          thumbnail_url: row.thumbnail_url,
          video_url: row.video_url,
          is_published: row.is_published,
        },
        ...prev,
      ]);
      setShowUpload(false);
      setClipForm({ title: '', description: '', price: 9.99, category: '' });
      setClipFile(null);
      setClipThumb(null);
      setClipCompressPct(0);
      setClipCompressStatus('');
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally {
      setCreating(false);
      setClipCompressPct(0);
      setClipCompressStatus('');
    }
  };

  const handleDeleteClip = async (id: string) => {
    if (!confirm('Delete this clip? Buyers who already purchased keep access.'))
      return;
    const { error } = await supabase.from('clips').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    setMyClips((prev) => prev.filter((c) => c.id !== id));
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

  const markItemStatus = async (id: string, status: 'available' | 'reserved' | 'sold' | 'hidden') => {
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

  const reserveItem = async (itemId: string) => {
    setReservingId(itemId);
    try {
      let target = selectedReserveUser
        ? { id: selectedReserveUser.id, username: selectedReserveUser.username }
        : null;
      if (!target) {
        const uname = reserveUsername.trim().toLowerCase().replace(/^@/, '');
        if (uname.length < 3) {
          alert('Type at least 3 letters and pick a user from the list');
          setReservingId(null);
          return;
        }
        const { data, error: pErr } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('username', uname)
          .maybeSingle();
        if (pErr) throw pErr;
        target = data;
      }
      if (!target) {
        alert('No user found — pick someone from the list');
        setReservingId(null);
        return;
      }
      const { error } = await supabase
        .from('shop_items')
        .update({
          status: 'reserved',
          reserved_for_id: target.id,
          reserved_for_username: target.username,
        })
        .eq('id', itemId);
      if (error) throw error;
      setMyItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: 'reserved',
                reserved_for_id: target.id,
                reserved_for_username: target.username,
              }
            : item
        )
      );
      setReserveUsername('');
      setSelectedReserveUser(null);
      setReserveResults([]);
    } catch (err: any) {
      alert(err.message || 'Could not reserve item');
    } finally {
      setReservingId(null);
    }
  };

  const clearReserve = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('shop_items')
        .update({
          status: 'available',
          reserved_for_id: null,
          reserved_for_username: null,
        })
        .eq('id', itemId);
      if (error) throw error;
      setMyItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: 'available',
                reserved_for_id: null,
                reserved_for_username: null,
              }
            : item
        )
      );
    } catch (err: any) {
      alert(err.message || 'Failed');
    }
  };



  const notifyBuyerOrder = async (
    order: any,
    userId: string,
    title: string,
    body: string,
    chatText: string
  ) => {
    if (!order?.buyer_id) return;
    await createNotification({
      userId: order.buyer_id,
      actorId: userId,
      type: 'unlock',
      title,
      body,
      link: '/messages',
    });
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant_1.eq.${userId},participant_2.eq.${order.buyer_id}),and(participant_1.eq.${order.buyer_id},participant_2.eq.${userId})`
      )
      .maybeSingle();
    let convoId = existing?.id;
    if (!convoId) {
      const { data: created } = await supabase
        .from('conversations')
        .insert({
          participant_1: userId,
          participant_2: order.buyer_id,
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      convoId = created?.id;
    }
    if (convoId) {
      await supabase.from('messages').insert({
        conversation_id: convoId,
        sender_id: userId,
        content: chatText,
        media_type: 'system',
      });
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convoId);
    }
  };

  const generateShippingLabel = async (order: any) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      alert('Please log in again');
      return;
    }
    try {
      const res = await fetch('/api/shipping/create-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Could not create label');
        return;
      }
      setShopOrders((prev) =>
        prev.map((x) =>
          x.id === order.id
            ? {
                ...x,
                tracking_number: data.tracking_number || x.tracking_number,
                label_url: data.label_url || x.label_url,
                sendcloud_parcel_id: data.sendcloud_parcel_id,
                status: data.status || (data.already ? x.status : x.status === 'accepted' || x.status === 'paid' || x.status === 'awaiting_payment' || x.status === 'label_ready' ? 'label_ready' : x.status),
              }
            : x
        )
      );
      if (data.label_url) {
        window.open(data.label_url, '_blank');
      }
      alert(
        data.label_url
          ? `Label ready${data.tracking_number ? ` · ${data.tracking_number}` : ''}\nOpen the PDF and drop the parcel at any InPost locker.`
          : data.note ||
              'Shipment created in Sendcloud. Check Sendcloud → Parcels for the label, or click Open label again after refresh.'
      );
    } catch (e: any) {
      alert(e?.message || 'Label request failed');
    }
  };

  const markOrderShipped = async (order: any) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const tracking = (trackingDraft[order.id] || '').trim() || null;
    const dropName = (trackingDraft[`${order.id}-drop`] || '').trim() || null;
    const holdHours: Record<string, number> = {
      inpost: 72,
      evri: 240,
      royal_mail: 168,
      yodel: 168,
    };
    const hours = holdHours[order.shipping_carrier] || 168;
    const deadline = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('shop_orders')
      .update({
        status: 'shipped',
        tracking_number: tracking,
        shipped_at: new Date().toISOString(),
        seller_dropoff_point_name: dropName,
        seller_dropped_off_at: new Date().toISOString(),
        seller_dropoff_carrier: order.shipping_carrier || null,
        collection_deadline: deadline,
      })
      .eq('id', order.id);
    if (error) {
      alert(error.message);
      return;
    }
    setShopOrders((prev) =>
      prev.map((x) =>
        x.id === order.id
          ? { ...x, status: 'shipped', tracking_number: tracking }
          : x
      )
    );
    const trackLine = tracking ? `\nTracking: ${tracking}` : '';
    await notifyBuyerOrder(
      order,
      user.id,
      'Order shipped',
      `"${order.item_title}" is on its way`,
      `📦 Dropped off: "${order.item_title}"${trackLine}\n\nCollect from your chosen locker / pick-up point. Home delivery is not used.`
    );
  };

  const markOrderCompleteAsBuyer = async (order: any) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    try {
      // Release pending funds to creator available balance
      await shopEscrow(order.id, 'release');

      setBuyerOrders((prev) =>
        prev.map((x) =>
          x.id === order.id
            ? { ...x, status: 'completed', funds_status: 'released' }
            : x
        )
      );

      if (order.creator_id) {
        await createNotification({
          userId: order.creator_id,
          actorId: user.id,
          type: 'unlock',
          title: 'Order complete — funds released',
          body: `"${order.item_title}" · payment added to your available balance`,
          link: '/dashboard',
        });
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .or(
            `and(participant_1.eq.${user.id},participant_2.eq.${order.creator_id}),and(participant_1.eq.${order.creator_id},participant_2.eq.${user.id})`
          )
          .maybeSingle();
        if (existing?.id) {
          await supabase.from('messages').insert({
            conversation_id: existing.id,
            sender_id: user.id,
            content: `✨ Order complete: "${order.item_title}"\n\nBuyer confirmed receipt. Funds released to seller.`,
            media_type: 'system',
          });
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Could not complete order');
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
                  <p className="text-2xl font-bold">
                    {money(spentThisMonth)}
                  </p>
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
                  <p className="text-2xl font-bold">{clipsOwned}</p>
                  <Link
                    href="/library"
                    className="mt-2 inline-block text-xs text-pink-400 hover:text-pink-300 font-medium"
                  >
                    Open library →
                  </Link>
                </div>
                <Link
                  href="/wallet?from=dashboard"
                  className="bg-gradient-to-br from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-2xl p-5 block hover:border-pink-500/50 transition"
                >
                  <div className="flex items-center gap-2 text-zinc-300 text-sm mb-1">
                    <Wallet size={16} /> Wallet Balance
                  </div>
                  <p className="text-2xl font-bold text-pink-400">
                    £{Number(profile?.balance_gbp ?? 0).toLocaleString('en-GB', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <span className="mt-3 inline-block text-xs text-pink-400 font-medium">
                    + Top Up
                  </span>
                </Link>
              </div>

              {buyerOrders.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">My shop orders</h2>
                    {buyerOrders.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllBuyerOrders((v) => !v)}
                        className="text-sm text-pink-400 hover:text-pink-300"
                      >
                        {showAllBuyerOrders ? 'Show less' : 'View all'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {(showAllBuyerOrders ? buyerOrders : buyerOrders.slice(0, 3)).map((o) => (
                      <div
                        key={o.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-zinc-800 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-base leading-snug">{o.item_title}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-sm text-zinc-300">
                              £{Number(o.item_price).toFixed(2)}
                            </span>
                            <span
                              className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${orderStatusClass(o.status)}`}
                            >
                              {o.status}
                            </span>
                          </div>
                          {o.tracking_number && (
                            <p className="text-sm text-zinc-400 mt-1">
                              Tracking: <span className="text-zinc-200">{o.tracking_number}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {o.status === 'shipped' && (
                            <button
                              type="button"
                              onClick={() => markOrderCompleteAsBuyer(o)}
                              className="text-sm px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 text-white font-medium"
                            >
                              Confirm received
                            </button>
                          )}
                          {o.status === 'completed' && (
                            <span className="text-sm text-green-400 font-medium">Complete</span>
                          )}
                          {o.status === 'requested' && (
                            <span className="text-sm text-zinc-400">Awaiting seller</span>
                          )}
                          {o.status === 'requested' && o.funds_status === 'held' && (
                            <span className="text-sm text-amber-400">
                              Funds held · awaiting seller
                            </span>
                          )}
                          {(o.status === 'paid' || o.status === 'label_ready') && (
                            <span className="text-sm text-emerald-400 font-medium">
                              Paid · {o.status === 'label_ready' ? 'label ready' : 'shipping soon'}
                            </span>
                          )}
                          {o.status === 'cancelled' && (
                            <span className="text-sm text-zinc-500">Cancelled</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Phone size={20} className="text-pink-400" /> Call history
                    </h2>
                    <Link href="/calls" className="text-sm text-pink-400 hover:text-pink-300">
                      View all
                    </Link>
                  </div>
                  {recentCalls.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 flex-1">
                      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                        <Phone size={28} className="opacity-40" />
                      </div>
                      <p className="text-sm mb-1">No calls yet</p>
                      <p className="text-xs text-zinc-600 mb-5">
                        Voice calls with creators will show here
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 flex-1 mb-5">
                      {recentCalls.slice(0, 5).map((call) => {
                        const name =
                          call.other?.display_name ||
                          call.other?.username ||
                          'User';
                        const username = call.other?.username;
                        const initial = name.charAt(0).toUpperCase();
                        const dur = formatCallDuration(call.duration_seconds);
                        const charged = Number(call.amount_charged || 0);
                        return (
                          <Link
                            key={call.id}
                            href={username ? `/${username}` : '/calls'}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/70 transition"
                          >
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                              {call.other?.avatar_url ? (
                                <img
                                  src={call.other.avatar_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                initial
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{name}</p>
                              <p className="text-xs text-zinc-500 truncate">
                                {formatCallDate(call.created_at)}
                                <span className="mx-1">·</span>
                                {dur}
                                <span className="mx-1">·</span>
                                <span className="capitalize">{call.status}</span>
                              </p>
                            </div>
                            {charged > 0 && (
                              <span className="text-sm font-medium text-pink-400 flex-shrink-0">
                                £{charged.toFixed(2)}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                      {recentCalls.length > 5 && (
                        <p className="text-xs text-zinc-500 text-center pt-1">
                          +{recentCalls.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                  <Link
                    href="/calls"
                    className="w-full text-center px-5 py-2.5 bg-pink-600 hover:bg-pink-700 rounded-xl text-sm font-medium transition text-white"
                  >
                    Open call history
                  </Link>
                </div>
              </div>

              {/* Sub transactions dropdown */}
              <div
                ref={txSectionRef}
                id="transactions"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8 scroll-mt-24"
              >
                <button
                  type="button"
                  onClick={() => setTxOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3"
                >
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <List size={20} className="text-pink-400" /> Transactions
                  </h2>
                  <ChevronDown
                    size={20}
                    className={`text-zinc-400 transition ${txOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {txOpen && (
                <div className="mt-4">
                <div className="flex justify-end mb-4">
                  <button
                    type="button"
                    onClick={exportTxCsv}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-700 text-sm text-zinc-200 hover:border-pink-500/40 transition"
                  >
                    <Download size={16} className="text-pink-400" />
                    Export CSV
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(
                    [
                      ['all', 'All'],
                      ['in', 'Money in'],
                      ['out', 'Money out'],
                      ['tips', 'Tips'],
                      ['clips', 'Clips'],
                      ['topup', 'Top-ups'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTxFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                        txFilter === key
                          ? 'bg-pink-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {filteredTxs.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-8">
                    No transactions yet
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredTxs.slice(0, 5).map((tx) => {
                      const amt = Number(tx.amount_gbp || 0);
                      const isIn = amt > 0;
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-zinc-800/50 transition"
                        >
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isIn
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {isIn ? (
                              <ArrowDownLeft size={16} />
                            ) : (
                              <ArrowUpRight size={16} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {txLabel(String(tx.type || ''))}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">
                              {tx.description || '—'} ·{' '}
                              {tx.created_at
                                ? new Date(tx.created_at).toLocaleString(
                                    'en-GB',
                                    {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )
                                : ''}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                isIn ? 'text-emerald-400' : 'text-zinc-200'
                              }`}
                            >
                              {isIn ? '+' : ''}
                              {money(amt)}
                            </p>
                            {tx.balance_after != null && (
                              <p className="text-[10px] text-zinc-600 tabular-nums">
                                Bal {money(Number(tx.balance_after))}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {filteredTxs.length > 5 && (
                  <p className="text-[11px] text-zinc-500 mt-3 text-center">
                    Showing latest 5
                  </p>
                )}
                </div>
                )}
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
                <p className="text-2xl font-bold">{money(earnToday)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <TrendingUp size={16} /> This Week
                </div>
                <p className="text-2xl font-bold">{money(earnWeek)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <Wallet size={16} /> This Month
                </div>
                <p className="text-2xl font-bold">{money(earnMonth)}</p>
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

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center flex-shrink-0">
                    <Wallet className="text-pink-400" size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">Wallet</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Payouts Mondays · min £{MIN_PAYOUT}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 sm:gap-8">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Available
                    </p>
                    <p className="text-sm text-zinc-100 mt-0.5 tabular-nums">
                      {money(Number(profile?.balance_gbp || 0))}
                    </p>
                  </div>
                  {earnAllTime > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                        All-time
                      </p>
                      <p className="text-sm text-zinc-400 mt-0.5 tabular-nums">
                        {money(earnAllTime)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/earnings"
                    className="px-4 py-2 rounded-xl border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800 transition"
                  >
                    Earnings
                  </Link>
                  <button
                    type="button"
                    onClick={openPayoutModal}
                    disabled={Number(profile?.balance_gbp || 0) < MIN_PAYOUT}
                    title={
                      Number(profile?.balance_gbp || 0) < MIN_PAYOUT
                        ? `Need at least £${MIN_PAYOUT} available`
                        : 'Request Monday payout'
                    }
                    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-sm font-medium transition disabled:cursor-not-allowed"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            </div>

            {payoutHistory.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8">
                <h2 className="text-lg font-semibold mb-3">Recent payout requests</h2>
                <div className="space-y-2">
                  {payoutHistory.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 text-sm bg-zinc-950/50 rounded-xl px-4 py-3 border border-zinc-800"
                    >
                      <div>
                        <p className="font-medium">
                          {money(Number(p.net_gbp))} net
                          <span className="text-zinc-500 font-normal">
                            {' '}
                            (from {money(Number(p.amount_gbp))})
                          </span>
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Fee {money(Number(p.fee_gbp))} ·{' '}
                          {p.scheduled_for
                            ? `Scheduled ${p.scheduled_for}`
                            : 'Pending'}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium capitalize px-2.5 py-1 rounded-full ${
                          p.status === 'paid'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : p.status === 'failed' || p.status === 'cancelled'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <DollarSign size={20} className="text-pink-400" /> Recent Tips
                  </h2>
                  <button
                    type="button"
                    onClick={scrollToTransactions}
                    className="text-sm text-pink-400 hover:text-pink-300"
                  >
                    View all →
                  </button>
                </div>
                {recentTips.length === 0 ? (
                  <p className="text-zinc-500 text-sm py-8 text-center">
                    No tips yet — when someone tips you, it shows up here live
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {recentTips.map((tip) => (
                      <div
                        key={tip.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 transition"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                          {tip.from_avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={tip.from_avatar}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            tip.from_name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {tip.from_name}
                            {tip.from_username ? (
                              <span className="text-zinc-500 font-normal">
                                {' '}
                                @{tip.from_username}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {tip.description || 'Tip'} · {tipTimeAgo(tip.created_at)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-400 flex-shrink-0 tabular-nums">
                          +{money(tip.amount_gbp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Film size={20} className="text-pink-400" /> My Clips
                  </h2>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/clips"
                      className="text-xs text-zinc-400 hover:text-pink-400"
                    >
                      View store
                    </Link>
                    <button
                      onClick={() => setShowUpload(true)}
                      className="flex items-center gap-1.5 text-sm bg-pink-600 hover:bg-pink-700 px-3 py-1.5 rounded-lg transition"
                    >
                      <Plus size={16} /> Upload
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {myClips.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4 text-center">
                      No clips yet — upload your first paid video
                    </p>
                  ) : (
                    myClips.map((clip) => (
                      <div
                        key={clip.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50"
                      >
                        <div className="w-14 h-10 rounded-lg bg-zinc-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {clip.thumbnail_url ? (
                            <img
                              src={clip.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Film size={18} className="text-zinc-400" />
                          )}
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
                        <button
                          type="button"
                          onClick={() => handleDeleteClip(clip.id)}
                          className="text-xs text-zinc-500 hover:text-red-400 px-2"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

                          {shopOrders.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Shop orders</h2>
                    {shopOrders.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllShopOrders((v) => !v)}
                        className="text-sm text-pink-400 hover:text-pink-300"
                      >
                        {showAllShopOrders ? 'Show less' : 'View all'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {(showAllShopOrders ? shopOrders : shopOrders.slice(0, 3)).map((o) => (
                      <div
                        key={o.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-zinc-800 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-base leading-snug">{o.item_title}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-sm text-zinc-300">
                              £{Number(o.item_price).toFixed(2)}
                            </span>
                            <span
                              className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${orderStatusClass(o.status)}`}
                            >
                              {o.status}
                            </span>
                          </div>
                          {o.buyer_note && (
                            <p className="text-sm text-zinc-400 mt-1.5 line-clamp-2">
                              Note: “{o.buyer_note}”
                            </p>
                          )}
                          {(o.shipping_carrier || o.shipping_point_name) && (
                            <p className="text-sm text-zinc-500 mt-1">
                              Collect:{' '}
                              <span className="text-zinc-300 capitalize">
                                {(o.shipping_carrier || '').replace('_', ' ')}
                                {o.shipping_point_name ? ` · ${o.shipping_point_name}` : ''}
                                {o.shipping_point_town ? ` · ${o.shipping_point_town}` : ''}
                              </span>
                              <span className="text-zinc-600"> · locker / pick-up only</span>
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {o.status === 'requested' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  const {
                                    data: { user },
                                  } = await supabase.auth.getUser();
                                  if (!user) return;
                                  try {
                                    // Move held funds → creator pending
                                    const esc = await shopEscrow(o.id, 'accept');

                                    setShopOrders((prev) =>
                                      prev.map((x) =>
                                        x.id === o.id
                                          ? {
                                              ...x,
                                              status: 'paid',
                                              funds_status: 'pending_creator',
                                            }
                                          : x
                                      )
                                    );
                                    if (typeof esc.pending === 'number') {
                                      setProfile((p: any) =>
                                        p
                                          ? { ...p, pending_gbp: esc.pending }
                                          : p
                                      );
                                    } else {
                                      setProfile((p: any) =>
                                        p
                                          ? {
                                              ...p,
                                              pending_gbp:
                                                Number(p.pending_gbp || 0) +
                                                Number(o.item_price || 0),
                                            }
                                          : p
                                      );
                                    }
                                    if (o.item_id) {
                                      setMyItems((prev) =>
                                        prev.map((it) =>
                                          it.id === o.item_id
                                            ? {
                                                ...it,
                                                status: 'sold',
                                                reserved_for_id: null,
                                              }
                                            : it
                                        )
                                      );
                                    }

                                    if (o.buyer_id) {
                                      await createNotification({
                                        userId: o.buyer_id,
                                        actorId: user.id,
                                        type: 'unlock',
                                        title: 'Order accepted',
                                        body: `"${o.item_title}" · seller accepted — shipping next`,
                                        link: '/dashboard',
                                      });
                                      const { data: existing } = await supabase
                                        .from('conversations')
                                        .select('id')
                                        .or(
                                          `and(participant_1.eq.${user.id},participant_2.eq.${o.buyer_id}),and(participant_1.eq.${o.buyer_id},participant_2.eq.${user.id})`
                                        )
                                        .maybeSingle();
                                      if (existing?.id) {
                                        await supabase.from('messages').insert({
                                          conversation_id: existing.id,
                                          sender_id: user.id,
                                          content: `✅ Order accepted: "${o.item_title}" · £${Number(o.item_price).toFixed(2)}\n\nYour held payment is with the seller (pending until you confirm receipt). Shipping label next.`,
                                          media_type: 'system',
                                        });
                                        await supabase
                                          .from('conversations')
                                          .update({
                                            last_message_at: new Date().toISOString(),
                                          })
                                          .eq('id', existing.id);
                                      }
                                    }
                                  } catch (err: any) {
                                    alert(err.message || 'Could not accept order');
                                  }
                                }}
                                className="text-sm px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-medium transition"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const {
                                    data: { user },
                                  } = await supabase.auth.getUser();
                                  if (!user) return;
                                  try {
                                    // Refund held funds to buyer
                                    await shopEscrow(o.id, 'refund');

                                    setShopOrders((prev) =>
                                      prev.map((x) =>
                                        x.id === o.id
                                          ? {
                                              ...x,
                                              status: 'cancelled',
                                              funds_status: 'refunded',
                                            }
                                          : x
                                      )
                                    );
                                    if (o.item_id) {
                                      setMyItems((prev) =>
                                        prev.map((it) =>
                                          it.id === o.item_id
                                            ? {
                                                ...it,
                                                status: 'available',
                                                reserved_for_id: null,
                                              }
                                            : it
                                        )
                                      );
                                    }

                                    if (o.buyer_id) {
                                      await createNotification({
                                        userId: o.buyer_id,
                                        actorId: user.id,
                                        type: 'unlock',
                                        title: 'Order declined — refunded',
                                        body: `"${o.item_title}" · held funds returned to your wallet`,
                                        link: '/wallet',
                                      });
                                      const { data: existing } = await supabase
                                        .from('conversations')
                                        .select('id')
                                        .or(
                                          `and(participant_1.eq.${user.id},participant_2.eq.${o.buyer_id}),and(participant_1.eq.${o.buyer_id},participant_2.eq.${user.id})`
                                        )
                                        .maybeSingle();
                                      if (existing?.id) {
                                        await supabase.from('messages').insert({
                                          conversation_id: existing.id,
                                          sender_id: user.id,
                                          content: `❌ Order declined: "${o.item_title}"\n\nYour held payment has been returned to your wallet.`,
                                          media_type: 'system',
                                        });
                                        await supabase
                                          .from('conversations')
                                          .update({
                                            last_message_at: new Date().toISOString(),
                                          })
                                          .eq('id', existing.id);
                                      }
                                    }
                                  } catch (err: any) {
                                    alert(err.message || 'Could not decline order');
                                  }
                                }}
                                className="text-sm px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {(o.status === 'paid' || o.status === 'label_ready') && (
                            <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[240px]">
                              <p className="text-xs text-zinc-500">
                                InPost: generate label, then drop off at any locker. Buyer collects at theirs.
                              </p>
                              {o.shipping_carrier === 'inpost' && (
                                <button
                                  type="button"
                                  onClick={() => generateShippingLabel(o)}
                                  className="text-sm px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 text-white font-medium transition"
                                >
                                  {o.label_url ? 'Open / refresh label' : 'Generate shipping label'}
                                </button>
                              )}
                              {o.label_url && (
                                <a
                                  href={o.label_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-pink-400 hover:underline"
                                >
                                  Download label PDF
                                </a>
                              )}
                              <input
                                value={trackingDraft[o.id] || ''}
                                onChange={(e) =>
                                  setTrackingDraft((prev) => ({
                                    ...prev,
                                    [o.id]: e.target.value,
                                  }))
                                }
                                placeholder="Tracking (optional if auto)"
                                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500"
                              />
                              <input
                                value={trackingDraft[`${o.id}-drop`] || ''}
                                onChange={(e) =>
                                  setTrackingDraft((prev) => ({
                                    ...prev,
                                    [`${o.id}-drop`]: e.target.value,
                                  }))
                                }
                                placeholder="Your drop-off point name"
                                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500"
                              />
                              <button
                                type="button"
                                onClick={() => markOrderShipped(o)}
                                className="text-sm px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 hover:border-pink-500 text-white font-medium transition"
                              >
                                Mark dropped off
                              </button>
                            </div>
                          )}
                          {o.status === 'label_ready' && (
                            <div className="flex flex-col gap-1 sm:items-end">
                              <span className="text-sm text-pink-400 font-medium">
                                Label ready — drop at InPost locker
                              </span>
                              {o.tracking_number && (
                                <p className="text-sm text-zinc-300">
                                  Tracking: {o.tracking_number}
                                </p>
                              )}
                              {o.label_url && (
                                <a
                                  href={o.label_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm text-pink-400 hover:underline font-medium"
                                >
                                  Open / download label PDF
                                </a>
                              )}
                            </div>
                          )}
                          {o.status === 'shipped' && (
                            <div className="flex flex-col gap-1 sm:items-end">
                              {o.tracking_number && (
                                <p className="text-sm text-zinc-300">
                                  Tracking: {o.tracking_number}
                                </p>
                              )}
                              {o.label_url && (
                                <a
                                  href={o.label_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm text-pink-400 hover:underline"
                                >
                                  View label
                                </a>
                              )}
                              <span className="text-sm text-zinc-400">
                                Waiting for buyer to confirm
                              </span>
                            </div>
                          )}
                          {o.status === 'completed' && (
                            <span className="text-sm text-green-400 font-medium">Complete</span>
                          )}
                          {o.status === 'cancelled' && (
                            <span className="text-sm text-zinc-500">Cancelled</span>
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
              <div className="flex flex-wrap gap-2 mb-4">
                {(['all', 'available', 'reserved', 'sold', 'hidden'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setItemFilter(f)}
                    className={`text-xs px-3 py-1.5 rounded-full border capitalize ${
                      itemFilter === f
                        ? 'bg-pink-600 border-pink-500 text-white'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {f}
                    {f !== 'all' && (
                      <span className="ml-1 opacity-70">
                        ({myItems.filter((i) => i.status === f).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="mb-4 relative">
                <p className="text-xs text-zinc-500 mb-1.5">
                  Reserve for a sub — type 3+ letters, pick from the list, then tap Reserve on an item
                </p>
                {selectedReserveUser ? (
                  <div className="flex items-center gap-3 bg-zinc-800 border border-pink-500/40 rounded-xl px-3 py-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {selectedReserveUser.avatar_url ? (
                        <img src={selectedReserveUser.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (selectedReserveUser.display_name || selectedReserveUser.username).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {selectedReserveUser.display_name || selectedReserveUser.username}
                      </p>
                      <p className="text-xs text-zinc-500">@{selectedReserveUser.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReserveUser(null);
                        setReserveUsername('');
                      }}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={reserveUsername}
                      onChange={(e) => {
                        setReserveUsername(e.target.value);
                        setSelectedReserveUser(null);
                      }}
                      placeholder="Type username (min 3 letters)…"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-500"
                      autoComplete="off"
                    />
                    {(reserveResults.length > 0 || reserveSearching) &&
                      reserveUsername.trim().length >= 3 && (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl max-h-56 overflow-y-auto">
                          {reserveSearching && (
                            <p className="px-3 py-2 text-xs text-zinc-500">Searching…</p>
                          )}
                          {reserveResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setSelectedReserveUser(u);
                                setReserveUsername(u.username);
                                setReserveResults([]);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 transition text-left"
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {u.avatar_url ? (
                                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  (u.display_name || u.username).charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {u.display_name || u.username}
                                </p>
                                <p className="text-xs text-zinc-500">@{u.username}</p>
                              </div>
                            </button>
                          ))}
                          {!reserveSearching && reserveResults.length === 0 && (
                            <p className="px-3 py-2 text-xs text-zinc-500">No users found</p>
                          )}
                        </div>
                      )}
                  </>
                )}
              </div>

              {myItems.filter((i) =>
                itemFilter === 'all' ? true : i.status === itemFilter
              ).length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  <Package size={32} className="mx-auto mb-2 opacity-40" />
                  {myItems.length === 0
                    ? 'No items listed yet. Sell underwear, heels, socks and more!'
                    : `No ${itemFilter} items`}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myItems
                    .filter((i) =>
                      itemFilter === 'all' ? true : i.status === itemFilter
                    )
                    .map((item) => (
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
                          {item.status && item.status !== 'available' && (
                            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-black/70 text-white">
                              {item.status}
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div>
                              <p className="font-medium leading-tight">{item.title}</p>
                              <p className="text-xs text-zinc-400 mt-1">
                                {item.category} · {item.condition}
                                {item.status === 'reserved' &&
                                  ` · @${item.reserved_for_username || '…'}`}
                              </p>
                            </div>
                            <span className="font-semibold text-pink-400 whitespace-nowrap">
                              £{item.price}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEditItem(item)}
                              className="flex items-center justify-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            {item.status === 'available' && (
                              <button
                                type="button"
                                disabled={reservingId === item.id}
                                onClick={() => reserveItem(item.id)}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white disabled:opacity-50"
                              >
                                {reservingId === item.id ? '…' : 'Reserve'}
                              </button>
                            )}
                            {item.status === 'reserved' && (
                              <button
                                type="button"
                                onClick={() => clearReserve(item.id)}
                                className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-600 text-zinc-300"
                              >
                                Unreserve
                              </button>
                            )}
                            {item.status === 'available' && (
                              <button
                                type="button"
                                onClick={() => markItemStatus(item.id, 'sold')}
                                className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-600 text-zinc-300"
                              >
                                Mark sold
                              </button>
                            )}
                            {item.status === 'sold' && (
                              <button
                                type="button"
                                onClick={() => markItemStatus(item.id, 'available')}
                                className="text-xs px-2.5 py-1.5 rounded-lg border border-pink-500/40 text-pink-400"
                              >
                                Relist
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                markItemStatus(
                                  item.id,
                                  item.status === 'hidden' ? 'available' : 'hidden'
                                )
                              }
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-600 text-zinc-400"
                            >
                              {item.status === 'hidden' ? 'Unhide' : 'Hide'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-red-900/40 text-red-400"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {isLive && (
              <div className="rounded-2xl border border-pink-500/40 bg-pink-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
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

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <Settings size={20} className="text-pink-400" />
                  <h2 className="text-lg font-semibold">Pricing</h2>
                </div>
                <div className="flex items-center gap-3">
                  {pricingMsg && (
                    <span className="text-xs text-emerald-400">{pricingMsg}</span>
                  )}
                  <button
                    type="button"
                    onClick={savePricing}
                    disabled={pricingSaving}
                    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-sm font-medium disabled:opacity-50"
                  >
                    {pricingSaving ? 'Saving…' : 'Save pricing'}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Subscriptions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <label className="flex items-center gap-3 cursor-pointer sm:col-span-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPricing({
                            ...pricing,
                            subscriptionsEnabled: !pricing.subscriptionsEnabled,
                          })
                        }
                        className={`w-11 h-6 rounded-full relative transition ${
                          pricing.subscriptionsEnabled ? 'bg-pink-600' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                            pricing.subscriptionsEnabled ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <span className="text-sm">Enabled</span>
                    </label>
                    <div className="sm:col-span-2">
                      <label className="text-sm text-zinc-400 mb-1.5 block">Monthly price</label>
                      <div className="relative max-w-xs">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={pricing.subscriptionPrice}
                          onChange={(e) =>
                            setPricing({
                              ...pricing,
                              subscriptionPrice: Number(e.target.value),
                            })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-6">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Chat & tips</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Message unlock</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={pricing.messagePrice}
                          onChange={(e) =>
                            setPricing({ ...pricing, messagePrice: Number(e.target.value) })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                        />
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1">0 = free messages</p>
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Minimum tip</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                        <input
                          type="number"
                          min="2"
                          max="500"
                          step="1"
                          value={pricing.minTipGbp}
                          onChange={(e) =>
                            setPricing({ ...pricing, minTipGbp: Number(e.target.value) })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                        />
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1">Platform floor £2</p>
                    </div>
                    <div className="flex items-end pb-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPricing({ ...pricing, tipMenuEnabled: !pricing.tipMenuEnabled })
                        }
                        className="flex items-center gap-3"
                      >
                        <span
                          className={`w-11 h-6 rounded-full relative transition ${
                            pricing.tipMenuEnabled ? 'bg-pink-600' : 'bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                              pricing.tipMenuEnabled ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </span>
                        <span className="text-sm">Tip menu on lives</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-6">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Live private</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <button
                        type="button"
                        onClick={() =>
                          setPricing({
                            ...pricing,
                            livePrivateEnabled: !pricing.livePrivateEnabled,
                          })
                        }
                        className={`w-11 h-6 rounded-full relative transition ${
                          pricing.livePrivateEnabled ? 'bg-pink-600' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                            pricing.livePrivateEnabled ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <span className="text-sm">Enabled</span>
                    </label>
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Per minute</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={pricing.privatePerMinute}
                          onChange={(e) =>
                            setPricing({
                              ...pricing,
                              privatePerMinute: Number(e.target.value),
                            })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Min minutes</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={pricing.minPrivateMinutes}
                        onChange={(e) =>
                          setPricing({
                            ...pricing,
                            minPrivateMinutes: Number(e.target.value),
                          })
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-6">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Voice calls</p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <button
                        type="button"
                        onClick={() =>
                          setPricing({
                            ...pricing,
                            voiceCallsEnabled: !pricing.voiceCallsEnabled,
                          })
                        }
                        className={`w-11 h-6 rounded-full relative transition ${
                          pricing.voiceCallsEnabled ? 'bg-pink-600' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                            pricing.voiceCallsEnabled ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <span className="text-sm">Enabled</span>
                    </label>
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Per minute</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={pricing.voiceRate}
                          onChange={(e) =>
                            setPricing({ ...pricing, voiceRate: Number(e.target.value) })
                          }
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Min minutes</label>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={pricing.voiceMinMinutes}
                        onChange={(e) =>
                          setPricing({
                            ...pricing,
                            voiceMinMinutes: Number(e.target.value),
                          })
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Max minutes</label>
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={pricing.voiceMaxMinutes}
                        onChange={(e) =>
                          setPricing({
                            ...pricing,
                            voiceMaxMinutes: Number(e.target.value),
                          })
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions dropdown */}
            <div
              ref={txSectionRef}
              id="transactions"
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4 scroll-mt-24"
            >
              <button
                type="button"
                onClick={() => setTxOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3"
              >
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <List size={20} className="text-pink-400" /> Transactions
                </h2>
                <ChevronDown
                  size={20}
                  className={`text-zinc-400 transition ${txOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {txOpen && (
              <div className="mt-4">
              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={exportTxCsv}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-700 text-sm text-zinc-200 hover:border-pink-500/40 hover:text-white transition"
                >
                  <Download size={16} className="text-pink-400" />
                  Export CSV
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {(
                  [
                    ['all', 'All'],
                    ['in', 'Money in'],
                    ['out', 'Money out'],
                    ['tips', 'Tips'],
                    ['clips', 'Clips'],
                    ['topup', 'Top-ups'],
                    ['payout', 'Payouts'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTxFilter(key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      txFilter === key
                        ? 'bg-pink-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {filteredTxs.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-10">
                  No transactions yet
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredTxs.slice(0, 5).map((tx) => {
                    const amt = Number(tx.amount_gbp || 0);
                    const isIn = amt > 0;
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-zinc-800/50 transition"
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isIn
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {isIn ? (
                            <ArrowDownLeft size={16} />
                          ) : (
                            <ArrowUpRight size={16} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {txLabel(String(tx.type || ''))}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {tx.description || '—'} ·{' '}
                            {tx.created_at
                              ? new Date(tx.created_at).toLocaleString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              isIn ? 'text-emerald-400' : 'text-zinc-200'
                            }`}
                          >
                            {isIn ? '+' : ''}
                            {money(amt)}
                          </p>
                          {tx.balance_after != null && (
                            <p className="text-[10px] text-zinc-600 tabular-nums">
                              Bal {money(Number(tx.balance_after))}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-zinc-500 mt-3 text-center">
                Showing latest 5 · export CSV for the full history
              </p>
              </div>
              )}
            </div>
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
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold">Upload New Clip</h2>
                <button
                  onClick={() => {
                    setShowUpload(false);
                    setClipFile(null);
                    setClipThumb(null);
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Video file{' '}
                    <span className="text-zinc-600">
                      (max 2GB · powered by Mux)
                    </span>
                  </label>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => setClipFile(e.target.files?.[0] || null)}
                    disabled={creating}
                    className="w-full text-sm text-zinc-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-pink-600 file:text-white file:text-sm disabled:opacity-50"
                  />
                  {clipFile && (
                    <p className="text-xs text-zinc-500 mt-1 truncate">
                      {clipFile.name} ·{' '}
                      {(clipFile.size / (1024 * 1024)).toFixed(1)}MB
                    </p>
                  )}
                  {creating && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs text-pink-400">
                        {clipCompressStatus || 'Working…'}
                      </p>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pink-500 transition-all duration-300"
                          style={{
                            width: `${Math.max(clipCompressPct, 4)}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        File goes straight to Mux — no long browser compress.
                        Processing usually finishes within a minute.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Thumbnail (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setClipThumb(e.target.files?.[0] || null)}
                    className="w-full text-sm text-zinc-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:text-white file:text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Title</label>
                  <input
                    type="text"
                    value={clipForm.title}
                    onChange={(e) =>
                      setClipForm({ ...clipForm, title: e.target.value })
                    }
                    placeholder="Clip title"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Description
                  </label>
                  <textarea
                    value={clipForm.description}
                    onChange={(e) =>
                      setClipForm({ ...clipForm, description: e.target.value })
                    }
                    placeholder="Describe your clip..."
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">
                      Price (£)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={clipForm.price}
                      onChange={(e) =>
                        setClipForm({
                          ...clipForm,
                          price: Number(e.target.value),
                        })
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">
                      Category
                    </label>
                    <select
                      value={clipForm.category}
                      onChange={(e) =>
                        setClipForm({ ...clipForm, category: e.target.value })
                      }
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
                  onClick={() => {
                    setShowUpload(false);
                    setClipFile(null);
                    setClipThumb(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateClip}
                  disabled={creating || !clipForm.title || !clipFile}
                  className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 font-medium transition disabled:opacity-50"
                >
                  {creating
                    ? clipCompressPct < 75
                      ? 'Uploading…'
                      : clipCompressPct < 97
                        ? 'Processing…'
                        : 'Saving…'
                    : 'Publish Clip'}
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

        {/* Payout request modal */}
        {showPayoutModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Request payout</h3>
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-zinc-400 mb-4">
                Minimum £{MIN_PAYOUT}. The 20% platform fee is already taken when
                you earn. Payouts send your available balance with no second fee.
                Processed on Mondays. Under the minimum rolls over.
              </p>
              <p className="text-sm mb-3">
                Available:{' '}
                <span className="font-semibold text-pink-400">
                  {money(Number(profile?.balance_gbp || 0))}
                </span>
              </p>
              <label className="text-sm text-zinc-400 mb-1.5 block">
                Amount to withdraw (£)
              </label>
              <input
                type="number"
                min={MIN_PAYOUT}
                step="0.01"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 outline-none focus:border-pink-500 mb-3"
              />
              {Number(payoutAmount) >= MIN_PAYOUT && (
                <div className="text-sm bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 mb-4 space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>You receive</span>
                    <span className="text-pink-400">
                      {money(Number(payoutAmount))}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pt-1">
                    No extra fee on payout
                  </p>
                </div>
              )}
              {payoutErr && (
                <p className="text-sm text-red-400 mb-3">{payoutErr}</p>
              )}
              {payoutMsg && (
                <p className="text-sm text-emerald-400 mb-3">{payoutMsg}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={requestPayout}
                  disabled={
                    payoutLoading ||
                    Number(payoutAmount) < MIN_PAYOUT ||
                    !!payoutMsg
                  }
                  className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 font-medium transition disabled:opacity-50"
                >
                  {payoutLoading ? 'Requesting...' : 'Confirm payout'}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-4 text-center">
                Bank transfer via Stripe Connect is next. For now requests are
                recorded and funds are reserved from your wallet.
              </p>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
