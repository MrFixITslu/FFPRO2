/**
 * Ollama Local AI Service
 * Provides local LLM inference for AI Strategic Feedback, Financial Insights, Quote Extraction, and Advisory.
 */

let isUserConfigured = false;
let activeBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
let activeModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

// Concurrency Semaphore (max 1 request at a time to prevent OOM on host)
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.OLLAMA_MAX_CONCURRENT || '1', 10));
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
 * Get current Ollama configuration
 */
export function getOllamaConfig() {
  return {
    baseURL: activeBaseUrl,
    model: activeModel,
    envBaseURL: process.env.OLLAMA_BASE_URL || null,
    envModel: process.env.OLLAMA_MODEL || null
  };
}

/**
 * Dynamically update Ollama configuration at runtime
 */
export function updateOllamaConfig({ baseURL, model }) {
  if (baseURL && typeof baseURL === 'string') {
    activeBaseUrl = baseURL.trim().replace(/\/+$/, '');
    isUserConfigured = true;
  }
  if (model && typeof model === 'string') {
    activeModel = model.trim();
  }
  return getOllamaConfig();
}

/**
 * Helper to probe a single Ollama base URL
 */
async function probeUrl(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/tags`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    }
  } catch {
    clearTimeout(timeout);
  }
  return { ok: false };
}

/**
 * Check Ollama connection and list available local models.
 * Includes auto-discovery of working host URL if default is unreachable.
 */
export async function checkOllamaHealth(timeoutMs = 2500) {
  // Try current activeBaseUrl
  let probe = await probeUrl(activeBaseUrl, timeoutMs);

  // If current activeBaseUrl fails and user hasn't manually overridden it, test candidates
  if (!probe.ok && !isUserConfigured) {
    const candidateUrls = [
      process.env.OLLAMA_BASE_URL,
      'http://ollama:11434',
      'http://127.0.0.1:11434',
      'http://host.docker.internal:11434',
      'http://localhost:11434'
    ].filter(Boolean).map(u => u.replace(/\/+$/, ''));

    for (const cand of candidateUrls) {
      if (cand === activeBaseUrl) continue;
      const res = await probeUrl(cand, Math.min(1500, timeoutMs));
      if (res.ok) {
        activeBaseUrl = cand;
        probe = res;
        console.log(`[Ollama Service] Auto-discovered working Ollama endpoint at: ${activeBaseUrl}`);
        break;
      }
    }
  }

  if (!probe.ok) {
    return {
      online: false,
      connected: false,
      error: `Cannot reach Ollama host at ${activeBaseUrl}`,
      baseURL: activeBaseUrl,
      model: activeModel,
      models: []
    };
  }

  const data = probe.data || {};
  const models = Array.isArray(data.models) ? data.models.map(m => m.name || m.model) : [];
  
  // Pick best available model if requested one is not installed
  let effectiveModel = activeModel;
  if (models.length > 0 && !models.some(m => m.startsWith(activeModel))) {
    effectiveModel = models[0];
  }

  return {
    online: true,
    connected: true,
    baseURL: activeBaseUrl,
    model: activeModel,
    effectiveModel,
    models,
    version: data.version || 'v0.x'
  };
}

/**
 * Low-level text generation via Ollama /api/generate
 */
export async function generateOllama({ prompt, system, model, temperature = 0.2, timeoutMs = 60000, jsonFormat = false }) {
  await acquireSlot();
  try {
    const targetModel = model || activeModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = {
        model: targetModel,
        prompt,
        stream: false,
        options: {
          temperature
        }
      };

      if (system) {
        body.system = system;
      }

      if (jsonFormat) {
        body.format = 'json';
      }

      const res = await fetch(`${activeBaseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama error (${res.status}): ${errText || res.statusText}`);
      }

      const data = await res.json();
      return {
        text: (data.response || '').trim(),
        model: data.model || targetModel,
        provider: 'ollama',
        totalDuration: data.total_duration
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } finally {
    releaseSlot();
  }
}

/**
 * Generate AI Strategic Feedback for the Wealth Projection Matrix
 */
export async function generateStrategicFeedback({ currentNetWorth, monthlyIncome, monthlyExpenses, monthlyContribution, projectedValue }) {
  const savingsRate = monthlyIncome > 0 ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) : 0;
  
  const system = `You are a world-class certified financial analyst (CFA) and strategic wealth advisor.
Provide concise, rigorous, highly quantitative feedback on the user's wealth projection.
Guidelines:
- Output exactly 2 cohesive sentences.
- Sentence 1: Analyze their trajectory, savings margin, and capital efficiency.
- Sentence 2: Give a high-impact, actionable recommendation (e.g. index fund compound allocation, reducing expense drag, dollar-cost averaging, or tax-advantaged buffers).
- Do not use generic buzzwords. Be direct, authoritative, and analytical.`;

  const prompt = `Wealth Projection Dataset:
- Current Net Worth: $${(currentNetWorth || 0).toLocaleString()}
- Monthly Income: $${(monthlyIncome || 0).toLocaleString()}
- Monthly Fixed & Budgeted Expenses: $${(monthlyExpenses || 0).toLocaleString()}
- Calculated Savings Margin: ${savingsRate}%
- Monthly Dedicated Savings/Investment Contribution: $${(monthlyContribution || 0).toLocaleString()}
- Target Projected Wealth at Horizon: $${(projectedValue || 0).toLocaleString()}

Write exactly 2 sentences of professional analysis according to instructions.`;

  return await generateOllama({
    prompt,
    system,
    temperature: 0.3,
    timeoutMs: 12000
  });
}

/**
 * Generate AI Financial Insight for Snapshot / Safe-to-Spend
 */
export async function generateFinancialInsight({ totalIncome, totalExpenses, netWorth, cycleRollover, dailySafeSpend, netMargin }) {
  const system = `You are an elite automated Chief Financial Officer (CFO) and strategic wealth planner.
Guidelines:
- Write exactly ONE punchy, high-impact, data-driven sentence of strategic financial insight or recommendation.
- Direct, clear, and actionable. Avoid filler phrases.`;

  const prompt = `Financial Snapshot:
- Monthly Total Income: $${(totalIncome || 0).toLocaleString()}
- Monthly Total Expenses: $${(totalExpenses || 0).toLocaleString()}
- Calculated Net Worth: $${(netWorth || 0).toLocaleString()}
- Rollover Pool / Surplus: $${(cycleRollover || 0).toLocaleString()}
- Daily Safe-to-Spend limit: $${(dailySafeSpend || 0).toLocaleString()}
- Net Margin: ${netMargin || 0}%

Write exactly ONE sentence of punchy, highly actionable strategic insight.`;

  return await generateOllama({
    prompt,
    system,
    temperature: 0.2,
    timeoutMs: 10000
  });
}

/**
 * Clean and parse JSON returned by LLMs (strips markdown codeblocks and extraneous preamble)
 */
function cleanAndParseJSON(rawText) {
  if (!rawText) return null;
  let text = rawText.trim();
  
  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Find first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    // Attempt minor regex cleanups for trailing commas
    try {
      const sanitized = text
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\/\/.*/g, '');
      return JSON.parse(sanitized);
    } catch {
      throw new Error(`Failed to parse extracted JSON from Ollama: ${err.message}. Raw output: ${rawText.slice(0, 300)}`);
    }
  }
}

/**
 * Helper to parse numbers from various international quote formats (e.g. "9 828,00", "$15,366.40", "1 200,00")
 */
function parseCurrencyNumber(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim();
  str = str.replace(/[$€£¥₹]/g, '').trim();
  // Handle negative sign
  const isNegative = str.startsWith('-') || str.includes('(-') || (str.startsWith('(') && str.endsWith(')'));
  str = str.replace(/[()\-]/g, '').trim();

  // If decimal is comma (e.g. "9 828,00" or "10,00")
  if (/,\d{1,2}$/.test(str)) {
    str = str.replace(/[\s\.]/g, '').replace(',', '.');
  } else {
    str = str.replace(/[\s,]/g, '');
  }
  const num = parseFloat(str);
  const finalNum = isNaN(num) ? 0 : num;
  return isNegative ? -Math.abs(finalNum) : finalNum;
}

/**
 * Extract structured Supplier Quote data using local Ollama.
 * STRICT CONSTRAINT: Used ONLY for quote data extraction into Interactive Sale Price Costing.
 * No business plan generation, no selling price determination, no financial projections.
 */
export async function extractSupplierQuote({ quoteText, fileName, model }) {
  if (!quoteText || quoteText.trim().length === 0) {
    throw new Error('Quote text content is empty or unreadable.');
  }

  const system = `You are a precise data extraction engine.
Your sole job is to extract structured supplier quote information from the provided document into a clean, valid JSON object.
STRICT BOUNDARIES:
- Extract ONLY what is explicitly stated in the quote document.
- Quoted prices are supplier COSTS, never sale prices.
- Do NOT generate selling prices, profit margins, or business plans.
- Identify: Supplier Name, Quote Number/Ref, Quote Date (YYYY-MM-DD or as written), Currency (e.g. USD, EUR, GBP, CAD, XCD), Line Items (item name, description, quantity, unitCost, discount, lineTotal), Discounts, Shipping/Freight costs, Subtotal, Total, and relevant Commercial Terms (payment terms, validity, lead times).
- Ensure all numeric values are numbers or clean formatted number strings.
- If quantity is missing for an item, default to 1.
- If unitCost is missing but lineTotal exists, unitCost = lineTotal / quantity.
- Return ONLY the JSON object. No commentary, no preamble, no markdown formatting.`;

  const prompt = `SUPPLIER QUOTE DOCUMENT (${fileName || 'Quote Document'}):
============================================================
${quoteText.slice(0, 15000)}
============================================================

Extract all quote information and return ONLY this JSON structure:
{
  "supplier": "Name of supplier or vendor",
  "quoteNumber": "Quote reference or invoice number",
  "quoteDate": "YYYY-MM-DD or date as written",
  "currency": "USD",
  "items": [
    {
      "item": "Product / Part / Service Name",
      "description": "Item details, SKU, specifications, or model",
      "quantity": 1,
      "unitCost": 0.00,
      "discount": 0.00,
      "shippingCost": 0.00,
      "lineTotal": 0.00
    }
  ],
  "discounts": 0.00,
  "shippingCosts": 0.00,
  "subtotal": 0.00,
  "total": 0.00,
  "commercialTerms": "Key terms, validity period, delivery notes or payment conditions"
}`;

  const result = await generateOllama({
    prompt,
    system,
    model,
    temperature: 0.1,
    timeoutMs: 45000,
    jsonFormat: true
  });

  const parsed = cleanAndParseJSON(result.text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Ollama returned non-object response for quote extraction.');
  }

  // Normalize fields to ensure consistency with international format resilience
  const normalizedItems = Array.isArray(parsed.items) ? parsed.items.map((it, idx) => {
    const qty = Math.max(1, Math.round(parseCurrencyNumber(it.quantity)) || 1);
    const unitCost = Math.max(0, parseCurrencyNumber(it.unitCost) || 0);
    const discount = Math.abs(parseCurrencyNumber(it.discount) || 0);
    const shipping = Math.max(0, parseCurrencyNumber(it.shippingCost) || 0);
    const lineTotal = parseCurrencyNumber(it.lineTotal) || (qty * unitCost - discount + shipping);

    return {
      item: String(it.item || `Quoted Item ${idx + 1}`).trim(),
      description: String(it.description || '').trim(),
      quantity: qty,
      unitCost: parseFloat(unitCost.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      shippingCost: parseFloat(shipping.toFixed(2)),
      lineTotal: parseFloat(lineTotal.toFixed(2))
    };
  }) : [];

  const subtotal = Math.abs(parseCurrencyNumber(parsed.subtotal)) || normalizedItems.reduce((s, it) => s + it.lineTotal, 0);
  const shippingCosts = Math.abs(parseCurrencyNumber(parsed.shippingCosts)) || 0;
  const discounts = Math.abs(parseCurrencyNumber(parsed.discounts)) || 0;
  const total = Math.abs(parseCurrencyNumber(parsed.total)) || (subtotal + shippingCosts - discounts);

  return {
    supplier: String(parsed.supplier || 'Unknown Supplier').trim(),
    quoteNumber: String(parsed.quoteNumber || '').trim(),
    quoteDate: String(parsed.quoteDate || new Date().toISOString().split('T')[0]).trim(),
    currency: String(parsed.currency || 'USD').trim().toUpperCase(),
    items: normalizedItems,
    discounts: parseFloat(discounts.toFixed(2)),
    shippingCosts: parseFloat(shippingCosts.toFixed(2)),
    subtotal: parseFloat(subtotal.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    commercialTerms: String(parsed.commercialTerms || '').trim(),
    modelUsed: result.model
  };
}
