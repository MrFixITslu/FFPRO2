/**
 * Ollama Local AI Service
 * Provides local LLM inference for AI Strategic Feedback, Financial Insights, and Advisory.
 */

let activeBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
let activeModel = process.env.OLLAMA_MODEL || 'llama3.2';

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
  }
  if (model && typeof model === 'string') {
    activeModel = model.trim();
  }
  return getOllamaConfig();
}

/**
 * Check Ollama connection and list available local models
 */
export async function checkOllamaHealth(timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${activeBaseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        online: false,
        error: `Ollama returned HTTP ${res.status}`,
        baseURL: activeBaseUrl,
        model: activeModel,
        models: []
      };
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models.map(m => m.name || m.model) : [];
    
    // Pick the best available model if the requested one is not downloaded
    let effectiveModel = activeModel;
    if (models.length > 0 && !models.some(m => m.startsWith(activeModel))) {
      // Pick first available model
      effectiveModel = models[0];
    }

    return {
      online: true,
      baseURL: activeBaseUrl,
      model: activeModel,
      effectiveModel,
      models,
      version: data.version || 'v0.x'
    };
  } catch (err) {
    return {
      online: false,
      error: err.name === 'AbortError' ? 'Connection timed out' : err.message || 'Cannot reach Ollama host',
      baseURL: activeBaseUrl,
      model: activeModel,
      models: []
    };
  }
}

/**
 * Low-level text generation via Ollama /api/generate
 */
export async function generateOllama({ prompt, system, model, temperature = 0.2, timeoutMs = 15000, jsonFormat = false }) {
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
