import { createHash } from 'crypto';

// Fetched webpage content is untrusted by definition. This module's only
// job is to reduce a raw HTML page down to plain text suitable for an LLM
// prompt — it does NOT and cannot guarantee that malicious instructions
// embedded in the text are removed. The actual defense against prompt
// injection lives in fundingResearch.js: model output is only ever used to
// fill specific validated fields (title, amount, deadline, etc.) — it is
// never interpreted as a command, never used to build further prompts
// unsupervised, and never reaches PostgreSQL without passing schema
// validation first.

const MAX_CONTENT_CHARS = 6000; // keeps prompts small for a 3B model on a small host

/**
 * Strips scripts, styles, and markup from raw HTML, returning plain text
 * truncated to a safe length for prompting a small local model.
 */
export function extractPlainText(html) {
  if (!html || typeof html !== 'string') return '';

  let text = html
    // Remove entire elements whose content is never meaningful body text.
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Line breaks for block-level tags so words don't run together.
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    // Decode a handful of common entities without pulling in a full parser.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length > MAX_CONTENT_CHARS) {
    text = text.slice(0, MAX_CONTENT_CHARS) + '\n[...truncated...]';
  }
  return text;
}

/**
 * Deterministic fingerprint of a source's content, used for duplicate /
 * change detection WITHOUT involving the model (per the "don't use AI for
 * things that can be done deterministically" requirement).
 */
export function hashContent(text) {
  return createHash('sha256').update(text || '').digest('hex');
}

/**
 * Basic sanity filter applied before content is sent to Ollama at all —
 * skips pages that are clearly not useful (too short, binary-looking, or
 * absurdly large) without needing a model call to find that out.
 */
export function isContentWorthAnalyzing(text) {
  if (!text) return false;
  if (text.length < 200) return false; // too thin to contain a real opportunity
  return true;
}
