'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';

// Internal portal routes where the public assistant should NOT appear.
const HIDDEN_PREFIXES = ['/dashboard', '/leads', '/tasks', '/portal-auth', '/client'];

type Msg = { role: 'user' | 'assistant'; content: string };

const WELCOME: Msg = {
  role: 'assistant',
  content: "Hi! I'm the JARVIS PRIME assistant. Ask me about pricing, how we book meetings, or results — happy to help. 👋",
};

const QUICK_REPLIES = [
  'How does it work?',
  'What does it cost?',
  'How is this better than an SDR?',
];

// Turns "/book-call" style links in replies into real clickable links.
function renderContent(text: string) {
  const parts = text.split(/(\/book-call|https?:\/\/[^\s]+|[\w.+-]+@[\w-]+\.[\w.-]+)/g);
  return parts.map((part, i) => {
    if (part === '/book-call') {
      return (
        <a key={i} href="/book-call" className="font-semibold text-blue-600 underline underline-offset-2">
          book a free call
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
          {part}
        </a>
      );
    }
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(part)) {
      return (
        <a key={i} href={`mailto:${part}`} className="text-blue-600 underline">
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    setShowQuick(false);
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.reply || "Sorry, I couldn't respond just now. Try hello@jarvisprime.me." },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Connection issue. You can reach us at hello@jarvisprime.me or /book-call.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Hide on internal portal pages (declared after hooks to keep hook order stable).
  const hidden = HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p));
  if (hidden) return null;

  return (
    <>
      {/* Chat panel */}
      <div
        className={`fixed bottom-24 right-5 z-[60] w-[calc(100vw-2.5rem)] max-w-[380px] origin-bottom-right transition-all duration-300 ${
          open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="flex h-[min(560px,70vh)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-sm font-black text-white">
                J
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-green-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">JARVIS PRIME Assistant</div>
                <div className="text-xs text-slate-300">Typically replies instantly</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="mr-2 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-xs font-black text-white">
                    J
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-md bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {renderContent(m.content)}
                </div>
              </div>
            ))}

            {/* Quick replies */}
            {showQuick && !loading && (
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="mr-2 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-xs font-black text-white">
                  J
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              maxLength={1500}
              className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white transition-all hover:shadow-lg hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          <div className="bg-white pb-2 text-center text-[10px] text-slate-400">
            Powered by JARVIS PRIME AI
          </div>
        </div>
      </div>

      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-xl shadow-blue-600/30 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-blue-600/40"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <span className="relative">
            <MessageCircle className="h-6 w-6" />
            <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-cyan-200" />
          </span>
        )}
      </button>
    </>
  );
}
