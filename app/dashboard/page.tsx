'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  DollarSign, TrendingUp, Film, Plus, Radio, Wallet, Eye, 
  ShoppingBag, X, Settings, Package, Pencil, Trash2, Image as ImageIcon,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';

type Item = {
  id: number;
  title: string;
  description?: string;
  price: number;
  category: string;
  condition: string;
  photos: string[];
};

export default function DashboardPage() {
  const [isLive, setIsLive] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  // Clip form
  const [clipForm, setClipForm] = useState({
    title: '',
    description: '',
    price: 9.99,
    category: '',
  });

  // Item form
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    price: 25,
    category: 'Underwear',
    condition: 'Worn',
    photos: [] as string[],
  });

  // Pricing settings
  const [pricing, setPricing] = useState({
    privatePerMinute: 8,
    minPrivateMinutes: 5,
    tipMenuEnabled: true,
  });

  // Mock data
  const stats = {
    today: 142.50,
    week: 890.00,
    month: 3420.75,
    total: 18450.00,
  };

  const recentTips = [
    { id: 1, name: 'PrincessK', amount: 50, message: 'Love your energy 🔥' },
    { id: 2, name: 'TommyB', amount: 25, message: '' },
    { id: 3, name: 'SubmissiveSam', amount: 100, message: 'Thank you Mistress' },
    { id: 4, name: 'NightOwl', amount: 15, message: '' },
  ];

  const [myClips] = useState([
    { id: 1, title: 'Morning Stretch Session', price: 12.99, sales: 48 },
    { id: 2, title: 'Private JOI Custom', price: 45.00, sales: 19 },
    { id: 3, title: 'Feet Worship Clip', price: 9.99, sales: 87 },
  ]);

  const [myItems, setMyItems] = useState<Item[]>([
    { 
      id: 1, 
      title: 'Black Lace Panties (Worn 2 days)', 
      price: 45, 
      category: 'Underwear', 
      condition: 'Worn',
      photos: [] 
    },
    { 
      id: 2, 
      title: 'Red High Heels - Size 6', 
      price: 85, 
      category: 'Heels', 
      condition: 'New',
      photos: [] 
    },
    { 
      id: 3, 
      title: 'White Ankle Socks (Worn)', 
      price: 30, 
      category: 'Socks', 
      condition: 'Heavily Worn',
      photos: [] 
    },
  ]);

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
    const newPhotos = filesToAdd.map(file => URL.createObjectURL(file));

    setItemForm(prev => ({
      ...prev,
      photos: [...prev.photos, ...newPhotos]
    }));
  };

  const removePhoto = (index: number) => {
    setItemForm(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleSaveItem = () => {
    if (!itemForm.title) return;
    setCreating(true);

    setTimeout(() => {
      if (editingItem) {
        setMyItems(prev =>
          prev.map(item =>
            item.id === editingItem.id
              ? { ...item, ...itemForm }
              : item
          )
        );
      } else {
        const newItem: Item = {
          id: Date.now(),
          ...itemForm,
        };
        setMyItems(prev => [newItem, ...prev]);
      }

      setCreating(false);
      setShowItemForm(false);
      setEditingItem(null);
      setItemForm({ title: '', description: '', price: 25, category: 'Underwear', condition: 'Worn', photos: [] });
    }, 800);
  };

  const handleDeleteItem = (id: number) => {
    if (confirm('Are you sure you want to delete this item?')) {
      setMyItems(prev => prev.filter(item => item.id !== id));
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
    setPhotoIndex((prev) => (prev - 1 + viewingItem.photos.length) % viewingItem.photos.length);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">Creator Dashboard</h1>
              <p className="text-zinc-400 mt-1">Manage your content and earnings</p>
            </div>

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

          {/* Earnings Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <DollarSign size={16} /> Today
              </div>
              <p className="text-2xl font-bold">£{stats.today.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <TrendingUp size={16} /> This Week
              </div>
              <p className="text-2xl font-bold">£{stats.week.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <Wallet size={16} /> This Month
              </div>
              <p className="text-2xl font-bold">£{stats.month.toFixed(2)}</p>
            </div>
            <div className="bg-gradient-to-br from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-300 text-sm mb-1">
                <Wallet size={16} /> Total Earned
              </div>
              <p className="text-2xl font-bold text-pink-400">£{stats.total.toFixed(2)}</p>
            </div>
          </div>

          {/* Payout Banner */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center">
                <Wallet className="text-pink-400" size={22} />
              </div>
              <div>
                <p className="font-semibold">Weekly Payout</p>
                <p className="text-sm text-zinc-400">Next payout: Friday · £{stats.week.toFixed(2)} pending</p>
              </div>
            </div>
            <button className="px-5 py-2.5 rounded-xl border border-zinc-700 text-sm font-medium hover:bg-zinc-800 transition">
              Withdraw
            </button>
          </div>

          {/* Pricing Settings */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-2 mb-5">
              <Settings size={20} className="text-pink-400" />
              <h2 className="text-lg font-semibold">Pricing Settings</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Private Session (per minute)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                  <input
                    type="number"
                    value={pricing.privatePerMinute}
                    onChange={(e) => setPricing({ ...pricing, privatePerMinute: Number(e.target.value) })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Minimum Private Minutes</label>
                <input
                  type="number"
                  value={pricing.minPrivateMinutes}
                  onChange={(e) => setPricing({ ...pricing, minPrivateMinutes: Number(e.target.value) })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-11 h-6 rounded-full relative transition ${pricing.tipMenuEnabled ? 'bg-pink-600' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${pricing.tipMenuEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </div>
                  <span className="text-sm">Enable Tip Menu</span>
                </label>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Recent Tips */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-pink-400" /> Recent Tips
              </h2>
              <div className="space-y-3">
                {recentTips.map((tip) => (
                  <div key={tip.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold">
                      {tip.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{tip.name}</p>
                      {tip.message && <p className="text-xs text-zinc-400 truncate">{tip.message}</p>}
                    </div>
                    <span className="font-semibold text-pink-400">£{tip.amount}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* My Clips */}
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
                        <span className="flex items-center gap-1"><ShoppingBag size={12} /> {clip.sales}</span>
                        <span>·</span>
                        <span>£{clip.price.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ==================== ITEM MANAGER ==================== */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Package size={20} className="text-pink-400" /> Physical Items for Sale
              </h2>
              <button
                onClick={() => {
                  setEditingItem(null);
                  setItemForm({ title: '', description: '', price: 25, category: 'Underwear', condition: 'Worn', photos: [] });
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
                  <div key={item.id} className="bg-zinc-800/60 border border-zinc-700 rounded-xl overflow-hidden">
                    {/* Photo */}
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

                      {item.photos.length > 1 && (
                        <div className="absolute bottom-2 right-2 bg-black/60 text-xs px-2 py-1 rounded-full">
                          1/{item.photos.length}
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="font-medium leading-tight">{item.title}</p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {item.category} · {item.condition}
                          </p>
                        </div>
                        <span className="font-semibold text-pink-400 whitespace-nowrap">£{item.price}</span>
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

          {/* Active Stream Banner */}
          {isLive && (
            <div className="rounded-2xl border border-pink-500/40 bg-pink-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full">LIVE</div>
                <div>
                  <p className="font-semibold">You are currently live</p>
                  <p className="text-sm text-zinc-400 flex items-center gap-1">
                    <Eye size={14} /> 47 watching
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

      {/* ==================== PHOTO GALLERY MODAL ==================== */}
      {viewingItem && viewingItem.photos.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <button
            onClick={() => setViewingItem(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <X size={28} />
          </button>

          <button
            onClick={prevPhoto}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 p-2 rounded-full"
          >
            <ChevronLeft size={28} />
          </button>

          <div className="max-w-3xl w-full">
            <img
              src={viewingItem.photos[photoIndex]}
              alt={`${viewingItem.title} - Photo ${photoIndex + 1}`}
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
            <div className="text-center mt-4 text-sm text-zinc-400">
              {photoIndex + 1} / {viewingItem.photos.length} · {viewingItem.title}
            </div>
          </div>

          <button
            onClick={nextPhoto}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 p-2 rounded-full"
          >
            <ChevronRight size={28} />
          </button>
        </div>
      )}

      {/* ==================== UPLOAD CLIP MODAL ==================== */}
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
              <button onClick={() => setShowUpload(false)} className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition">
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

      {/* ==================== ADD / EDIT ITEM MODAL ==================== */}
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
              {/* Photo Upload */}
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">
                  Photos (max 3)
                </label>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  {itemForm.photos.map((photo, index) => (
                    <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800">
                      <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
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
                <p className="text-xs text-zinc-500">
                  {itemForm.photos.length}/3 photos uploaded
                </p>
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
                  placeholder="Describe the item, how long it was worn, etc."
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
                    <option value="Underwear">Underwear</option>
                    <option value="Heels">Heels / Shoes</option>
                    <option value="Socks">Socks</option>
                    <option value="Boots">Boots</option>
                    <option value="Other">Other</option>
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
  );
}