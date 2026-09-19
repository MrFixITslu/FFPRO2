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
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Trash2,
  RotateCcw,
  Check,
  Eye,
  Undo2
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

/**
 * Ensures any residual HTML tags or escaped entities are cleanly converted to pure plain text
 */
function cleanPlainText(input: string = ''): string {
  if (!input) return '';
  let str = input;
  // Decode common HTML entities
  for (let i = 0; i < 3; i++) {
    str = str
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&#x2F;/gi, '/')
      .replace(/&#x27;/gi, "'")
      .replace(/&nbsp;/gi, ' ');
  }
  // Strip all HTML/XML tags
  str = str.replace(/<[^>]+>/g, ' ');
  // Remove standalone URLs in text
  str = str.replace(/https?:\/\/\S+/gi, '');
  // Normalize extra spaces
  return str.replace(/\s+/g, ' ').trim();
}

const STORAGE_KEYS = {
  READ: 'ffpro_ai_news_read_v1',
  KEPT: 'ffpro_ai_news_kept_v1',
  DELETED: 'ffpro_ai_news_deleted_v1',
};

export const AiNewsBriefing: React.FC = () => {
  const [data, setData] = useState<AiBriefingResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'active' | 'kept' | 'trash'>('active');

  // Read, Kept & Deleted State management stored in localStorage
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.READ);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [keptIds, setKeptIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.KEPT);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DELETED);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Undo notification state
  const [lastDeletedArticle, setLastDeletedArticle] = useState<{ id: string; title: string } | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.READ, JSON.stringify(Array.from(readIds)));
    } catch (e) {
      console.error(e);
    }
  }, [readIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.KEPT, JSON.stringify(Array.from(keptIds)));
    } catch (e) {
      console.error(e);
    }
  }, [keptIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED, JSON.stringify(Array.from(deletedIds)));
    } catch (e) {
      console.error(e);
    }
  }, [deletedIds]);

  const markAsRead = (articleId: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(articleId);
      return next;
    });
  };

  const toggleKeepStory = (articleId: string) => {
    markAsRead(articleId);
    setKeptIds(prev => {
      const next = new Set(prev);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
    // Ensure it's not marked as deleted
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.delete(articleId);
      return next;
    });
  };

  const deleteStory = (article: AiNewsItem) => {
    markAsRead(article.id);
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.add(article.id);
      return next;
    });
    // Remove from kept if deleted
    setKeptIds(prev => {
      const next = new Set(prev);
      next.delete(article.id);
      return next;
    });
    setLastDeletedArticle({ id: article.id, title: cleanPlainText(article.title) });
  };

  const restoreStory = (articleId: string) => {
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.delete(articleId);
      return next;
    });
    if (lastDeletedArticle?.id === articleId) {
      setLastDeletedArticle(null);
    }
  };

  const undoLastDelete = () => {
    if (lastDeletedArticle) {
      restoreStory(lastDeletedArticle.id);
    }
  };

  const clearTrash = () => {
    setDeletedIds(new Set());
    setLastDeletedArticle(null);
  };

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

  // Filtered stories based on View Mode (Active, Kept, Trash), Player, and Search query
  const { filteredArticles, totalActiveCount, totalKeptCount, totalDeletedCount } = useMemo(() => {
    const all = data?.articles || [];
    
    const activeList = all.filter(item => !deletedIds.has(item.id));
    const keptList = all.filter(item => keptIds.has(item.id) && !deletedIds.has(item.id));
    const trashList = all.filter(item => deletedIds.has(item.id));

    const baseList = viewMode === 'active' ? activeList : viewMode === 'kept' ? keptList : trashList;

    const filtered = baseList.filter(item => {
      const matchesPlayer = selectedPlayer === 'All' || item.player === selectedPlayer;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || 
        item.title.toLowerCase().includes(q) || 
        item.snippet.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.player.toLowerCase().includes(q);
      return matchesPlayer && matchesSearch;
    });

    return {
      filteredArticles: filtered,
      totalActiveCount: activeList.length,
      totalKeptCount: keptList.length,
      totalDeletedCount: trashList.length,
    };
  }, [data?.articles, deletedIds, keptIds, viewMode, selectedPlayer, searchQuery]);

  const playersList = ['All', 'OpenAI', 'Google DeepMind', 'Anthropic', 'Meta AI', 'Microsoft AI', 'Open Source & Frontier'];

  return (
    <section id="ai-industry-briefing" className="executive-card p-6 rounded-xl flex flex-col justify-between lg:col-span-2 space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-stone-950 via-stone-800 to-indigo-950 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
            <Bot size={20} className="text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-stone-900 tracking-tight">AI Industry Intelligence Briefing</h3>
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
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck size={11} className="text-emerald-600" />
                  Live Feeds Active
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Daily synthesized developments across leading frontier labs, open-weights releases, and strategic research.
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:text-stone-950 bg-stone-50 hover:bg-stone-100 rounded-xl border border-stone-200 transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Fetch latest updates from all feeds"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-indigo-600' : 'text-stone-500'} />
            <span>{refreshing ? 'Synthesizing...' : 'Refresh Feeds'}</span>
          </button>
        </div>
      </div>

      {/* Undo Notification Banner */}
      {lastDeletedArticle && (
        <div className="bg-stone-900 text-white px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-md animate-in fade-in duration-150">
          <div className="flex items-center gap-2 truncate mr-3">
            <Trash2 size={13} className="text-amber-400 shrink-0" />
            <span className="truncate">
              Story removed from list: <strong>&ldquo;{lastDeletedArticle.title.slice(0, 55)}...&rdquo;</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={undoLastDelete}
            className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white font-bold rounded-lg text-[11px] flex items-center gap-1.5 shrink-0 transition cursor-pointer"
          >
            <Undo2 size={12} /> Undo
          </button>
        </div>
      )}

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
            className="px-3 py-1 font-semibold text-rose-900 bg-white rounded-lg border border-rose-300 hover:bg-rose-100 cursor-pointer"
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
              {cleanPlainText(data.briefing.summary)}
            </p>

            {data.briefing.takeaways && data.briefing.takeaways.length > 0 && (
              <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {data.briefing.takeaways.map((takeaway, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-white/5 p-2.5 rounded-lg border border-white/5">
                    <Zap size={13} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-stone-300 leading-snug break-words [overflow-wrap:anywhere]">
                      {cleanPlainText(takeaway)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* View Mode Tabs (Active Briefing vs Kept Stories vs Deleted/Trash) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setViewMode('active')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border ${
                  viewMode === 'active'
                    ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                    : 'bg-white hover:bg-stone-50 text-stone-600 border-stone-200'
                }`}
              >
                <Newspaper size={13} />
                <span>Active Briefing</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${viewMode === 'active' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  {totalActiveCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('kept')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border ${
                  viewMode === 'kept'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white hover:bg-stone-50 text-stone-600 border-stone-200'
                }`}
              >
                <BookmarkCheck size={13} className={viewMode === 'kept' ? 'text-white' : 'text-indigo-600'} />
                <span>Kept Stories</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${viewMode === 'kept' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'}`}>
                  {totalKeptCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('trash')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border ${
                  viewMode === 'trash'
                    ? 'bg-amber-800 text-white border-amber-800 shadow-2xs'
                    : 'bg-white hover:bg-stone-50 text-stone-600 border-stone-200'
                }`}
              >
                <Trash2 size={13} className={viewMode === 'trash' ? 'text-white' : 'text-stone-400'} />
                <span>Deleted</span>
                {totalDeletedCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${viewMode === 'trash' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'}`}>
                    {totalDeletedCount}
                  </span>
                )}
              </button>
            </div>

            {viewMode === 'trash' && totalDeletedCount > 0 && (
              <button
                type="button"
                onClick={clearTrash}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition cursor-pointer self-end sm:self-auto"
              >
                <Trash2 size={12} /> Clear Trash ({totalDeletedCount})
              </button>
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
                const cleanTitle = cleanPlainText(article.title);
                const cleanSnippet = cleanPlainText(article.snippet);
                const cleanSource = cleanPlainText(article.source);
                const isRead = readIds.has(article.id);
                const isKept = keptIds.has(article.id);
                const isDeleted = deletedIds.has(article.id);

                return (
                  <div
                    key={article.id}
                    className={`p-4 rounded-xl border shadow-2xs hover:shadow-sm transition flex flex-col justify-between gap-3 min-w-0 ${
                      isDeleted
                        ? 'bg-stone-100/70 border-stone-300 opacity-75'
                        : isKept
                        ? 'bg-indigo-50/30 hover:bg-white border-indigo-200/80 hover:border-indigo-300'
                        : isRead
                        ? 'bg-white hover:bg-stone-50/50 border-stone-200'
                        : 'bg-stone-50/70 hover:bg-white border-stone-200/85 hover:border-stone-300'
                    }`}
                  >
                    <div>
                      {/* Top Header: Badge, Category & Read/Kept Indicators */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-md border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {article.player}
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold text-stone-500 bg-stone-100 rounded">
                            {article.category}
                          </span>
                          {isKept && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 rounded flex items-center gap-1">
                              <BookmarkCheck size={10} /> Kept
                            </span>
                          )}
                          {!isKept && isRead && !isDeleted && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold text-stone-500 bg-stone-100 rounded flex items-center gap-1">
                              <Eye size={10} /> Read
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-stone-400 shrink-0">
                          {article.timeAgo}
                        </span>
                      </div>

                      {/* Title Link */}
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markAsRead(article.id)}
                        className="block group"
                      >
                        <h4 className="text-xs font-bold text-stone-900 group-hover:text-indigo-600 transition leading-snug break-words [overflow-wrap:anywhere] mb-1.5">
                          {cleanTitle}
                        </h4>
                      </a>

                      {/* Snippet */}
                      {cleanSnippet && (
                        <p className="text-[11px] text-stone-600 line-clamp-2 leading-relaxed break-words [overflow-wrap:anywhere]">
                          {cleanSnippet}
                        </p>
                      )}
                    </div>

                    {/* Decision Bar & Outbound Action */}
                    <div className="pt-2.5 border-t border-stone-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[11px]">
                      <div className="flex items-center gap-1.5 font-medium text-stone-500 truncate">
                        <Newspaper size={12} className="text-stone-400 shrink-0" />
                        <span className="truncate">{cleanSource}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {/* Read Story Link */}
                        <a
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markAsRead(article.id)}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline shrink-0 mr-1 cursor-pointer"
                        >
                          Read Story <ArrowUpRight size={12} />
                        </a>

                        {/* Decision Controls: Keep vs Delete */}
                        {!isDeleted ? (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleKeepStory(article.id)}
                              className={`px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer border ${
                                isKept
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-300'
                              }`}
                              title={isKept ? 'Saved in Kept Stories' : 'Keep story in your list'}
                            >
                              {isKept ? (
                                <>
                                  <Check size={11} /> Kept
                                </>
                              ) : (
                                <>
                                  <Bookmark size={11} className="text-stone-500" /> Keep
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteStory(article)}
                              className="px-2 py-1 rounded-lg text-[10.5px] font-bold text-stone-600 hover:text-red-600 bg-white hover:bg-red-50 border border-stone-200 hover:border-red-200 flex items-center gap-1 transition cursor-pointer"
                              title="Delete and remove story from list"
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => restoreStory(article.id)}
                            className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1 transition cursor-pointer"
                            title="Restore back to active briefing"
                          >
                            <RotateCcw size={11} /> Restore Story
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 px-4 text-center rounded-xl bg-stone-50/50 border border-dashed border-stone-200 flex flex-col items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center mb-2">
                {viewMode === 'kept' ? <Bookmark size={16} /> : viewMode === 'trash' ? <Trash2 size={16} /> : <Search size={16} />}
              </div>
              <p className="text-xs font-bold text-stone-800">
                {viewMode === 'kept' 
                  ? 'No kept stories yet' 
                  : viewMode === 'trash' 
                  ? 'Trash is empty' 
                  : 'No matching headlines'}
              </p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {viewMode === 'kept'
                  ? 'Click "Keep" on any story card in your Active Briefing to save it here.'
                  : viewMode === 'trash'
                  ? 'Stories you delete will be kept here temporarily if you wish to restore them.'
                  : 'Try selecting "All" or adjusting your search term.'}
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
          <span>Kept: {totalKeptCount}</span>
          <span className="hidden sm:inline">•</span>
          <span>Engine: {data?.briefing?.provider === 'ollama' ? 'Ollama Local' : data?.briefing?.provider === 'gemini' ? 'Gemini 3.6' : 'Deterministic'}</span>
        </div>
      </div>
    </section>
  );
};
