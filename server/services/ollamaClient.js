import { checkOllamaHealth as checkServiceHealth, generateOllama as serviceGenerateOllama, getOllamaConfig } from './ollamaService.js';

/**
 * True if the Ollama server responds at all.
 */
export async function checkOllamaHealth() {
  const health = await checkServiceHealth(5000);
  return health.online || health.connected;
}

/**
 * Calls the local model via unified ollamaService.
 */
export async function ollamaGenerate({ prompt, system, jsonMode = true, temperature = 0.1 }) {
  const res = await serviceGenerateOllama({
    prompt,
    system,
    jsonFormat: jsonMode,
    temperature,
    timeoutMs: parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '60000', 10)
  });
  return res.text || '';
}

/**
 * Runs a JSON-mode generation and parses the result, retrying ONCE with a
 * shorter, more constrained prompt if the first attempt doesn't parse.
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
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try {
    return JSON.parse(stripped);
  } catch {
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

export const ollamaConfig = getOllamaConfig();

