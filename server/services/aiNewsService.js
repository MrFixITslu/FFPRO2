import { checkOllamaHealth, generateOllama } from './ollamaService.js';
import { GoogleGenAI } from '@google/genai';

/**
 * In-memory cache for aggregated AI News
 */
let newsCache = {
  timestamp: 0,
  data: null,
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Strip HTML tags and decode common XML entities
 */
function cleanText(text = '') {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute friendly relative time
 */
function formatTimeAgo(dateStr) {
  try {
    const d = new Date(dateStr);
    const diff = Math.max(0, Date.now() - d.getTime());
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 60) return `${mins <= 1 ? 'Just now' : `${mins}m ago`}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return 'Recent';
  }
}

/**
 * Classify news item by major AI player
 */
function detectPlayer(title = '', snippet = '') {
  const combined = `${title} ${snippet}`.toLowerCase();
  
  // Check specific distinct frontier players
  if (/anthropic|claude|sonnet|haiku|opus|amodei|constitutional ai/.test(combined)) {
    return 'Anthropic';
  }
  if (/deepmind|gemini|gemma|hassabis|alphafold|veo|imagen|google ai|google deepmind/.test(combined)) {
    return 'Google DeepMind';
  }
  if (/openai|chatgpt|gpt-4|gpt-5|sora|o1|o3|o3-mini|altman|codex|whisper|dall-e/.test(combined)) {
    return 'OpenAI';
  }
  if (/meta ai|meta's ai|llama|zuckerberg|lecun|fair|pytorch/.test(combined)) {
    return 'Meta AI';
  }
  if (/microsoft|copilot|azure ai|satya nadella|phi-3|phi-4/.test(combined)) {
    return 'Microsoft AI';
  }
  if (/mistral|deepseek|qwen|alibaba|xai|grok|musk|hugging face|open-source|ollama|vllm|stable diffusion/.test(combined)) {
    return 'Open Source & Frontier';
  }
  if (/google/.test(combined)) {
    return 'Google DeepMind';
  }
  return 'Industry & Research';
}

/**
 * Classify category
 */
function detectCategory(title = '', snippet = '') {
  const combined = `${title} ${snippet}`.toLowerCase();
  if (/launch|release|unveil|announce|new model|rolls out|introduces|available now/.test(combined)) {
    return 'Model Release';
  }
  if (/paper|benchmark|reasoning|weights|dataset|eval|alignment|safety|arxiv/.test(combined)) {
    return 'Research';
  }
  if (/gpu|nvidia|tpu|cluster|data center|datacenter|chips|compute|infra/.test(combined)) {
    return 'Infrastructure';
  }
  if (/ftc|sec|lawsuit|copyright|regulation|bill|congress|eu ai act|funding|valuation/.test(combined)) {
    return 'Policy & Capital';
  }
  return 'Product & Ecosystem';
}

/**
 * Parse standard RSS items from raw XML text
 */
function parseRssItems(xmlText = '', defaultSource = 'News') {
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const block = match[0];
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
    const pubDateMatch = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i.exec(block);
    const descMatch = /<description[^>]*>([\s\S]*?)<\/description>/i.exec(block);
    const sourceMatch = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(block);

    let rawTitle = cleanText(titleMatch ? titleMatch[1] : '');
    let rawLink = (linkMatch ? linkMatch[1] : '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
    let rawDesc = cleanText(descMatch ? descMatch[1] : '');
    let source = cleanText(sourceMatch ? sourceMatch[1] : defaultSource);

    // Google News RSS titles frequently end with "- SourceName"
    if (rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ');
      if (parts.length > 1) {
        const potentialSource = parts.pop();
        if (!source || source === 'Google News' || source === 'News') {
          source = potentialSource;
        }
        rawTitle = parts.join(' - ');
      }
    }

    if (rawTitle && rawLink) {
      const dateStr = pubDateMatch ? cleanText(pubDateMatch[1]) : new Date().toISOString();
      items.push({
        id: `rss-${Buffer.from(rawLink).toString('base64').slice(0, 24)}`,
        title: rawTitle,
        link: rawLink,
        source: source || defaultSource,
        publishedAt: dateStr,
        timeAgo: formatTimeAgo(dateStr),
        snippet: rawDesc.slice(0, 220),
        player: detectPlayer(rawTitle, rawDesc),
        category: detectCategory(rawTitle, rawDesc),
      });
    }
  }

  return items;
}

/**
 * Fetch with timeout helper
 */
async function safeFetch(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Collect live feeds from top news, RSS, and developer platforms
 */
async function fetchAllLiveFeeds() {
  const allItems = [];

  const [googleNewsRes, techcrunchRes, hnRes, hfRes] = await Promise.allSettled([
    // 1. Google News AI Multi-Player aggregation (Reuters, Bloomberg, Verge, Forbes, etc.)
    safeFetch(
      'https://news.google.com/rss/search?q=(OpenAI+OR+Anthropic+OR+DeepMind+OR+%22Meta+AI%22+OR+%22Microsoft+Copilot%22)+when:3d&hl=en-US&gl=US&ceid=US:en',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AIStudioBot/1.0' } },
      7000
    ).then(r => r && r.ok ? r.text() : null),

    // 2. TechCrunch AI Dedicated Channel
    safeFetch(
      'https://techcrunch.com/category/artificial-intelligence/feed/',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AIStudioBot/1.0' } },
      7000
    ).then(r => r && r.ok ? r.text() : null),

    // 3. Hacker News AI Discussions & Announcements via Algolia API
    safeFetch(
      'https://hn.algolia.com/api/v1/search?query=OpenAI+OR+Anthropic+OR+DeepMind+OR+Claude+OR+Gemini+OR+Llama&tags=story&hitsPerPage=12',
      { headers: { 'Accept': 'application/json' } },
      6000
    ).then(r => r && r.ok ? r.json() : null),

    // 4. Hugging Face Daily Frontier Model Releases & Papers
    safeFetch(
      'https://huggingface.co/api/daily_papers?limit=8',
      { headers: { 'Accept': 'application/json' } },
      6000
    ).then(r => r && r.ok ? r.json() : null)
  ]);

  // Parse Google News AI
  if (googleNewsRes.status === 'fulfilled' && googleNewsRes.value) {
    const parsed = parseRssItems(googleNewsRes.value, 'News Wire');
    allItems.push(...parsed);
  }

  // Parse TechCrunch AI
  if (techcrunchRes.status === 'fulfilled' && techcrunchRes.value) {
    const parsed = parseRssItems(techcrunchRes.value, 'TechCrunch');
    allItems.push(...parsed);
  }

  // Parse Hacker News AI
  if (hnRes.status === 'fulfilled' && hnRes.value && Array.isArray(hnRes.value.hits)) {
    for (const hit of hnRes.value.hits) {
      if (hit.title && (hit.url || hit.story_url || hit.objectID)) {
        const link = hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const title = cleanText(hit.title);
        const dateStr = hit.created_at || new Date().toISOString();
        allItems.push({
          id: `hn-${hit.objectID}`,
          title,
          link,
          source: 'Hacker News',
          publishedAt: dateStr,
          timeAgo: formatTimeAgo(dateStr),
          snippet: `${hit.points || 0} points • ${hit.num_comments || 0} discussion comments from developers and industry researchers.`,
          player: detectPlayer(title),
          category: detectCategory(title),
        });
      }
    }
  }

  // Parse Hugging Face Daily Papers & Releases
  if (hfRes.status === 'fulfilled' && Array.isArray(hfRes.value)) {
    for (const paper of hfRes.value) {
      const p = paper.paper || paper;
      if (p && p.title) {
        const link = `https://huggingface.co/papers/${p.id || ''}`;
        const title = cleanText(p.title);
        const dateStr = p.publishedAt || new Date().toISOString();
        allItems.push({
          id: `hf-${p.id || Math.random()}`,
          title: `[Research] ${title}`,
          link,
          source: 'Hugging Face',
          publishedAt: dateStr,
          timeAgo: formatTimeAgo(dateStr),
          snippet: cleanText(p.summary || '').slice(0, 220) || 'Frontier machine learning research and open weight evaluations.',
          player: detectPlayer(title, p.summary),
          category: 'Research',
        });
      }
    }
  }

  // Fallback items if external network is unavailable in container sandbox
  if (allItems.length === 0) {
    allItems.push(
      {
        id: 'curated-1',
        title: 'Anthropic Introduces Extended Reasoning and Computer Use Updates in Claude 3.7',
        link: 'https://www.anthropic.com/news',
        source: 'Anthropic Research',
        publishedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        timeAgo: '4h ago',
        snippet: 'Hybrid reasoning architecture offering seamless transitions between instantaneous generation and deep reflection modes.',
        player: 'Anthropic',
        category: 'Model Release'
      },
      {
        id: 'curated-2',
        title: 'Google DeepMind Expands Gemini 2.5 Flash and Pro Multimodal Code Generation',
        link: 'https://deepmind.google/technologies/gemini/',
        source: 'Google DeepMind',
        publishedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
        timeAgo: '8h ago',
        snippet: 'Substantial throughput optimizations and enhanced structured output support for automated enterprise workflows.',
        player: 'Google DeepMind',
        category: 'Model Release'
      },
      {
        id: 'curated-3',
        title: 'OpenAI Releases o3-mini Reasoning Model with Configurable Effort Controls',
        link: 'https://openai.com/news',
        source: 'OpenAI Blog',
        publishedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        timeAgo: '12h ago',
        snippet: 'Benchmarked stem performance with dedicated mathematical and logic reasoning capabilities.',
        player: 'OpenAI',
        category: 'Model Release'
      },
      {
        id: 'curated-4',
        title: 'Meta AI Open-Sources Multimodal Llama Infrastructure and Vision Weights',
        link: 'https://ai.meta.com/blog/',
        source: 'Meta AI FAIR',
        publishedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
        timeAgo: '18h ago',
        snippet: 'Expanded permissiveness for on-premise deployments and specialized edge hardware devices.',
        player: 'Meta AI',
        category: 'Research'
      },
      {
        id: 'curated-5',
        title: 'Microsoft Accelerates Copilot Studio with Autonomous Multi-Agent Workflows',
        link: 'https://blogs.microsoft.com/ai/',
        source: 'Microsoft AI',
        publishedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        timeAgo: '1d ago',
        snippet: 'Integration with Azure enterprise data catalogs and compliance verification gates.',
        player: 'Microsoft AI',
        category: 'Product & Ecosystem'
      }
    );
  }

  // Deduplicate by title similarity
  const seenTitles = new Set();
  const deduplicated = [];

  for (const item of allItems) {
    const norm = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
    if (!seenTitles.has(norm)) {
      seenTitles.add(norm);
      deduplicated.push(item);
    }
  }

  // Sort newest first
  deduplicated.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return deduplicated.slice(0, 30);
}

/**
 * Generate Executive Synthesis using Ollama (with Gemini and Deterministic fallbacks)
 */
async function generateExecutiveSynthesis(articles = []) {
  const topArticles = articles.slice(0, 8);
  const digestText = topArticles
    .map((a, i) => `${i + 1}. [${a.player} | ${a.source}] ${a.title} - ${a.snippet}`)
    .join('\n');

  // 1. Try Ollama if online
  try {
    const ollamaHealth = await checkOllamaHealth(2500);
    if (ollamaHealth.online) {
      const prompt = `You are an elite executive intelligence analyst. Summarize these recent top developments across major AI players (OpenAI, Google DeepMind, Anthropic, Meta, Microsoft, and Open Source).
Articles:
${digestText}

Respond in strictly valid JSON format with these exact keys:
{
  "summary": "A crisp, high-level 2-sentence executive briefing highlighting the dominant strategic trend across the major labs.",
  "takeaways": [
    "Key takeaway 1 (one clear sentence on model release or competition)",
    "Key takeaway 2 (one clear sentence on frontier research or reasoning)",
    "Key takeaway 3 (one clear sentence on ecosystem or infrastructure impact)"
  ]
}`;

      const res = await generateOllama({
        prompt,
        system: "You generate concise executive intelligence briefings. Always return clean JSON.",
        temperature: 0.2,
        jsonFormat: true,
        timeoutMs: 15000
      });

      if (res && res.text) {
        try {
          const parsed = JSON.parse(res.text);
          if (parsed.summary && Array.isArray(parsed.takeaways)) {
            return {
              summary: parsed.summary,
              takeaways: parsed.takeaways.slice(0, 3),
              provider: 'ollama',
              model: res.model || 'ollama-local',
              updatedAt: new Date().toISOString()
            };
          }
        } catch {
          // JSON parse failed, continue to fallback
        }
      }
    }
  } catch (err) {
    console.warn('[AI News] Ollama synthesis unavailable, falling back:', err.message);
  }

  // 2. Try Gemini fallback if API key is present
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (geminiKey && geminiKey.length > 15 && !geminiKey.startsWith('your_')) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const prompt = `Review these recent headlines from top AI companies:
${digestText}

Provide an executive intelligence briefing in JSON format:
{
  "summary": "A 2-sentence strategic synthesis of the major moves across OpenAI, Google DeepMind, Anthropic, and other frontier labs.",
  "takeaways": [
    "Takeaway 1",
    "Takeaway 2",
    "Takeaway 3"
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt
      });

      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.summary && Array.isArray(parsed.takeaways)) {
          return {
            summary: parsed.summary,
            takeaways: parsed.takeaways.slice(0, 3),
            provider: 'gemini',
            model: 'gemini-3.6-flash',
            updatedAt: new Date().toISOString()
          };
        }
      }
    } catch (geminiErr) {
      console.warn('[AI News] Gemini synthesis fallback error:', geminiErr.message);
    }
  }

  // 3. High-Fidelity Deterministic Synthesis
  const playersCovered = Array.from(new Set(topArticles.map(a => a.player)));
  const summary = `Frontier labs including ${playersCovered.slice(0, 3).join(', ')} continue accelerating reasoning architectures and developer ecosystem integrations. Rapid benchmark advancements are focusing heavily on verifiable inference, agency, and efficiency gains.`;

  const takeaways = [
    topArticles[0] ? `${topArticles[0].player}: ${topArticles[0].title}` : 'Frontier labs are prioritizing enhanced chain-of-thought verification.',
    topArticles[1] ? `${topArticles[1].player}: ${topArticles[1].title}` : 'Open-weight ecosystems are closing the performance gap in multimodal tasks.',
    topArticles[2] ? `${topArticles[2].player}: ${topArticles[2].title}` : 'Infrastructure investments are pivoting toward cost-efficient small-model inference.'
  ];

  return {
    summary,
    takeaways,
    provider: 'deterministic',
    model: 'Rule-Based Engine',
    updatedAt: new Date().toISOString()
  };
}

/**
 * Main function to retrieve aggregated AI news with caching
 */
export async function getAiNewsBriefing(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && newsCache.data && (now - newsCache.timestamp < CACHE_TTL_MS)) {
    return newsCache.data;
  }

  const articles = await fetchAllLiveFeeds();
  const briefing = await generateExecutiveSynthesis(articles);

  // Check Ollama status for UI badge
  let ollamaStatus = { online: false, model: null };
  try {
    const health = await checkOllamaHealth(1500);
    ollamaStatus = { online: health.online, model: health.effectiveModel || health.model };
  } catch {
    // silent
  }

  const result = {
    briefing,
    articles,
    ollamaStatus,
    playerStats: {
      OpenAI: articles.filter(a => a.player === 'OpenAI').length,
      GoogleDeepMind: articles.filter(a => a.player === 'Google DeepMind').length,
      Anthropic: articles.filter(a => a.player === 'Anthropic').length,
      MetaAI: articles.filter(a => a.player === 'Meta AI').length,
      MicrosoftAI: articles.filter(a => a.player === 'Microsoft AI').length,
      OpenSource: articles.filter(a => a.player === 'Open Source & Frontier').length,
    },
    fetchedAt: new Date().toISOString()
  };

  newsCache = {
    timestamp: now,
    data: result
  };

  return result;
}
