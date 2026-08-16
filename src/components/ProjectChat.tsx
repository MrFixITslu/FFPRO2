import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import { projectsService } from '../services/projectsService';
import { realtimeService } from '../services/realtimeService';
import { ProjectChatMessage } from '../types';

interface Props {
  projectId: string;
  currentUserId?: string;
}

const POLL_INTERVAL_MS = 15000; // Fallback sync

const ProjectChat: React.FC<Props> = ({ projectId, currentUserId }) => {
  const [messages, setMessages] = useState<ProjectChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const fresh = await projectsService.getMessages(projectId, lastTimestampRef.current || undefined);
      if (fresh.length > 0) {
        lastTimestampRef.current = fresh[fresh.length - 1].createdAt;
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newOnes = fresh.filter(f => !existingIds.has(f.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        scrollToBottom();
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load messages.');
    }
  }, [projectId, scrollToBottom]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    lastTimestampRef.current = null;

    (async () => {
      try {
        const initial = await projectsService.getMessages(projectId);
        if (cancelled) return;
        setMessages(initial);
        if (initial.length > 0) lastTimestampRef.current = initial[initial.length - 1].createdAt;
        setLoading(false);
        scrollToBottom(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load chat.');
          setLoading(false);
        }
      }
    })();

    // Real-time instant message listener
    const unsub = realtimeService.on('chat_message', (payload: any) => {
      if (payload?.projectId === projectId && payload.message) {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.message.id)) return prev;
          return [...prev, payload.message];
        });
        scrollToBottom(true);
      }
    });

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      unsub();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId, poll, scrollToBottom]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      const message = await projectsService.sendMessage(projectId, body);
      setMessages(prev => [...prev, message]);
      lastTimestampRef.current = message.createdAt;
      scrollToBottom();
    } catch (err: any) {
      setError(err.message || 'Failed to send message.');
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex flex-col h-[60vh] sm:h-[65vh] bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[11px] font-bold text-slate-400 uppercase tracking-wider">Loading chat…</div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <p className="text-sm text-slate-400">No messages yet. Say hello to your collaborators.</p>
          </div>
        ) : (
          messages.map(m => {
            const isMe = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>
                  {!isMe && <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-indigo-500">{m.senderName}</p>}
                  <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
                  <p className={`text-[9px] mt-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>{formatTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && <p className="text-[11px] text-red-500 px-3 sm:px-4 pb-1">{error}</p>}

      <div className="border-t border-slate-200 p-2 sm:p-3 flex items-end gap-2 bg-slate-50">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message the team…"
          rows={1}
          className="flex-1 resize-none px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 max-h-28"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="w-11 h-11 shrink-0 flex items-center justify-center bg-indigo-600 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ProjectChat;
