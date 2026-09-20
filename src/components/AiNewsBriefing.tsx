import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  EyeOff, 
  Undo2,
  Settings as SettingsIcon,
  AlertCircle,
  Filter,
  SlidersHorizontal
} from 'lucide-react';
import { STORAGE_KEYS as STORAGE_KEYS_GLOBAL, DEFAULT_BRIEFING_TOPICS } from '../types';

export interface AiNewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  timeAgo: string;
  snippet: string;
  player: string;
  category: string;
  topic?: string;
}

export interface AiBriefingResponse {
  briefing: {
    summary: string;
    takeaways: string[];
    provider: 'ollama' | 'gemini' | 'deterministic' | string;
    model?: string;
    updatedAt: string;
    topic?: string;
  };
  articles: AiNewsItem[];
  topic?: string;
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
  // Decode common HTML entities recursively
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

/**
 * Helper to build topic-scoped localStorage keys
 */
function getTopicStorageKey(topic: string, suffix: 'read' | 'kept' | 'deleted'): string {
  const safe = (topic || 'ai').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32) || 'default';
  return `ffpro_news_${suffix}_${safe}_v3`;
}

function loadTopicStorageSet(topic: string, suffix: 'read' | 'kept' | 'deleted'): Set<string> {
  try {
    const keyV3 = getTopicStorageKey(topic, suffix);
    let raw = localStorage.getItem(keyV3);
    if (!raw) {
      // Migrate from v2 if available
      const safe = (topic || 'ai').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32) || 'default';
      raw = localStorage.getItem(`ffpro_news_${suffix}_${safe}_v2`);
    }
    if (raw) {
      const parsed: string[] = JSON.parse(raw);
      // Strip legacy collided ID where all 30 Google News articles previously shared 'rss-aHR0cHM6Ly9uZXdz'
      const clean = parsed.filter(id => id && typeof id === 'string' && !id.startsWith('rss-aHR0cHM6Ly9uZXdz'));
      return new Set(clean);
    }
  } catch {}
  return new Set();
}

export const AiNewsBriefing: React.FC = () => {
  // Read initial topic from global settings
  const getStoredTopicConfig = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS_GLOBAL.BRIEFING_TOPIC);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          topicId: parsed.topicId || 'ai',
          customQuery: parsed.customQuery || ''
        };
      }
    } catch {}
    return { topicId: 'ai', customQuery: '' };
  };

  const initialConfig = getStoredTopicConfig();
  const [topicConfig, setTopicConfig] = useState(initialConfig);
  const effectiveTopic = topicConfig.topicId === 'custom' && topicConfig.customQuery ? topicConfig.customQuery : topicConfig.topicId;

  const [data, setData] = useState<AiBriefingResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'active' | 'kept' | 'trash'>('active');

  // Topic-scoped states for read, kept, and deleted stories
  const [readIds, setReadIds] = useState<Set<string>>(() => loadTopicStorageSet(effectiveTopic, 'read'));
  const [keptIds, setKeptIds] = useState<Set<string>>(() => loadTopicStorageSet(effectiveTopic, 'kept'));
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => loadTopicStorageSet(effectiveTopic, 'deleted'));

  // Undo notification state
  const [lastDeletedArticle, setLastDeletedArticle] = useState<{ id: string; title: string } | null>(null);

  // Re-load topic-scoped sets whenever effectiveTopic changes
  useEffect(() => {
    try {
      setReadIds(loadTopicStorageSet(effectiveTopic, 'read'));
      setKeptIds(loadTopicStorageSet(effectiveTopic, 'kept'));
      setDeletedIds(loadTopicStorageSet(effectiveTopic, 'deleted'));
      setSelectedPlayer('All');
      setLastDeletedArticle(null);
    } catch (e) {
      console.error('[AiNewsBriefing] Error loading topic storage:', e);
    }
  }, [effectiveTopic]);

  // Sync to topic-scoped localStorage
  useEffect(() => {
    try {
      const key = getTopicStorageKey(effectiveTopic, 'read');
      localStorage.setItem(key, JSON.stringify(Array.from(readIds)));
    } catch (e) {
      console.error(e);
    }
  }, [readIds, effectiveTopic]);

  useEffect(() => {
    try {
      const key = getTopicStorageKey(effectiveTopic, 'kept');
      localStorage.setItem(key, JSON.stringify(Array.from(keptIds)));
    } catch (e) {
      console.error(e);
    }
  }, [keptIds, effectiveTopic]);

  useEffect(() => {
    try {
      const key = getTopicStorageKey(effectiveTopic, 'deleted');
      localStorage.setItem(key, JSON.stringify(Array.from(deletedIds)));
    } catch (e) {
      console.error(e);
    }
  }, [deletedIds, effectiveTopic]);

  // Listen for changes from Settings page
  useEffect(() => {
    const handleTopicUpdated = (e: any) => {
      if (e?.detail?.topicId) {
        setTopicConfig({
          topicId: e.detail.topicId,
          customQuery: e.detail.customQuery || ''
        });
      }
    };
    window.addEventListener('briefing-topic-updated', handleTopicUpdated);
    return () => window.removeEventListener('briefing-topic-updated', handleTopicUpdated);
  }, []);

  // Fetch news for the active topic
  const fetchNews = useCallback(async (force = false, topicParam?: string) => {
    const topicToUse = topicParam || effectiveTopic;
    try {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (force) params.set('refresh', 'true');
      if (topicToUse) params.set('topic', topicToUse);

      const res = await fetch(`/api/ai-news?${params.toString()}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch briefing reports (${res.status})`);
      }

      const json: AiBriefingResponse = await res.json();
      if (json?.articles && Array.isArray(json.articles)) {
        const seenIds = new Set<string>();
        json.articles = json.articles.map((item, idx) => {
          let id = item.id;
          if (!id || id.startsWith('rss-aHR0cHM6Ly9uZXdz') || seenIds.has(id)) {
            const strToHash = `${item.link || ''}|${item.title || ''}|${idx}`;
            let hash = 0;
            for (let i = 0; i < strToHash.length; i++) {
              hash = ((hash << 5) - hash) + strToHash.charCodeAt(i);
              hash |= 0;
            }
            id = `story-${Math.abs(hash).toString(36)}-${idx}`;
          }
          seenIds.add(id);
          return { ...item, id };
        });
      }
      setData(json);
    } catch (err: any) {
      console.error('[AiNewsBriefing] Fetch failed:', err);
      setError(err.message || 'Could not retrieve intelligence briefing.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveTopic]);

  // Initial fetch and on topic change
  useEffect(() => {
    fetchNews(false, effectiveTopic);
  }, [effectiveTopic, fetchNews]);

  // Story state modifiers
  const markAsRead = (articleId: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(articleId);
      return next;
    });
  };

  const toggleReadStatus = (articleId: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
  };

  const markAllAsRead = () => {
    if (!data?.articles) return;
    setReadIds(prev => {
      const next = new Set(prev);
      data.articles.forEach(a => next.add(a.id));
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
    // Ensure story is removed from trash if kept
    setDeletedIds(prev => {
      const next = new Set(prev);
      next.delete(articleId);
      return next;
    });
  };

  /**
   * CRITICAL FIX: Decouple deletion from read status.
   * Deleting an article NEVER marks it as read.
   */
  const deleteStory = (article: AiNewsItem) => {
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

  const restoreAllStories = () => {
    setDeletedIds(new Set());
    setLastDeletedArticle(null);
  };

  const undoLastDelete = () => {
    if (lastDeletedArticle) {
      restoreStory(lastDeletedArticle.id);
    }
  };

  const clearTrashPermanently = () => {
    // In our system, trash is the deletedIds set
    setDeletedIds(new Set());
    setLastDeletedArticle(null);
  };

  // Quick switch topic from header dropdown
  const handleQuickTopicChange = (newTopicId: string) => {
    const newConfig = {
      topicId: newTopicId,
      customQuery: newTopicId === 'custom' ? topicConfig.customQuery : ''
    };
    setTopicConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEYS_GLOBAL.BRIEFING_TOPIC, JSON.stringify(newConfig));
      window.dispatchEvent(new CustomEvent('briefing-topic-updated', { detail: newConfig }));
    } catch {}
  };

  const openSettingsToTopics = () => {
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'intelligence' } }));
  };

  // Dynamic topic header title
  const activeTopicPreset = DEFAULT_BRIEFING_TOPICS.find(t => t.id === topicConfig.topicId);
  const displayTopicName = topicConfig.topicId === 'custom' && topicConfig.customQuery
    ? `Custom: ${topicConfig.customQuery}`
    : (activeTopicPreset?.name || 'Intelligence');

  // Filtered stories based on View Mode (Active, Kept, Trash), Player, and Search query
  const { filteredArticles, totalActiveCount, totalKeptCount, totalDeletedCount, uniqueEntities } = useMemo(() => {
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

    const entities = Array.from(new Set(all.map(a => a.player))).filter(Boolean);

    return {
      filteredArticles: filtered,
      totalActiveCount: activeList.length,
      totalKeptCount: keptList.length,
      totalDeletedCount: trashList.length,
      uniqueEntities: entities
    };
  }, [data?.articles, deletedIds, keptIds, viewMode, selectedPlayer, searchQuery]);

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
              <h3 className="text-base font-bold text-stone-900 tracking-tight">
                {topicConfig.topicId === 'ai' ? 'AI Industry Intelligence Briefing' : `${displayTopicName} Briefing`}
              </h3>
              {data?.ollamaStatus?.online ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                  <Bot size={11} className="text-emerald-600" />
                  Ollama Local Active ({data.ollamaStatus.model || 'Connected'})
                </span>
              ) : data?.briefing?.provider === 'gemini' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Sparkles size={11} className="text-indigo-500" />
                  Synthesized via Gemini
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck size={11} className="text-emerald-600" />
                  Live Wire Active
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Synthesized dispatches across verified wire dispatches, sector reports, and strategic intelligence.
            </p>
          </div>
        </div>

        {/* Action Controls & Topic Switcher */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
          {/* Quick Topic Selector */}
          <div className="flex items-center bg-stone-50 border border-stone-200 rounded-xl px-2 py-1 gap-1.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Topic:</span>
            <select
              value={topicConfig.topicId}
              onChange={(e) => handleQuickTopicChange(e.target.value)}
              className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer pr-1"
              aria-label="Select Intelligence Topic"
            >
              {DEFAULT_BRIEFING_TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.split('&')[0].trim()}
                </option>
              ))}
              {topicConfig.topicId === 'custom' && (
                <option value="custom">Custom: {topicConfig.customQuery || 'Custom'}</option>
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={openSettingsToTopics}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-indigo-600 bg-stone-50 hover:bg-stone-100 rounded-xl border border-stone-200 transition shadow-2xs cursor-pointer"
            title="Configure briefing topics and custom search in Settings"
          >
            <SlidersHorizontal size={12} />
            <span className="hidden md:inline">Topics</span>
          </button>

          <button
            type="button"
            id="btn-refresh-ai-news"
            onClick={() => fetchNews(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:text-stone-950 bg-stone-50 hover:bg-stone-100 rounded-xl border border-stone-200 transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Fetch latest updates from all feeds"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-indigo-600' : 'text-stone-500'} />
            <span>{refreshing ? 'Synthesizing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Undo Notification Banner */}
      {lastDeletedArticle && (
        <div className="bg-stone-900 text-white px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-md animate-in fade-in duration-150">
          <div className="flex items-center gap-2 truncate mr-3">
            <Trash2 size={13} className="text-amber-400 shrink-0" />
            <span className="truncate">
              Story moved to Trash: <strong>&ldquo;{lastDeletedArticle.title.slice(0, 50)}...&rdquo;</strong>
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
            className="font-bold underline ml-3 shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content */}
      {data && (
        <div className="space-y-5">
          {/* Executive Synthesis Card */}
          <div className="relative overflow-hidden rounded-xl border border-indigo-150 bg-gradient-to-br from-indigo-50/70 via-white to-stone-50 p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-indigo-600" />
                  Executive Intelligence Synthesis &bull; {displayTopicName}
                </h4>
              </div>
              <span className="text-[10px] text-stone-600 font-medium">
                Updated {new Date(data.briefing.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <p className="text-xs text-stone-800 leading-relaxed font-normal mb-3.5">
              {cleanPlainText(data.briefing.summary)}
            </p>

            {/* Strategic Takeaways */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-3 border-t border-indigo-100/60 text-xs">
              {data.briefing.takeaways.map((takeaway, i) => (
                <div key={i} className="flex items-start gap-2 bg-white/70 backdrop-blur-xs p-2.5 rounded-lg border border-indigo-50 shadow-2xs">
                  <div className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-[11px] text-stone-700 font-medium leading-snug">
                    {cleanPlainText(takeaway)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Controls Bar: View Mode Tabs + Entity Filter + Search + Mark All Read */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* View Mode Tabs (Active, Kept, Trash) */}
              <div className="flex items-center p-1 bg-stone-100 rounded-xl border border-stone-200/80 w-fit">
                <button
                  type="button"
                  onClick={() => setViewMode('active')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    viewMode === 'active'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Newspaper size={13} />
                  <span>Active Briefing</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-200 font-extrabold text-stone-700 ml-0.5">
                    {totalActiveCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('kept')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    viewMode === 'kept'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <BookmarkCheck size={13} className={viewMode === 'kept' ? 'text-indigo-600' : ''} />
                  <span>Kept Stories</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ml-0.5 ${
                    viewMode === 'kept' ? 'bg-indigo-100 text-indigo-700' : 'bg-stone-200 text-stone-700'
                  }`}>
                    {totalKeptCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('trash')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    viewMode === 'trash'
                      ? 'bg-white text-red-600 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Trash2 size={13} className={viewMode === 'trash' ? 'text-red-500' : ''} />
                  <span>Trash</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ml-0.5 ${
                    viewMode === 'trash' ? 'bg-red-100 text-red-700' : 'bg-stone-200 text-stone-700'
                  }`}>
                    {totalDeletedCount}
                  </span>
                </button>
              </div>

              {/* Utility Actions: Mark all as read & Restore All in Trash */}
              <div className="flex items-center gap-2">
                {viewMode === 'active' && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                    title="Mark all current reports as read"
                  >
                    <Eye size={12} className="text-stone-500" />
                    <span>Mark All Read</span>
                  </button>
                )}

                {viewMode === 'trash' && totalDeletedCount > 0 && (
                  <button
                    type="button"
                    onClick={restoreAllStories}
                    className="px-3 py-1 text-[11px] font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                    title="Restore all deleted reports back to Active Briefing"
                  >
                    <RotateCcw size={12} className="text-amber-600" />
                    <span>Restore All Stories</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              {/* Entity Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedPlayer('All')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                    selectedPlayer === 'All'
                      ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                      : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  All ({viewMode === 'active' ? totalActiveCount : viewMode === 'kept' ? totalKeptCount : totalDeletedCount})
                </button>
                {uniqueEntities.map(player => (
                  <button
                    key={player}
                    type="button"
                    onClick={() => setSelectedPlayer(player)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border whitespace-nowrap ${
                      selectedPlayer === player
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {player}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative sm:w-56 shrink-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter stories..."
                  className="w-full pl-7 pr-3 py-1 bg-white border border-stone-200 rounded-lg text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Empty / Recovery Banner for Active Stories */}
          {viewMode === 'active' && filteredArticles.length === 0 && totalActiveCount === 0 && totalDeletedCount > 0 && (
            <div className="p-5 rounded-xl bg-amber-50/85 border border-amber-200/90 text-stone-800 space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-950">
                    All {totalDeletedCount} stories for &ldquo;{displayTopicName}&rdquo; are currently in your Trash list
                  </h4>
                  <p className="text-[11.5px] text-amber-900/90 leading-relaxed">
                    Stories you deleted previously are safely preserved in Trash. You can restore all stories to your Active Briefing with a single click, or fetch new reports using the Refresh button.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 pl-7">
                <button
                  type="button"
                  onClick={restoreAllStories}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <RotateCcw size={13} />
                  Restore All {totalDeletedCount} Stories to Active Briefing
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('trash')}
                  className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  View Trash
                </button>
              </div>
            </div>
          )}

          {/* Standard Empty state */}
          {filteredArticles.length === 0 && !(viewMode === 'active' && totalActiveCount === 0 && totalDeletedCount > 0) && (
            <div className="text-center py-10 px-4 rounded-xl border border-dashed border-stone-200 bg-stone-50/50">
              <Newspaper size={24} className="mx-auto text-stone-400 mb-2 opacity-60" />
              <p className="text-xs font-semibold text-stone-700">
                {viewMode === 'kept'
                  ? 'No kept stories yet. Bookmark stories in your active briefing to save them here.'
                  : viewMode === 'trash'
                  ? 'Trash is empty. Deleted stories will appear here for recovery.'
                  : 'No stories match your current filters.'}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Clear search query
                </button>
              )}
            </div>
          )}

          {/* Article Cards Grid */}
          {filteredArticles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredArticles.map(article => {
                const cleanTitle = cleanPlainText(article.title);
                const cleanSnippet = cleanPlainText(article.snippet);
                const cleanSource = cleanPlainText(article.source);

                const isRead = readIds.has(article.id);
                const isKept = keptIds.has(article.id);
                const isDeleted = deletedIds.has(article.id);

                return (
                  <article
                    key={article.id}
                    id={`news-card-${article.id.slice(0, 18)}`}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 shadow-2xs ${
                      isDeleted
                        ? 'bg-stone-50/50 border-stone-200 opacity-75'
                        : isKept
                        ? 'bg-indigo-50/25 hover:bg-white border-indigo-200/90 hover:border-indigo-300'
                        : isRead
                        ? 'bg-stone-50/30 hover:bg-white border-stone-200 hover:border-stone-300'
                        : 'bg-white hover:bg-white border-stone-200/90 hover:border-stone-300'
                    }`}
                  >
                    <div>
                      {/* Top Header: Badge, Category & Read/Unread Indicators */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-md border bg-stone-100 text-stone-800 border-stone-200">
                            {article.player}
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold text-stone-500 bg-stone-100 rounded">
                            {article.category}
                          </span>
                          
                          {/* Saved / Kept badge */}
                          {isKept && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 rounded flex items-center gap-1">
                              <BookmarkCheck size={10} /> Kept
                            </span>
                          )}

                          {/* Read / Unread Status Badge */}
                          {!isDeleted && (
                            isRead ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-semibold text-stone-600 bg-stone-100/90 rounded border border-stone-200 flex items-center gap-1">
                                <Eye size={10} className="text-stone-500" /> Read
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 rounded flex items-center gap-1 shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Unread
                              </span>
                            )
                          )}
                        </div>

                        <span className="text-[10px] font-medium text-stone-600 shrink-0">
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
                        <h4 className="text-xs font-bold text-stone-900 group-hover:text-indigo-600 transition leading-snug break-words [overflow-wrap:anywhere] mb-2">
                          {cleanTitle}
                        </h4>
                      </a>

                      {/* Substantive Paragraph Summary (Full key details) */}
                      {cleanSnippet && (
                        <p className="text-[11.5px] text-stone-700 leading-relaxed break-words [overflow-wrap:anywhere]">
                          {cleanSnippet}
                        </p>
                      )}
                    </div>

                    {/* Decision Bar & Actions */}
                    <div className="pt-2.5 border-t border-stone-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 font-medium text-stone-500 truncate">
                        <Newspaper size={12} className="text-stone-400 shrink-0" />
                        <span className="truncate">{cleanSource}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {/* Read Story Outbound Link */}
                        <a
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markAsRead(article.id)}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline shrink-0 mr-1 cursor-pointer"
                        >
                          Read Story <ArrowUpRight size={12} />
                        </a>

                        {/* Read / Unread toggle */}
                        {!isDeleted && (
                          <button
                            type="button"
                            onClick={() => toggleReadStatus(article.id)}
                            className="px-2 py-1 rounded-lg text-[10.5px] font-semibold text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-200 transition cursor-pointer flex items-center gap-1"
                            title={isRead ? 'Mark as Unread' : 'Mark as Read'}
                          >
                            {isRead ? <EyeOff size={11} /> : <Eye size={11} />}
                            <span>{isRead ? 'Unread' : 'Read'}</span>
                          </button>
                        )}

                        {/* Decision Controls: Keep vs Delete vs Restore */}
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
                              title="Delete story and remove from list"
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => restoreStory(article.id)}
                            className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center gap-1 transition cursor-pointer"
                            title="Restore story back to active briefing"
                          >
                            <RotateCcw size={11} /> Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
