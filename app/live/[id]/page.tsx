'use client';

import { useParams } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import Sidebar from '../../../components/Sidebar';
import { Radio, Heart, Gift, Users, Crown, Lock } from 'lucide-react';

export default function LiveRoomPage() {
  const params = useParams();
  const id = params.id as string;

  const stream = {
    title: 'Morning Workout Routine',
    creator: 'Scarlet Rose',
    viewers: 342,
    bio: 'Fitness Domme • Tease & Denial specialist',
  };

  // === Tip Goal (editable) ===
  const [tipGoal, setTipGoal] = useState(2000);
  const [totalTips, setTotalTips] = useState(1240);

  // === Showcased Sub (Top Tipper) ===
  const [topTipper] = useState({
    name: 'TommyB',
    amount: 680,
  });

  // === Private Session State ===
  const [isPrivateActive, setIsPrivateActive] = useState(false);
  const [privateRequest, setPrivateRequest] = useState<any>(null);

  // Creator can set their price per minute
  const [pricePerMinute, setPricePerMinute] = useState(15);

  // Private session request form
  const [requestedMinutes, setRequestedMinutes] = useState(15);
  const [showPrivateForm, setShowPrivateForm] = useState(false);

  // Chat
  const [messages, setMessages] = useState([
    { user: 'Slave42', text: 'Good evening Goddess' },
    { user: 'PayPig88', text: 'Sent tribute 💸' },
    { user: 'SubbyBoy', text: 'You look incredible today' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    setMessages([...messages, { user: 'You', text: chatInput }]);
    setChatInput('');
  };

  const sendTip = (amount: number) => {
    const newTotal = totalTips + amount;
    setTotalTips(newTotal);
    alert(`Thank you! You sent £${amount}`);
  };

  // Request Private Session
  const requestPrivateSession = () => {
    const totalCost = requestedMinutes * pricePerMinute;
    setPrivateRequest({
      minutes: requestedMinutes,
      cost: totalCost,
      status: 'pending',
    });
    setShowPrivateForm(false);
    alert(`Private session request sent for ${requestedMinutes} minutes (£${totalCost}). Waiting for creator to accept...`);
  };

  // Creator accepts private (demo only)
  const acceptPrivateSession = () => {
    if (privateRequest) {
      setIsPrivateActive(true);
      setPrivateRequest({ ...privateRequest, status: 'active' });
      alert('Private session started! Only you and the sub can see the stream now.');
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
            <div className="text-sm text-zinc-400">Stream ID: {id}</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* === MAIN CONTENT === */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Video Area */}
              <div className="relative rounded-2xl overflow-hidden bg-zinc-900 aspect-video flex items-center justify-center border border-zinc-800">
                {isPrivateActive ? (
                  <div className="text-center">
                    <Lock className="mx-auto mb-3 text-pink-500" size={48} />
                    <p className="text-xl font-semibold">Private Session Active</p>
                    <p className="text-zinc-400 mt-1">Only you and the paying sub can see this stream</p>
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
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-2xl font-bold">
                    {stream.creator[0]}
                  </div>
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold">{stream.creator}</h1>
                    <p className="text-pink-400 text-sm mb-3">{stream.bio}</p>

                    {/* Showcased Sub */}
                    <div className="bg-zinc-800 rounded-xl p-3 mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                          <Crown className="text-black" size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">Showcased Sub</span>
                            <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold">TOP TIPPER</span>
                          </div>
                          <span className="text-pink-400 font-medium">{topTipper.name}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-zinc-400">Tipped</div>
                        <div className="font-bold text-pink-400">£{topTipper.amount}</div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition">
                        <Heart size={18} /> Follow
                      </button>
                      <button className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 px-5 py-2.5 rounded-xl text-sm font-medium transition">
                        Subscribe
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tip Section with Editable Goal */}
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
                    className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 py-3 rounded-xl font-medium transition"
                  >
                    Request Private Session
                  </button>
                )}

                {showPrivateForm && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-zinc-400">How many minutes?</label>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={requestedMinutes}
                        onChange={(e) => setRequestedMinutes(Number(e.target.value))}
                        className="w-full accent-pink-500"
                      />
                      <div className="flex justify-between text-sm">
                        <span>5 min</span>
                        <span className="font-bold text-pink-400">{requestedMinutes} minutes</span>
                        <span>60 min</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-zinc-800 p-3 rounded-xl">
                      <div>
                        <div className="text-sm text-zinc-400">Your rate</div>
                        <div className="font-bold">£{pricePerMinute}/min</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-zinc-400">Total</div>
                        <div className="text-xl font-bold text-pink-400">
                          £{requestedMinutes * pricePerMinute}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowPrivateForm(false)}
                        className="flex-1 bg-zinc-800 py-3 rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={requestPrivateSession}
                        className="flex-1 bg-pink-600 hover:bg-pink-500 py-3 rounded-xl font-medium"
                      >
                        Request Private
                      </button>
                    </div>
                  </div>
                )}

                {privateRequest && (
                  <div className="bg-zinc-800 p-4 rounded-xl text-center">
                    <p className="text-pink-400 font-medium">Private request sent!</p>
                    <p className="text-sm text-zinc-400 mt-1">
                      {privateRequest.minutes} minutes • £{privateRequest.cost}
                    </p>
                    {privateRequest.status === 'pending' && (
                      <button 
                        onClick={acceptPrivateSession}
                        className="mt-3 text-xs bg-zinc-700 hover:bg-zinc-600 px-4 py-1.5 rounded-full"
                      >
                        (Creator Demo) Accept Private
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Chat Sidebar */}
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 flex flex-col h-[600px]">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                <span className="font-semibold">Live Chat</span>
                <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">
                  {messages.length} messages
                </span>
              </div>

              <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                {messages.map((msg, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="font-medium text-pink-400 min-w-[70px]">{msg.user}:</span>
                    <span className="text-zinc-300">{msg.text}</span>
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