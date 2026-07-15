'use client';

import { useParams } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';
import { Radio, Heart, Gift, Users, Crown, Lock, Star, ArrowLeft } from 'lucide-react';

const supabase = createClient();

export default function LiveRoomPage() {
  const params = useParams();
  const streamId = params.id as string;

  const [tipGoal, setTipGoal] = useState(2000);
  const [totalTips, setTotalTips] = useState(1240);
  const [topTipper, setTopTipper] = useState({ name: 'TommyB', amount: 680 });
  const [isPrivateActive, setIsPrivateActive] = useState(false);
  const [privateRequest, setPrivateRequest] = useState<any>(null);
  const [pricePerMinute, setPricePerMinute] = useState(15);
  const [requestedMinutes, setRequestedMinutes] = useState(15);
  const [showPrivateForm, setShowPrivateForm] = useState(false);

  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  // Real-time chat logic (unchanged)
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('live_messages')
        .select('*')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel(`live-chat-${streamId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'live_messages',
        filter: `stream_id=eq.${streamId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [streamId]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    await supabase.from('live_messages').insert({
      stream_id: streamId,
      user_name: 'You',
      message: chatInput,
    });
    setChatInput('');
  };

  const sendTip = (amount: number) => {
    const newTotal = totalTips + amount;
    setTotalTips(newTotal);
    if (amount > topTipper.amount) setTopTipper({ name: 'You', amount });
    alert(`Thank you! You sent £${amount}`);
  };

  const requestPrivateSession = () => {
    const totalCost = requestedMinutes * pricePerMinute;
    setPrivateRequest({ minutes: requestedMinutes, cost: totalCost, status: 'pending' });
    setShowPrivateForm(false);
    alert(`Private request sent for ${requestedMinutes} mins (£${totalCost})`);
  };

  const acceptPrivateSession = () => {
    if (privateRequest) {
      setIsPrivateActive(true);
      setPrivateRequest({ ...privateRequest, status: 'active' });
      alert('Private session started!');
    }
  };

  const progress = Math.min((totalTips / tipGoal) * 100, 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile Top Bar */}
        <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeft size={20} />
            <span className="text-sm">Back to Live</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-pink-600 flex items-center justify-center text-xs font-bold">SB</div>
        </div>

        <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
          
          {/* Video */}
          <div className="relative rounded-2xl overflow-hidden bg-zinc-900 aspect-video border border-zinc-800">
            {isPrivateActive ? (
              <div className="flex items-center justify-center h-full">
                <Lock className="text-pink-500" size={48} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <div className="text-6xl mb-2">📹</div>
                  <p>Live Video Stream</p>
                </div>
              </div>
            )}
            <div className="absolute top-4 left-4 bg-red-600 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
              LIVE
            </div>
          </div>

          {/* Creator Info */}
          <div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-xl font-bold">S</div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">Morning Workout Routine 🔥</h1>
                <p className="text-pink-400">Scarlet Rose</p>
              </div>
              <div className="flex gap-2">
                <button className="bg-gradient-to-r from-pink-600 to-rose-500 px-5 py-2 rounded-full text-sm font-medium">+ Follow</button>
                <button className="bg-gradient-to-r from-pink-600 to-rose-500 px-5 py-2 rounded-full text-sm font-medium">♡ Tip</button>
              </div>
            </div>
          </div>

          {/* Showcased Sub */}
          <div className="bg-gradient-to-br from-[#2a1f3d] via-[#241b35] to-[#1f162e] rounded-2xl p-4 flex items-center justify-between border border-purple-900/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <Crown className="text-black" size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <Star size={14} /> Showcased Sub
                  <span className="bg-yellow-400 text-black text-[10px] px-2 py-0.5 rounded-full font-bold">TOP TIPPER</span>
                </div>
                <span className="font-semibold">{topTipper.name}</span>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-zinc-400">Tipped</div>
              <div className="font-bold text-pink-400">£{topTipper.amount}</div>
            </div>
          </div>

          {/* Request Private Session */}
          <button 
            onClick={() => setShowPrivateForm(true)}
            className="w-full border border-pink-500 text-pink-400 py-3 rounded-2xl font-medium flex items-center justify-center gap-2"
          >
            🎥 Request Private Session <span className="text-xs opacity-70">(from £{pricePerMinute}/min)</span>
          </button>

          {/* Bio */}
          <p className="text-sm text-zinc-400">
            Join me for an intense full-body workout! Tips keep me motivated ❤️
          </p>

          {/* Chat Section */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800">
            <div className="p-4 border-b border-zinc-800 font-semibold">Live Chat & Tips</div>
            
            <div ref={chatRef} className="h-64 overflow-y-auto p-4 space-y-3 text-sm">
              {messages.map((msg, index) => (
                <div key={index} className="flex gap-2">
                  <span className="font-medium text-pink-400">{msg.user_name}:</span>
                  <span>{msg.message}</span>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-zinc-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Say something..."
                className="flex-1 bg-zinc-800 rounded-xl px-4 py-2 text-sm outline-none"
              />
              <button onClick={sendMessage} className="bg-pink-600 px-4 rounded-xl">Send</button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}