'use client';

import { useParams } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import Sidebar from '../../../components/Sidebar';
import { createClient } from '../../../lib/supabase';
import { Radio, Heart, Gift, Users, Crown, Lock, Star } from 'lucide-react';

const supabase = createClient();

export default function LiveRoomPage() {
  const params = useParams();
  const streamId = params.id as string;

  const stream = {
    title: 'Morning Workout Routine',
    creator: 'Scarlet Rose',
    viewers: 342,
    bio: 'Fitness Domme • Tease & Denial specialist',
  };

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

  // Load existing messages + listen for new ones in real-time
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('live_messages')
        .select('*')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: true });

      if (data) setMessages(data);
    };

    fetchMessages();

    // Real-time subscription
    const channel = supabase
      .channel(`live-chat-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_messages',
          filter: `stream_id=eq.${streamId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!chatInput.trim()) return;

    const { error } = await supabase.from('live_messages').insert({
      stream_id: streamId,
      user_name: 'You',
      message: chatInput,
    });

    if (!error) {
      setChatInput('');
    }
  };

  const sendTip = (amount: number) => {
    const newTotal = totalTips + amount;
    setTotalTips(newTotal);

    if (amount > topTipper.amount) {
      setTopTipper({ name: 'You', amount });
    }
    alert(`Thank you! You sent £${amount}`);
  };

  const requestPrivateSession = () => {
    const totalCost = requestedMinutes * pricePerMinute;
    setPrivateRequest({ minutes: requestedMinutes, cost: totalCost, status: 'pending' });
    setShowPrivateForm(false);
    alert(`Private session request sent for ${requestedMinutes} minutes (£${totalCost})`);
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

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full text-sm font-bold">
                <Radio size={16} /> LIVE
              </div>
              <div className="flex items-center gap-1 text-zinc-400">
                <Users size={16} /> {stream.viewers} watching
              </div>
            </div>
            <div className="text-sm text-zinc-400">Stream ID: {streamId}</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Video Area */}
              <div className="relative rounded-2xl overflow-hidden bg-zinc-900 aspect-video flex items-center justify-center border border-zinc-800">
                {isPrivateActive ? (
                  <div className="text-center">
                    <Lock className="mx-auto mb-3 text-pink-500" size={48} />
                    <p className="text-xl font-semibold">Private Session Active</p>
                    <p className="text-zinc-400 mt-1">Only creator + paying sub can watch</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-6xl mb-4">📹</div>
                    <p className="text-xl font-semibold mb-2">Live Video Stream</p>
                    <p className="text-zinc-400 text-sm">Real stream will appear here</p>
                  </div>
                )}
                
                <div className="absolute top-4 left-4 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  LIVE
                </div>
              </div>

              {/* Creator Info + Showcased Sub */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                      {stream.creator[0]}
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">{stream.creator}</h1>
                      <p className="text-pink-400 text-sm">{stream.bio}</p>
                    </div>
                  </div>

                  <div className="flex gap-3 md:ml-auto">
                    <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition">
                      <Heart size={18} /> Follow
                    </button>
                    <button className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 px-6 py-2.5 rounded-xl text-sm font-medium transition">
                      Subscribe
                    </button>
                  </div>
                </div>

                {/* Showcased Sub */}
                <div className="mt-5 bg-gradient-to-br from-[#2a1f3d] via-[#241b35] to-[#1f162e] rounded-2xl p-4 flex items-center justify-between border border-purple-900/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                      <Crown className="text-black" size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-300 flex items-center gap-1">
                          <Star size={14} /> Showcased Sub
                        </span>
                        <span className="text-[10px] bg-yellow-400 text-black font-bold px-2 py-0.5 rounded-full">TOP TIPPER</span>
                      </div>
                      <span className="font-semibold text-lg text-white">{topTipper.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-400">Tipped</div>
                    <div className="font-bold text-pink-400">£{topTipper.amount}</div>
                  </div>
                </div>
              </div>

              {/* Tip Section */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Gift className="text-pink-500" /> Send a Tip
                  </h2>
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      value={tipGoal}
                      onChange={(e) => setTipGoal(Number(e.target.value))}
                      className="w-20 bg-zinc-800 rounded px-2 py-1 text-center text-sm"
                    />
                    <span className="text-zinc-400">goal</span>
                  </div>
                </div>

                <div className="flex justify-between text-sm mb-1">
                  <span>£{totalTips}</span>
                  <span>£{tipGoal}</span>
                </div>

                <div className="w-full bg-zinc-800 rounded-full h-3 mb-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-rose-500 h-3 rounded-full transition-all" 
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  {[10, 25, 50, 100, 250].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => sendTip(amount)}
                      className="flex-1 bg-zinc-800 hover:bg-pink-600 hover:text-white px-6 py-3 rounded-xl font-medium transition text-sm"
                    >
                      £{amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Request Private Session */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
                <h2 className="font-semibold flex items-center gap-2 mb-4">
                  <Lock className="text-pink-500" /> Request Private Session
                </h2>

                {!showPrivateForm && !privateRequest && (
                  <button
                    onClick={() => setShowPrivateForm(true)}
                    className="w-full flex items-center justify-center gap-2 border border-pink-500 hover:bg-pink-950 text-pink-400 py-3 rounded-2xl font-medium transition"
                  >
                    🎥 Request Private Session <span className="text-xs opacity-70">(from £{pricePerMinute}/min)</span>
                  </button>
                )}

                {showPrivateForm && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-zinc-400 mb-1 block">How many minutes?</label>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={requestedMinutes}
                        onChange={(e) => setRequestedMinutes(Number(e.target.value))}
                        className="w-full accent-pink-500"
                      />
                      <div className="text-center text-pink-400 font-medium mt-1">{requestedMinutes} minutes</div>
                    </div>

                    <div className="flex justify-between items-center bg-zinc-800 p-3 rounded-xl">
                      <div>
                        <div className="text-sm text-zinc-400">Rate</div>
                        <div className="font-semibold">£{pricePerMinute}/min</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-zinc-400">Total</div>
                        <div className="text-2xl font-bold text-pink-400">£{requestedMinutes * pricePerMinute}</div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setShowPrivateForm(false)} className="flex-1 bg-zinc-800 py-3 rounded-xl">Cancel</button>
                      <button onClick={requestPrivateSession} className="flex-1 bg-pink-600 hover:bg-pink-500 py-3 rounded-xl font-medium">Request Private</button>
                    </div>
                  </div>
                )}

                {privateRequest && (
                  <div className="bg-zinc-800 p-4 rounded-xl text-center">
                    <p className="text-pink-400">Private request sent for {privateRequest.minutes} mins</p>
                    <p className="text-sm text-zinc-400">£{privateRequest.cost}</p>
                    {privateRequest.status === 'pending' && (
                      <button onClick={acceptPrivateSession} className="mt-3 text-xs bg-zinc-700 px-4 py-1.5 rounded-full hover:bg-zinc-600">
                        (Creator) Accept Private Session
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

           {/* Real-time Chat Sidebar */}
<div className="bg-zinc-900 rounded-2xl border border-zinc-800 flex flex-col h-[600px] lg:h-[600px] pb-20 lg:pb-0">
  <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
    <span className="font-semibold">Live Chat</span>
    <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">
      {messages.length} messages
    </span>
  </div>

  <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
    {messages.map((msg, index) => (
      <div key={index} className="flex gap-2">
        <span className="font-medium text-pink-400 min-w-[70px]">{msg.user_name}:</span>
        <span className="text-zinc-300">{msg.message}</span>
      </div>
    ))}
  </div>

  <div className="p-4 border-t border-zinc-800">
    <div className="flex gap-2 w-full">
      <input
        type="text"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        placeholder="Send a message..."
        className="flex-1 min-w-0 bg-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-pink-500"
      />
      <button
        onClick={sendMessage}
        className="bg-pink-600 hover:bg-pink-500 px-5 py-2.5 rounded-xl text-sm font-medium transition shrink-0"
      >
        Send
      </button>
    </div>
  </div>
</div>

          </div>
        </div>
      </main>
    </div>
  );
}