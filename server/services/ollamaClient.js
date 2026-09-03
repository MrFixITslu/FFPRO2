// Thin client for the existing, already-running Ollama container.
// Per the deployment constraints: never touches the container lifecycle,
// never reinstalls/changes the model, and keeps concurrency low since the
// host is an i5-4590 / 8GB RAM box with no GPU.

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const REQUEST_TIMEOUT_MS = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '60000', 10);
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.OLLAMA_MAX_CONCURRENT || '1', 10));

// --- Simple concurrency semaphore -------------------------------------------
// Nothing fancy: a small host running one 3B model has no business running
// multiple generations at once — queueing keeps normal FFPRO requests
// (which don't touch Ollama at all) unaffected, and avoids the OOM risk of
// concurrent inference on an 8GB box.
let activeRequests = 0;
const waitQueue = [];

function acquireSlot() {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise(resolve => waitQueue.push(resolve));
}

function releaseSlot() {
  activeRequests--;
  const next = waitQueue.shift();
  if (next) {
    activeRequests++;
    next();
  }
}

/**
 * True if the Ollama server responds at all. Used by the job queue to skip
 * an entire research batch quietly (retrying later) instead of burning
 * through retry attempts while Ollama is down or restarting.
 */
export async function checkOllamaHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Calls the local model and returns the raw text response. Callers are
 * responsible for JSON-parsing and validating the result — this function
 * never assumes the output is trustworthy structured data.
 *
 * `format: 'json'` tells Ollama to constrain generation to valid JSON,
 * which dramatically cuts down on parse failures versus asking nicely in
 * the prompt alone.
 */
export async function ollamaGenerate({ prompt, system, jsonMode = true, temperature = 0.1 }) {
  await acquireSlot();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const body = {
      model: OLLAMA_MODEL,
      prompt,
      system,
      stream: false,
      options: { temperature },
    };
    if (jsonMode) body.format = 'json';

    let res;
    try {
      res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama request failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    return typeof data.response === 'string' ? data.response : '';
  } finally {
    releaseSlot();
  }
}

/**
 * Runs a JSON-mode generation and parses the result, retrying ONCE with a
 * shorter, more constrained prompt if the first attempt doesn't parse.
 * Returns null (never throws) if both attempts fail — callers must treat
 * null as "analysis failed" and leave the source for later reprocessing
 * rather than writing anything to the database.
 */
export async function ollamaGenerateJSON({ prompt, system, temperature = 0.1 }) {
  for (const attemptPrompt of [prompt, buildConstrainedRetryPrompt(prompt)]) {
    try {
      const raw = await ollamaGenerate({ prompt: attemptPrompt, system, jsonMode: true, temperature });
      const parsed = safeParseJSON(raw);
      if (parsed !== null) return parsed;
    } catch (err) {
      console.warn('[ollama] generateJSON attempt failed:', err?.message);
    }
  }
  return null;
}

function buildConstrainedRetryPrompt(originalPrompt) {
  return `${originalPrompt}\n\nIMPORTANT: Your previous response could not be parsed as JSON. Respond with ONLY a single valid JSON object. No markdown, no code fences, no commentary before or after.`;
}

function safeParseJSON(text) {
  if (!text) return null;
  const trimmed = text.trim();
  // Models sometimes wrap JSON in ```json fences despite instructions —
  // strip those defensively before parsing.
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try {
    return JSON.parse(stripped);
  } catch {
    // Last resort: try to find the first {...} block in the text.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const ollamaConfig = { OLLAMA_BASE_URL, OLLAMA_MODEL, MAX_CONCURRENT, REQUEST_TIMEOUT_MS };
