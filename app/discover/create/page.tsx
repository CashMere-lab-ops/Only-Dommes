'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, Video, X, Upload } from 'lucide-react';
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

    // Check if photo or video
    if (file.type.startsWith('image/')) {
      setMediaType('photo');
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    } else if (file.type.startsWith('video/')) {
      // Check video duration (max 15 seconds)
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

    // For now we just simulate posting (we will connect to database later)
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
          {/* Mobile Top Bar */}
          <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/discover" className="text-zinc-400 hover:text-white">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold">Create Post</h1>
          </div>

          <div className="max-w-2xl mx-auto px-4 py-8">

            <div className="mb-8 hidden lg:block">
              <Link href="/discover" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
                <ArrowLeft size={18} /> Back to Discover
              </Link>
              <h1 className="text-3xl font-bold">Create Post</h1>
              <p className="text-zinc-400 mt-1">Share a photo, video or text with your audience</p>
            </div>

            {error && (
              <div className="mb-6 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* Caption */}
            <div className="mb-6">
              <label className="text-sm text-zinc-400 mb-2 block">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 px-4 outline-none focus:border-pink-500 resize-none text-sm"
              />
            </div>

            {/* Media Preview */}
            {mediaPreview && (
              <div className="mb-6 relative">
                {mediaType === 'photo' && (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="w-full rounded-2xl max-h-[400px] object-cover"
                  />
                )}
                {mediaType === 'video' && (
                  <video
                    src={mediaPreview}
                    controls
                    className="w-full rounded-2xl max-h-[400px]"
                  />
                )}
                <button
                  onClick={removeMedia}
                  className="absolute top-3 right-3 bg-black/70 hover:bg-black text-white p-2 rounded-full"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Upload Buttons */}
            {!mediaPreview && (
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'image/*';
                      fileInputRef.current.click();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-pink-500/50 rounded-2xl py-8 transition"
                >
                  <ImageIcon size={28} className="text-pink-400" />
                  <span className="text-sm font-medium">Add Photo</span>
                </button>

                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'video/*';
                      fileInputRef.current.click();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-pink-500/50 rounded-2xl py-8 transition"
                >
                  <Video size={28} className="text-pink-400" />
                  <span className="text-sm font-medium">Add Video</span>
                  <span className="text-xs text-zinc-500">Max 15 seconds</span>
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Post Button */}
            <button
              onClick={handlePost}
              disabled={posting || (!caption.trim() && !mediaFile)}
              className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 text-white font-semibold py-3.5 rounded-2xl transition disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}