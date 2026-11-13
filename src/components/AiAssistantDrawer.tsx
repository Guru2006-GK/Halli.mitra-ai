import { useState, type FormEvent } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { api } from '../services/api';
import type { UserRole } from '../types';

interface AiAssistantDrawerProps {
  open: boolean;
  userRole: UserRole;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  source?: string;
}

const SUGGESTED_PROMPTS = [
  'Which bus should I take to reach PES Mandya?',
  'When will my bus arrive?',
  'What alternatives are available if my bus is cancelled?',
  'Are other students travelling to my college?',
  'Which route is the fastest?',
  'How many buses are needed tomorrow?',
];

export function AiAssistantDrawer({ open, userRole, onClose }: AiAssistantDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! Ask me about live bus ETAs, alternative transport when a bus cancels, student carpools, fastest routes, or tomorrow’s predicted fleet demand.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const sendQuery = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.chatAi(trimmed, userRole);
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          sender: 'assistant',
          text: res.reply,
          source: res.source,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          sender: 'assistant',
          text: err instanceof Error ? err.message : 'Unable to reach transit AI right now.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendQuery(input);
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
      role="dialog"
      aria-label="ROUTELESS Transit AI Assistant"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              ROUTELESS Transit Assistant
            </h2>
            <p className="text-xs text-slate-500">Grounded in live fleet, routes & demand</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI Assistant"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Quick question buttons */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-500">Suggested Questions</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendQuery(q)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left text-xs font-medium text-slate-700 transition-colors hover:border-teal-600 hover:text-teal-800"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Message stream */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-teal-700 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              {m.text}
            </div>
            {m.source && (
              <span className="mt-1 font-mono text-[11px] text-slate-400">
                Source: {m.source}
              </span>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-xs font-medium text-slate-500">Analyzing live transit state...</div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <label htmlFor="ai-chat-input" className="sr-only">
            Ask a transit question
          </label>
          <input
            id="ai-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about buses, alternatives, carpools..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white transition-colors hover:bg-teal-800 disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
