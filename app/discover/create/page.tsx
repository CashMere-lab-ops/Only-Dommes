''use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, Video, X, UploadCloud } from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import AuthGuard from '../../../components/AuthGuard';
import { createClient } from '../../../lib/supabase';

export default function CreatePostPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const [caption, setCaption] = useState('');
  const [mediaType, setMediaType] = useState<'none' | 'photo' | 'video'>('none');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  const maxCaptionLength = 500;

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!data || data.account_type !== 'creator') {
        router.push('/discover');
        return;
      }

      setProfile(data);
      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    if (file.type.startsWith('image/')) {
      setMediaType('photo');
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > 15) {
          setError('Videos must be 15 seconds or less');
          setMediaFile(null);
          setMediaPreview(null);
          setMediaType('none');
          return;
        }
        setMediaType('video');
        setMediaFile(file);
        setMediaPreview(URL.createObjectURL(file));
      };
      video.src = URL.createObjectURL(file);
    } else {
      setError('Please select a photo or video');
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType('none');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePost = async () => {
    if (!caption.trim() && !mediaFile) {
      setError('Please add a caption or media');
      return;
    }

    setPosting(true);
    setError('');

    // Demo for now – we will connect to database later
    setTimeout(() => {
      setPosting(false);
      alert('Post created successfully! (Demo)');
      router.push('/discover');
    }, 1200);
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <p className="text-zinc-400">Loading...</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          {/* Top Bar */}
          <div className="sticky top-0 z-50 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
              <Link
                href="/discover"
                className="text-zinc-400 hover:text-white transition flex items-center gap-2"
              >
                <ArrowLeft size={20} />
                <span className="text-sm hidden sm:inline">Cancel</span>
              </Link>

              <h1 className="font-semibold text-lg">New Post</h1>

              <button
                onClick={handlePost}
                disabled={posting || (!caption.trim() && !mediaFile)}
                className="text-sm font-semibold text-pink-400 hover:text-pink-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>

          <div className="max-w-2xl mx-auto px-4 py-6">

            {error && (
              <div className="mb-6 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* User Info */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">{profile?.display_name || profile?.username}</p>
                <p className="text-xs text-zinc-400">@{profile?.username}</p>
              </div>
            </div>

            {/* Caption */}
            <div className="mb-6">
              <textarea
                value={caption}
                onChange={(e) => {
                  if (e.target.value.length <= maxCaptionLength) {
                    setCaption(e.target.value);
                  }
                }}
                placeholder="What's on your mind?"
                rows={5}
                className="w-full bg-transparent border-none outline-none resize-none text-base placeholder:text-zinc-500"
              />
              <div className="flex justify-end mt-1">
                <span className={`text-xs ${caption.length > 450 ? 'text-pink-400' : 'text-zinc-500'}`}>
                  {caption.length}/{maxCaptionLength}
                </span>
              </div>
            </div>

            {/* Media Preview */}
            {mediaPreview && (
              <div className="mb-6 relative rounded-2xl overflow-hidden border border-zinc-800">
                {mediaType === 'photo' && (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="w-full max-h-[480px] object-cover"
                  />
                )}
                {mediaType === 'video' && (
                  <video
                    src={mediaPreview}
                    controls
                    className="w-full max-h-[480px]"
                  />
                )}
                <button
                  onClick={removeMedia}
                  className="absolute top-3 right-3 bg-black/70 hover:bg-black text-white p-2 rounded-full transition"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Upload Area */}
            {!mediaPreview && (
              <div className="mb-8">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-700 hover:border-pink-500/50 rounded-2xl py-12 px-6 flex flex-col items-center justify-center cursor-pointer transition bg-zinc-900/50"
                >
                  <UploadCloud size={40} className="text-zinc-500 mb-3" />
                  <p className="font-medium text-sm mb-1">Add Photo or Video</p>
                  <p className="text-xs text-zinc-500">Videos must be 15 seconds or less</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = 'image/*';
                        fileInputRef.current.click();
                      }
                    }}
                    className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-pink-500/40 rounded-xl py-3 text-sm transition"
                  >
                    <ImageIcon size={18} className="text-pink-400" />
                    Photo
                  </button>
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = 'video/*';
                        fileInputRef.current.click();
                      }
                    }}
                    className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-pink-500/40 rounded-xl py-3 text-sm transition"
                  >
                    <Video size={18} className="text-pink-400" />
                    Video
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Info */}
            <div className="text-xs text-zinc-500 text-center">
              Posts on Discover are free for everyone to see
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}