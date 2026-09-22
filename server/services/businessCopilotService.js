import { GoogleGenAI } from '@google/genai';
import { ollamaGenerateJSON } from './ollamaClient.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_ITEMS = 8;
const MAX_CONTEXT_CHARS = 32000;

function getGeminiKey() {
  const key = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (!key || key.length < 15 || key.startsWith('your_') || key === 'undefined' || key === 'null') {
    return null;
  }
  return key;
}

function boundedString(value, max = 400) {
  if (value === undefined || value === null) return undefined;
  return String(value).slice(0, max);
}

function boundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sanitizeList(value, maxItems = 50) {
  return Array.isArray(value) ? value.slice(0, maxItems) : [];
}

function sanitizeContext(input) {
  const context = input && typeof input === 'object' ? input : {};
  const forecast = context.forecast && typeof context.forecast === 'object' ? context.forecast : {};
  const validation = context.validation && typeof context.validation === 'object' ? context.validation : {};

  const sanitized = {
    projectId: boundedString(context.projectId, 120),
    location: {
      page: boundedString(context.location?.page, 120) || 'unknown',
      workflowStep: boundedString(context.location?.workflowStep, 80),
      section: boundedString(context.location?.section, 120),
      selectedEntityId: boundedString(context.location?.selectedEntityId, 120)
    },
    business: {
      name: boundedString(context.business?.name, 180),
      businessModelType: boundedString(context.business?.businessModelType, 40),
      operatingModel: boundedString(context.business?.operatingModel, 40),
      displayCurrency: context.business?.displayCurrency === 'XCD' ? 'XCD' : 'USD',
      exchangeRate: boundedNumber(context.business?.exchangeRate) || 2.70
    },
    services: sanitizeList(context.services, 60).map((service) => ({
      id: boundedString(service?.id, 120),
      name: boundedString(service?.name, 160),
      revenueModel: boundedString(service?.revenueModel, 60),
      unitLabel: boundedString(service?.unitLabel, 80),
      currency: service?.currency === 'XCD' ? 'XCD' : 'USD',
      rate: boundedNumber(service?.rate) || 0,
      expectedVolume: boundedNumber(service?.expectedVolume) || 0,
      unitsPerBooking: boundedNumber(service?.unitsPerBooking),
      directCostPerUnitOrJob: boundedNumber(service?.directCostPerUnitOrJob),
      monthlyGrowthRatePercent: boundedNumber(service?.monthlyGrowthRatePercent)
    })),
    costs: sanitizeList(context.costs, 80).map((cost) => ({
      id: boundedString(cost?.id, 120),
      name: boundedString(cost?.name, 160),
      classification: boundedString(cost?.classification, 60),
      category: boundedString(cost?.category, 100),
      currency: cost?.currency === 'XCD' ? 'XCD' : 'USD',
      amount: boundedNumber(cost?.amount) || 0,
      directCostBasis: boundedString(cost?.directCostBasis, 60),
      notes: boundedString(cost?.notes, 500)
    })),
    capacity: context.capacity && typeof context.capacity === 'object' ? context.capacity : undefined,
    loan: context.loan && typeof context.loan === 'object' ? context.loan : undefined,
    forecast: {
      month1: forecast.month1,
      year1: forecast.year1,
      year3: forecast.year3,
      year5: forecast.year5,
      breakEven: forecast.breakEven
    },
    validation: {
      errors: sanitizeList(validation.errors, 25).map(sanitizeIssue),
      warnings: sanitizeList(validation.warnings, 25).map(sanitizeIssue),
      info: sanitizeList(validation.info, 25).map(sanitizeIssue)
    },
    narrative: sanitizeNarrative(context.narrative),
    documents: sanitizeList(context.documents, 30).map((document) => ({
      id: boundedString(document?.id, 120),
      name: boundedString(document?.name, 180),
      type: boundedString(document?.type, 80),
      date: boundedString(document?.date, 50),
      summary: boundedString(document?.summary, 700)
    }))
  };

  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= MAX_CONTEXT_CHARS) return sanitized;

  // Drop long-form narrative first; structured plan and forecast data are higher priority.
  sanitized.narrative = undefined;
  const withoutNarrative = JSON.stringify(sanitized);
  if (withoutNarrative.length <= MAX_CONTEXT_CHARS) return sanitized;

  // Bound large collections as a final safety valve.
  sanitized.services = sanitized.services.slice(0, 30);
  sanitized.costs = sanitized.costs.slice(0, 40);
  sanitized.documents = sanitized.documents.slice(0, 12);
  return sanitized;
}

function sanitizeIssue(issue) {
  return {
    id: boundedString(issue?.id, 120),
    title: boundedString(issue?.title, 180),
    message: boundedString(issue?.message, 700),
    recommendation: boundedString(issue?.recommendation, 700)
  };
}

function sanitizeNarrative(value) {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value)
    .slice(0, 20)
    .map(([key, text]) => [key, boundedString(text, 1800)])
    .filter(([, text]) => Boolean(text));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitizeHistory(history) {
  return sanitizeList(history, MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: boundedString(item?.content, 1500) || ''
    }))
    .filter((item) => item.content);
}

function normalizeMode(value) {
  return ['explain', 'audit', 'scenario', 'action'].includes(value) ? value : 'explain';
}

function normalizeResponse(value, provider, model) {
  if (!value || typeof value !== 'object') return null;
  const message = boundedString(value.message, 6000);
  if (!message) return null;

  return {
    message,
    mode: normalizeMode(value.mode),
    observations: sanitizeList(value.observations, 12).map((item) => ({
      severity: ['info', 'warning', 'error'].includes(item?.severity) ? item.severity : 'info',
      text: boundedString(item?.text, 900) || '',
      metricId: boundedString(item?.metricId, 120)
    })).filter((item) => item.text),
    calculations: sanitizeList(value.calculations, 12).map((item) => ({
      label: boundedString(item?.label, 180) || 'Calculation',
      formula: boundedString(item?.formula, 500),
      value: boundedString(item?.value, 180) || ''
    })).filter((item) => item.value),
    sources: sanitizeList(value.sources, 12).map((item) => ({
      type: ['plan', 'forecast', 'validation', 'document', 'user', 'ai'].includes(item?.type)
        ? item.type
        : 'plan',
      label: boundedString(item?.label, 220) || 'Plan data',
      documentId: boundedString(item?.documentId, 120)
    })),
    // Read-only MVP: proposals are intentionally suppressed server-side.
    proposals: [],
    suggestedPrompts: sanitizeList(value.suggestedPrompts, 5)
      .map((item) => boundedString(item, 180))
      .filter(Boolean),
    provider,
    model
  };
}

function buildSystemPrompt() {
  return `You are FFPRO Copilot, a read-only business planning and financial modeling assistant embedded inside FFPRO.

AUTHORITATIVE DATA RULES:
- The structured FFPRO plan, deterministic forecast, break-even output, and validation issues supplied in CONTEXT are authoritative.
- Never invent a financial value when the context already contains the relevant value.
- Do not silently correct, replace, or reconcile user data.
- Clearly distinguish saved plan inputs, calculated forecast results, validation findings, document-derived facts, user statements, and AI recommendations.
- If information is missing, say it is missing.
- If plan data conflicts with a document summary, identify the conflict; do not choose a winner unless the user explicitly tells you which source is authoritative.
- Never claim a lender, bank, grant agency, or investor has approved or will approve a plan.

READ-ONLY MVP RULES:
- You cannot modify the plan.
- Do not claim that you applied, saved, updated, or changed anything.
- For scenario questions, explain directionally using the supplied facts. Do not invent recalculated scenario totals because the scenario engine is not yet connected.
- You may recommend a specific field change, but describe it as a recommendation only.

RESPONSE STYLE:
- Be concise, practical, and quantitative.
- Lead with the answer.
- Use calculations supplied in context whenever useful.
- When an existing validation issue directly answers the question, surface it.

Return ONLY one valid JSON object with this shape:
{
  "message": "plain-language answer",
  "mode": "explain|audit|scenario|action",
  "observations": [
    {"severity":"info|warning|error","text":"...","metricId":"optional"}
  ],
  "calculations": [
    {"label":"...","formula":"optional","value":"..."}
  ],
  "sources": [
    {"type":"plan|forecast|validation|document|user|ai","label":"...","documentId":"optional"}
  ],
  "suggestedPrompts": ["...", "..."]
}

Do not include markdown fences. Do not include a proposals field.`;
}

function buildPrompt(message, context, history) {
  return `CURRENT USER QUESTION:
${message}

RECENT CONVERSATION:
${JSON.stringify(history)}

CURRENT FFPRO CONTEXT:
${JSON.stringify(context)}

Answer only from the supplied context plus general explanatory knowledge. If the requested fact is not supported by the context, say so.`;
}

function deterministicFallback(message, context) {
  const currency = context.business?.displayCurrency === 'XCD' ? 'EC$' : 'US$';
  const errors = context.validation?.errors || [];
  const warnings = context.validation?.warnings || [];
  const year1 = context.forecast?.year1 || {};
  const breakEven = context.forecast?.breakEven || {};

  const parts = [];
  if (errors.length > 0) {
    parts.push(`FFPRO currently has ${errors.length} validation error${errors.length === 1 ? '' : 's'}. The first is: ${errors[0].title} — ${errors[0].message}`);
  } else if (warnings.length > 0) {
    parts.push(`FFPRO currently has ${warnings.length} validation warning${warnings.length === 1 ? '' : 's'}. The first is: ${warnings[0].title} — ${warnings[0].message}`);
  } else {
    parts.push('The deterministic FFPRO checks do not currently report an error or warning in the supplied context.');
  }

  if (Number.isFinite(Number(year1.revenue))) {
    parts.push(`Year 1 revenue is ${currency}${Number(year1.revenue).toLocaleString()} and Year 1 net profit is ${currency}${Number(year1.netProfit || 0).toLocaleString()}.`);
  }
  if (Number.isFinite(Number(breakEven.breakEvenRevenueMonthly))) {
    parts.push(`Monthly break-even revenue is ${currency}${Number(breakEven.breakEvenRevenueMonthly).toLocaleString()}.`);
  }

  return {
    message: parts.join(' '),
    mode: /check|audit|issue|error|wrong|problem/i.test(message) ? 'audit' : 'explain',
    observations: [
      ...errors.slice(0, 3).map((issue) => ({ severity: 'error', text: `${issue.title}: ${issue.message}` })),
      ...warnings.slice(0, 3).map((issue) => ({ severity: 'warning', text: `${issue.title}: ${issue.message}` }))
    ],
    calculations: [],
    sources: [
      { type: 'forecast', label: 'FFPRO deterministic forecast' },
      { type: 'validation', label: 'FFPRO validation engine' }
    ],
    proposals: [],
    suggestedPrompts: [
      'Explain my Year 1 revenue',
      'Check this plan for inconsistencies',
      'Explain my break-even result'
    ],
    provider: 'deterministic'
  };
}

export async function generateBusinessCopilotResponse({ message, context, history }) {
  const cleanMessage = boundedString(message, MAX_MESSAGE_CHARS)?.trim();
  if (!cleanMessage) {
    throw Object.assign(new Error('Message is required.'), { status: 400, publicMessage: 'Message is required.' });
  }

  const cleanContext = sanitizeContext(context);
  const cleanHistory = sanitizeHistory(history);
  const system = buildSystemPrompt();
  const prompt = buildPrompt(cleanMessage, cleanContext, cleanHistory);

  try {
    const response = await ollamaGenerateJSON({
      prompt,
      system,
      temperature: 0.15
    });
    const normalized = normalizeResponse(response, 'ollama');
    if (normalized) return normalized;
  } catch (error) {
    console.warn('[business-copilot] Ollama unavailable:', error?.message || error);
  }

  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json'
        }
      });
      const parsed = JSON.parse((response.text || '').trim());
      const normalized = normalizeResponse(parsed, 'gemini', 'gemini-2.5-flash');
      if (normalized) return normalized;
    } catch (error) {
      console.warn('[business-copilot] Gemini unavailable:', error?.message || error);
    }
  }

  return deterministicFallback(cleanMessage, cleanContext);
}

export const __businessCopilotTest = {
  sanitizeContext,
  sanitizeHistory,
  normalizeResponse,
  deterministicFallback
};
