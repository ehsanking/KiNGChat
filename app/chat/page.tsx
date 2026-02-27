'use client';

import { useState, useEffect } from 'react';
import io, { type Socket } from 'socket.io-client';
import { Send, Search, User, Settings, Shield } from 'lucide-react';

export default function ChatDashboard() {
  const [socket, setSocket] = useState<any>(null);
  const [messages, setMessages] = useState<{ id: string; text: string; sender: string }[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    // Connect to WebSocket server
    const newSocket = io();

    newSocket.on('connect', () => {
      console.log('Connected to socket server');
      setSocket(newSocket);
      // Mock user join
      newSocket.emit('join', 'user-123');
    });

    newSocket.on('receiveMessage', (data: any) => {
      setMessages((prev) => [...prev, { id: Date.now().toString(), text: data.messagePayload, sender: 'them' }]);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;

    // Encrypt message here before sending
    const encryptedPayload = input; // Stub

    socket.emit('sendMessage', {
      recipientId: 'user-456', // Mock recipient
      messagePayload: encryptedPayload,
    });

    setMessages((prev) => [...prev, { id: Date.now().toString(), text: input, sender: 'me' }]);
    setInput('');
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans">
      {/* Sidebar */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
            <Shield className="w-5 h-5" /> KiNGChat
          </h2>
          <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <Settings className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
            <input
              type="text"
              placeholder="Search username..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Mock Contact List */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 flex items-center gap-3 hover:bg-zinc-800 cursor-pointer transition-colors border-b border-zinc-800/50">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <User className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <p className="font-medium text-sm">user_{i}</p>
                <p className="text-xs text-zinc-500 truncate">Encrypted message...</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-zinc-950">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3 bg-zinc-900/30">
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
            <User className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h3 className="font-medium">user_1</h3>
            <p className="text-xs text-emerald-500">E2E Encrypted Session</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  msg.sender === 'me'
                    ? 'bg-emerald-600 text-white rounded-br-none'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-none'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type an encrypted message..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 p-3 rounded-xl transition-colors flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
