import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Cpu, 
  RefreshCw, 
  ExternalLink, 
  TrendingUp, 
  Bot, 
  Search, 
  Newspaper,
  ShieldCheck,
  Zap,
  Layers,
  ArrowUpRight
} from 'lucide-react';

export interface AiNewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  timeAgo: string;
  snippet: string;
  player: 'OpenAI' | 'Google DeepMind' | 'Anthropic' | 'Meta AI' | 'Microsoft AI' | 'Open Source & Frontier' | 'Industry & Research' | string;
  category: string;
}

export interface AiBriefingResponse {
  briefing: {
    summary: string;
    takeaways: string[];
    provider: 'ollama' | 'gemini' | 'deterministic' | string;
    model?: string;
    updatedAt: string;
  };
  articles: AiNewsItem[];
  ollamaStatus?: {
    online: boolean;
    model: string | null;
  };
  playerStats?: Record<string, number>;
  fetchedAt: string;
}

export const AiNewsBriefing: React.FC = () => {
  const [data, setData] = useState<AiBriefingResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchNews = async (force = false) => {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch(`/api/ai-news${force ? '?refresh=true' : ''}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch AI news (${res.status})`);
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('[AiNewsBriefing] Fetch failed:', err);
      setError(err.message || 'Could not load AI news briefing.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNews(false);
  }, []);

  const playerBadges: Record<string, { bg: string; text: string; border: string }> = {
    'OpenAI': { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    'Google DeepMind': { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
    'Anthropic': { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
    'Meta AI': { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
    'Microsoft AI': { bg: 'bg-cyan-50', text: 'text-cyan-900', border: 'border-cyan-200' },
    'Open Source & Frontier': { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
    'Industry & Research': { bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-200' },
  };

  const filteredArticles = useMemo(() => {
    if (!data?.articles) return [];
    return data.articles.filter(item => {
      const matchesPlayer = selectedPlayer === 'All' || item.player === selectedPlayer;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || 
        item.title.toLowerCase().includes(q) || 
        item.snippet.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.player.toLowerCase().includes(q);
      return matchesPlayer && matchesSearch;
    });
  }, [data?.articles, selectedPlayer, searchQuery]);

  const playersList = ['All', 'OpenAI', 'Google DeepMind', 'Anthropic', 'Meta AI', 'Microsoft AI', 'Open Source & Frontier'];

  return (
    <section id="ai-industry-briefing" className="executive-card p-6 rounded-xl flex flex-col justify-between lg:col-span-2 space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-stone-950 via-stone-800 to-indigo-950 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
            <Cpu size={17} className="text-indigo-200" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-stone-900 tracking-tight">AI Industry Intelligence Briefing</h3>
              {data?.ollamaStatus?.online ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                  <Bot size={11} className="text-emerald-600" />
                  Ollama Local Active ({data.ollamaStatus.model || 'Connected'})
                </span>
              ) : data?.briefing?.provider === 'gemini' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Sparkles size={11} className="text-indigo-500" />
                  Synthesized via Gemini 3.6 Flash
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                  <ShieldCheck size={11} className="text-stone-500" />
                  Live Wire Verified
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-500 font-medium mt-0.5">
              Curated developments across OpenAI, Google DeepMind, Anthropic, Meta, and open-source models with outbound sources.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            id="btn-refresh-ai-news"
            onClick={() => fetchNews(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:text-stone-950 bg-stone-50 hover:bg-stone-100 rounded-xl border border-stone-200 transition shadow-2xs disabled:opacity-50"
            title="Fetch latest updates from all feeds"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-stone-900' : ''} />
            <span>{refreshing ? 'Updating Feed...' : 'Refresh News'}</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="space-y-4 animate-pulse">
          <div className="h-28 bg-stone-100 rounded-xl border border-stone-200"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="h-28 bg-stone-50 rounded-xl border border-stone-200"></div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !data && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <p>{error}</p>
          <button 
            onClick={() => fetchNews(true)}
            className="px-3 py-1 font-semibold text-rose-900 bg-white rounded-lg border border-rose-300 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Executive Synthesis Banner */}
          <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-stone-900 via-stone-850 to-stone-900 text-stone-100 shadow-sm border border-stone-800 relative overflow-hidden">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-300">Executive Synthesis</h4>
              </div>
              <span className="text-[10px] text-stone-400 font-mono">
                {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>

            <p className="text-xs sm:text-[13px] text-stone-200 leading-relaxed font-normal mb-3.5 break-words [overflow-wrap:anywhere]">
              {data.briefing.summary}
            </p>

            {data.briefing.takeaways && data.briefing.takeaways.length > 0 && (
              <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {data.briefing.takeaways.map((takeaway, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-white/5 p-2.5 rounded-lg border border-white/5">
                    <Zap size={13} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-stone-300 leading-snug break-words [overflow-wrap:anywhere]">
                      {takeaway}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filtering & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            {/* Player Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full text-xs no-scrollbar">
              {playersList.map(player => {
                const isSelected = selectedPlayer === player;
                return (
                  <button
                    key={player}
                    type="button"
                    onClick={() => setSelectedPlayer(player)}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] whitespace-nowrap transition cursor-pointer border ${
                      isSelected 
                        ? 'bg-stone-900 text-white border-stone-900 shadow-2xs' 
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200/80'
                    }`}
                  >
                    {player}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[220px] shrink-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter stories, models, releases..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>
          </div>

          {/* Articles Grid */}
          {filteredArticles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredArticles.map((article) => {
                const badge = playerBadges[article.player] || playerBadges['Industry & Research'];

                return (
                  <a
                    key={article.id}
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-stone-50/70 hover:bg-white rounded-xl border border-stone-200/85 hover:border-stone-300 shadow-2xs hover:shadow-sm transition cursor-pointer group flex flex-col justify-between gap-3 min-w-0"
                  >
                    <div>
                      {/* Badge & Source Row */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-md border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {article.player}
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold text-stone-500 bg-stone-100 rounded">
                            {article.category}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-stone-400 shrink-0">
                          {article.timeAgo}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 className="text-xs font-bold text-stone-900 group-hover:text-indigo-950 transition leading-snug break-words [overflow-wrap:anywhere] mb-1.5">
                        {article.title}
                      </h4>

                      {/* Snippet */}
                      {article.snippet && (
                        <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed break-words [overflow-wrap:anywhere]">
                          {article.snippet}
                        </p>
                      )}
                    </div>

                    {/* Bottom Metadata & Outbound Action */}
                    <div className="pt-2 border-t border-stone-150 flex items-center justify-between text-[11px] text-stone-500">
                      <div className="flex items-center gap-1.5 font-medium truncate">
                        <Newspaper size={12} className="text-stone-400 shrink-0" />
                        <span className="truncate">{article.source}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 group-hover:text-indigo-700 shrink-0">
                        Read Story <ArrowUpRight size={12} />
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="py-12 px-4 text-center rounded-xl bg-stone-50/50 border border-dashed border-stone-200 flex flex-col items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center mb-2">
                <Search size={16} />
              </div>
              <p className="text-xs font-bold text-stone-800">No matching headlines</p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Try selecting &ldquo;All&rdquo; or adjusting your search term.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer Details */}
      <div className="mt-2 pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between text-xs font-semibold text-stone-500 gap-2">
        <div className="flex items-center gap-2">
          <span>Sources: Official Labs, Reuters, TechCrunch, Hacker News, Hugging Face</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Total Stories: {data?.articles?.length || 0}</span>
          <span className="hidden sm:inline">•</span>
          <span>Engine: {data?.briefing?.provider === 'ollama' ? 'Ollama Local' : data?.briefing?.provider === 'gemini' ? 'Gemini 3.6' : 'Deterministic'}</span>
        </div>
      </div>
    </section>
  );
};
