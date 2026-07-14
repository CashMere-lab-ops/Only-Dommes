'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Sidebar from '../../../components/Sidebar';
import { Radio, Heart, Gift, Users } from 'lucide-react';

export default function LiveRoomPage() {
  const params = useParams();
  const id = params.id as string;

  const stream = {
    title: 'Private Domme Session',
    creator: 'Mistress Vex',
    viewers: 567,
    bio: 'Professional Dominatrix • Findom & Femdom specialist',
  };

  const [messages, setMessages] = useState([
    { user: 'Slave42', text: 'Good evening Goddess' },
    { user: 'PayPig88', text: 'Sent tribute 💸' },
    { user: 'SubbyBoy', text: 'You look incredible today' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [totalTips, setTotalTips] = useState(1240);

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    setMessages([...messages, { user: 'You', text: chatInput }]);
    setChatInput('');
  };

  const sendTip = (amount: number) => {
    setTotalTips(totalTips + amount);
    alert(`Thank you! You sent £${amount}`);
  };

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
            <div className="text-sm text-zinc-400">
              Stream ID: {id}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Video Player Area */}
              <div className="relative rounded-2xl overflow-hidden bg-zinc-900 aspect-video flex items-center justify-center border border-zinc-800">
                <div className="text-center">
                  <div className="text-6xl mb-4">📹</div>
                  <p className="text-xl font-semibold mb-2">Live Video Stream</p>
                  <p className="text-zinc-400 text-sm">Real stream will appear here (Cloudflare Stream)</p>
                </div>
                
                <div className="absolute top-4 left-4 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  LIVE
                </div>
              </div>

              {/* Creator Info */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-2xl font-bold">
                    {stream.creator[0]}
                  </div>
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold">{stream.creator}</h1>
                    <p className="text-pink-400 text-sm mb-2">{stream.bio}</p>
                    
                    <div className="flex gap-3 mt-4">
                      <button 
                        onClick={() => alert('Follow feature coming soon!')}
                        className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition"
                      >
                        <Heart size={18} /> Follow
                      </button>
                      <button 
                        onClick={() => alert('Subscribe feature coming soon!')}
                        className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 px-5 py-2.5 rounded-xl text-sm font-medium transition"
                      >
                        Subscribe
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tip Section */}
              <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Gift className="text-pink-500" /> Send a Tip
                  </h2>
                  <div className="text-sm text-zinc-400">
                    Total tips received: <span className="text-pink-400 font-bold">£{totalTips}</span>
                  </div>
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
                
                <p className="text-xs text-zinc-500 mt-3 text-center">
                  All tips go directly to the creator
                </p>
              </div>

            </div>

            {/* Live Chat Sidebar - FIXED */}
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 flex flex-col h-[600px]">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                <span className="font-semibold">Live Chat</span>
                <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">
                  {messages.length} messages
                </span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                {messages.map((msg, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="font-medium text-pink-400 min-w-[70px]">{msg.user}:</span>
                    <span className="text-zinc-300">{msg.text}</span>
                  </div>
                ))}
              </div>

              {/* Chat Input - FIXED */}
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