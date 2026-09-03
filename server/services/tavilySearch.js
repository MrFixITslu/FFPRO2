// Search/fetch layer — discovers candidate funding/grant pages via Tavily.
// This module ONLY finds and retrieves pages; it never analyzes content
// (that's Ollama's job, downstream, on sanitized text) and never touches
// the database directly.

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Runs a Tavily search and returns candidate result URLs with the metadata
 * Tavily provides. Returns [] (never throws) on failure — a bad search
 * query or a Tavily outage should not take down the research job or the
 * main app.
 */
export async function tavilySearch(query, { maxResults = 8 } = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[tavily] TAVILY_API_KEY not set — skipping search for:', query);
    return [];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.warn('[tavily] Search failed:', res.status, await res.text().catch(() => ''));
      return [];
    }

    const data = await res.json();
    return (data.results || []).map(r => ({
      url: r.url,
      title: r.title,
      snippet: r.content,
    }));
  } catch (err) {
    console.warn('[tavily] Search error:', err?.message);
    return [];
  }
}

/**
 * Fetches a single candidate page's raw HTML. Enforces a size cap and a
 * timeout so one slow/huge page can't stall the whole research batch, and
 * skips non-HTML responses (PDFs, binaries) rather than trying to parse
 * them as text.
 */
export async function fetchPageHtml(url) {
  try {
    if (!isHttpUrl(url)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FFPRO-FundingFinder/1.0)' },
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength && contentLength > 3_000_000) return null; // 3MB safety cap

    const html = await res.text();
    return html.slice(0, 2_000_000); // hard cap even if content-length was absent/wrong
  } catch (err) {
    console.warn('[fetch] Page fetch failed for', url, '-', err?.message);
    return null;
  }
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
