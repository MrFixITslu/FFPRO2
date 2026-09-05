import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { requireAuth } from '../middleware/requireAuth.js';
import rateLimit from 'express-rate-limit';
import {
  checkOllamaHealth,
  getOllamaConfig,
  updateOllamaConfig,
  generateOllama,
  generateStrategicFeedback,
  generateFinancialInsight
} from '../services/ollamaService.js';

const router = Router();

// Rate limiting for public market data feed to prevent ticker flooding
const marketDataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Bounded rate limiter on authenticated AI calls to protect Gemini quota & infrastructure
const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 AI requests per minute per user/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please slow down.' }
});

// Ensure API_KEY defaults to GEMINI_API_KEY
if (!process.env.API_KEY && process.env.GEMINI_API_KEY) {
  process.env.API_KEY = process.env.GEMINI_API_KEY;
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    updateType: { type: Type.STRING, enum: ['transaction', 'portfolio'], description: "Determine if this is a spending/earning event or a statement of current holdings (e.g., 'I have 0.5 BTC')." },
    transaction: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: "Total amount including tax." },
        category: { type: Type.STRING, description: "One of the provided financial categories." },
        description: { type: Type.STRING, description: "A friendly summary of the purchase." },
        type: { type: Type.STRING, enum: ['expense', 'income', 'savings', 'withdrawal'], description: "The nature of the transaction." },
        date: { type: Type.STRING, description: "ISO date format (YYYY-MM-DD)." },
        vendor: { type: Type.STRING, description: "The merchant or business name extracted from the header." },
        lineItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Name of the individual product or service." },
              price: { type: Type.NUMBER, description: "Unit price or total for this item row." },
              quantity: { type: Type.NUMBER, description: "Number of units purchased." }
            }
          },
          description: "A detailed list of every item listed on the receipt."
        }
      }
    },
    portfolio: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: "Ticker symbol like BTC, ETH, or VOO." },
        quantity: { type: Type.NUMBER, description: "The total amount held." },
        provider: { type: Type.STRING, enum: ['Binance', 'Vanguard'], description: "The institution where the asset is held." }
      }
    }
  },
  required: ["updateType"]
};

const CATEGORIES = ['Food', 'Transport', 'Housing', 'Entertainment', 'Utilities', 'Health', 'Shopping', 'Education', 'Personal', 'Income', 'Savings', 'Other', 'Investments', 'Transfer'];

function validateMimeType(mimeType) {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ];
  return allowedTypes.includes(mimeType);
}

// Helper functions for real-time market data
async function fetchCryptoPrices() {
  const results = [];
  try {
    const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.result) {
        const mapping = {
          'XXBTZUSD': 'BTC',
          'XETHZUSD': 'ETH',
          'SOLUSD': 'SOL'
        };
        for (const [key, symbol] of Object.entries(mapping)) {
          const item = data.result[key];
          if (item && item.c && item.c[0] && item.o) {
            const price = parseFloat(item.c[0]);
            const open = parseFloat(item.o);
            const change24h = open ? ((price - open) / open) * 100 : 0;
            results.push({
              symbol,
              price,
              change24h
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn(`Kraken crypto price fetch bypassed:`, e.message || e);
  }
  return results;
}

async function fetchStockPrices() {
  const symbols = ['VOO', 'VOOG'];
  const results = [];
  for (const symbol of symbols) {
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta) {
          const price = meta.regularMarketPrice;
          const prevClose = meta.previousClose;
          const change24h = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
          results.push({
            symbol,
            price: parseFloat(price),
            change24h: parseFloat(change24h)
          });
        }
      }
    } catch (e) {
      console.warn(`Yahoo stock fetch for ${symbol} bypassed:`, e.message || e);
    }
  }
  return results;
}

const handleMarketData = async (req, res) => {
  let prices = [];
  const fetchedSymbols = new Set();

  // 1. Try to fetch cryptos directly from Binance (fast, free, accurate)
  try {
    const cryptos = await fetchCryptoPrices();
    for (const c of cryptos) {
      prices.push(c);
      fetchedSymbols.add(c.symbol);
    }
  } catch (err) {
    console.error('Direct crypto fetch failed:', err);
  }

  // 2. Try to fetch stocks directly from Yahoo Finance
  try {
    const stocks = await fetchStockPrices();
    for (const s of stocks) {
      prices.push(s);
      fetchedSymbols.add(s.symbol);
    }
  } catch (err) {
    console.error('Direct stock fetch failed:', err);
  }

  const allSymbols = ['BTC', 'ETH', 'SOL', 'VOO', 'VOOG'];
  const missingSymbols = allSymbols.filter(s => !fetchedSymbols.has(s));

  // 3. Fallback to Gemini with search grounding for missing symbols
  if (missingSymbols.length > 0) {
    if (!process.env.API_KEY) {
      console.error('API_KEY not configured for market-data fallback');
    } else {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Provide current market prices and 24h percent changes for these specific symbols: ${missingSymbols.join(', ')}.`,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                prices: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      symbol: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                      change24h: { type: Type.NUMBER }
                    },
                    required: ["symbol", "price", "change24h"]
                  }
                }
              },
              required: ["prices"]
            }
          }
        });

        const text = response.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.prices)) {
            for (const item of parsed.prices) {
              if (item && item.symbol && typeof item.price === 'number') {
                prices.push({
                  symbol: item.symbol,
                  price: item.price,
                  change24h: typeof item.change24h === 'number' ? item.change24h : 0
                });
                fetchedSymbols.add(item.symbol);
              }
            }
          }
        }
      } catch (geminiErr) {
        console.error('Gemini market-data fallback failed:', geminiErr);
      }
    }
  }

  // 4. Fill in hardcoded fallbacks for any still-missing symbols so the ticker NEVER breaks
  const fallbackPrices = {
    'BTC': { price: 64000.00, change24h: 1.2 },
    'ETH': { price: 1820.00, change24h: -0.5 },
    'SOL': { price: 77.00, change24h: 3.4 },
    'VOO': { price: 693.86, change24h: 0.2 },
    'VOOG': { price: 83.31, change24h: 0.1 }
  };

  for (const s of allSymbols) {
    if (!fetchedSymbols.has(s)) {
      prices.push({
        symbol: s,
        price: fallbackPrices[s].price,
        change24h: fallbackPrices[s].change24h
      });
    }
  }

  // Sort prices in standard order: BTC, ETH, SOL, VOO, VOOG
  const order = { 'BTC': 1, 'ETH': 2, 'SOL': 3, 'VOO': 4, 'VOOG': 5 };
  prices.sort((a, b) => (order[a.symbol] || 99) - (order[b.symbol] || 99));

  // Determine if it is live
  const isLive = fetchedSymbols.size > 0;

  res.json({ prices, quotaExhausted: !isLive });
};

// Public endpoints (no authentication required so ticker is live for anyone, but rate-limited)
router.get('/market-data', marketDataLimiter, handleMarketData);
router.post('/market-data', marketDataLimiter, handleMarketData);

router.use(requireAuth);
router.use(aiGenerationLimiter);

// 1. Parse receipt or financial text input
router.post('/parse', async (req, res) => {
  const { input, isMedia = false } = req.body || {};
  
  if (!input) {
    return res.status(400).json({ error: 'Input is required.' });
  }

  if (!process.env.API_KEY) {
    console.error('API_KEY not configured');
    return res.status(500).json({ error: 'AI service not configured.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    let contents;
    if (isMedia) {
      if (!input.mimeType || !validateMimeType(input.mimeType)) {
        return res.status(400).json({ error: 'Invalid image format. Only JPEG, PNG, WebP, GIF, HEIC, HEIF are supported.' });
      }
      if (!input.data || typeof input.data !== 'string') {
        return res.status(400).json({ error: 'Invalid media data.' });
      }
      
      contents = {
        parts: [
          { inlineData: { data: input.data, mimeType: input.mimeType } },
          { text: "CRITICAL: Perform deep OCR on this receipt. 1. Identify the Merchant/Vendor name. 2. Extract every single line item, its quantity, and price. 3. Determine the total amount. 4. If it's a balance statement (e.g. 'Binance shows 1 BTC'), use portfolio update. Otherwise, use transaction." }
        ]
      };
    } else {
      if (typeof input !== 'string' || input.length > 1000) {
        return res.status(400).json({ error: 'Text input must be a string under 1000 characters.' });
      }
      contents = {
        parts: [{ text: `Analyze this financial intent: "${input}". Extract merchant, items, and total amount.` }]
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        systemInstruction: `You are an elite Receipt & Financial Parsing Engine. 
        Your goal is 100% accuracy in merchant detection and line-item extraction. 
        Categories available: ${CATEGORIES.join(", ")}. 
        Always return structured JSON. 
        For receipts, always populate the 'vendor' and 'lineItems' fields with high detail.`
      }
    });

    const text = response.text;
    if (!text) {
      return res.status(500).json({ error: 'Failed to parse input.' });
    }

    try {
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (parseErr) {
      console.error('JSON parse error from Gemini:', parseErr);
      res.status(500).json({ error: 'Failed to parse AI response.' });
    }
  } catch (error) {
    console.error('Gemini AI Error:', error);
    res.status(500).json({ error: 'Failed to process request with AI service.' });
  }
});

// 2. Market data is now a public endpoint defined above

// Ollama Status & Config Endpoints
router.get('/ollama/status', async (req, res) => {
  const health = await checkOllamaHealth(3000);
  res.json(health);
});

router.post('/ollama/config', async (req, res) => {
  const { baseURL, model } = req.body || {};
  const updated = updateOllamaConfig({ baseURL, model });
  const health = await checkOllamaHealth(3000);
  res.json({
    config: updated,
    health
  });
});

// 3. AI Chat Endpoint
router.post('/chat', async (req, res) => {
  const { message, context } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const systemPrompt = `You are an elite, professional personal finance advisor called 'SmartBudget Pro Advisor'. 
You help the user optimize their financial decisions, track spending, manage portfolios, and calculate budgets.
Here is the user's current financial context:
- Liquid Funds available: $${context?.availableFunds || 0}
- Total Portfolio Investments: $${context?.totalInvestments || 0}
- Portfolios active: ${context?.providers?.join(', ') || 'None'}
- Holding symbols: ${context?.holdings?.join(', ') || 'None'}
- Current Market Feed: ${JSON.stringify(context?.marketPrices || [])}
- Recent activities: ${JSON.stringify(context?.recentTransactions || [])}

Be professional, practical, encouraging, and provide clear, bulleted recommendations.`;

  // 1. Attempt Ollama first
  try {
    const ollamaRes = await generateOllama({
      prompt: message,
      system: systemPrompt,
      temperature: 0.3,
      timeoutMs: 12000
    });
    if (ollamaRes.text) {
      return res.json({
        message: ollamaRes.text,
        provider: 'ollama',
        model: ollamaRes.model
      });
    }
  } catch (ollamaErr) {
    // Continue to Gemini fallback
  }

  // 2. Gemini fallback
  if (process.env.API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: message,
        config: {
          systemInstruction: systemPrompt
        }
      });
      return res.json({
        message: response.text || "I processed your request, let me know how else I can help.",
        provider: 'gemini'
      });
    } catch (geminiErr) {
      console.error('Gemini fallback failed:', geminiErr);
    }
  }

  res.json({
    message: "Portfolio and financial tracking active. For AI advisory responses, ensure Ollama is running locally (e.g. `ollama run llama3.2`) or configure Gemini API credentials.",
    provider: 'standby'
  });
});

// 4. AI Insights Generation (Powered by Ollama)
router.post('/insights', async (req, res) => {
  const { totalIncome, totalExpenses, netWorth, cycleRollover, dailySafeSpend, netMargin } = req.body || {};

  // 1. Attempt Ollama first for AI Insights
  try {
    const ollamaRes = await generateFinancialInsight({
      totalIncome,
      totalExpenses,
      netWorth,
      cycleRollover,
      dailySafeSpend,
      netMargin
    });
    if (ollamaRes.text) {
      return res.json({
        insight: ollamaRes.text,
        provider: 'ollama',
        model: ollamaRes.model
      });
    }
  } catch (ollamaErr) {
    // Silently continue to Gemini fallback
  }

  // 2. Attempt Gemini fallback
  if (process.env.API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Review this high-level snapshot of the user's current financial period:
      - Monthly Total Income: $${totalIncome || 0}
      - Monthly Total Expenses: $${totalExpenses || 0}
      - Calculated Net Worth: $${netWorth || 0}
      - rollover pool: $${cycleRollover || 0}
      - Daily Safe-to-Spend limit: $${dailySafeSpend || 0}
      - Current savings margin rate: ${netMargin || 0}%

      Write exactly ONE sentence of punchy, highly actionable, strategic financial insight or recommendation. Avoid generic fluff. Be direct and analytical.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      return res.json({
        insight: response.text?.trim() || "Safe spend limits verified.",
        provider: 'gemini'
      });
    } catch (geminiErr) {
      console.error('Gemini Insights fallback failed:', geminiErr);
    }
  }

  // 3. Rule-based heuristic insight
  const marginNum = Number(netMargin) || 0;
  let fallbackInsight = "Financial metrics aligned with projection parameters. Safe Spend velocity is stable.";
  if (marginNum >= 40) {
    fallbackInsight = `Exceptional ${marginNum}% savings rate; route excess surplus directly into broad-market index allocations.`;
  } else if (marginNum >= 20) {
    fallbackInsight = `Strong ${marginNum}% cash retention; consider auto-sweeping cycle rollover into growth milestones.`;
  } else if (marginNum > 0) {
    fallbackInsight = `Positive margin of ${marginNum}%; optimize secondary category budgets to accelerate emergency liquidity.`;
  } else {
    fallbackInsight = `Expenses currently match or exceed income; review discretionary line items to restore positive cashflow margin.`;
  }

  res.json({
    insight: fallbackInsight,
    provider: 'heuristic'
  });
});

// 5. AI Strategic Feedback & Projection Analysis (Powered by Ollama)
router.post('/projection-analysis', async (req, res) => {
  const { currentNetWorth, monthlyIncome, monthlyExpenses, monthlyContribution, projectedValue } = req.body || {};

  // 1. Attempt Ollama first for Strategic Feedback
  try {
    const ollamaRes = await generateStrategicFeedback({
      currentNetWorth,
      monthlyIncome,
      monthlyExpenses,
      monthlyContribution,
      projectedValue
    });
    if (ollamaRes.text) {
      return res.json({
        analysis: ollamaRes.text,
        provider: 'ollama',
        model: ollamaRes.model
      });
    }
  } catch (ollamaErr) {
    // Continue to Gemini fallback
  }

  // 2. Attempt Gemini fallback
  if (process.env.API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analyze this wealth forecast projection:
      - Current Net Worth: $${currentNetWorth || 0}
      - Monthly Income: $${monthlyIncome || 0}
      - Monthly Expenses: $${monthlyExpenses || 0}
      - Monthly savings/investment contribution: $${monthlyContribution || 0}
      - Projected wealth at the end of the projection period: $${projectedValue || 0}

      Write exactly 2 sentences of professional analysis. Sentence 1: Analyze their current path and trajectory relative to fixed costs. Sentence 2: Provide a specific recommendation to accelerate reaching milestones (e.g. BTC allocation, tax-advantaged vanguard index funds, or trimming discretionary categories).`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      return res.json({
        analysis: response.text?.trim() || "Wealth trajectory is highly sustainable. Continue maximizing tax-advantaged accounts.",
        provider: 'gemini'
      });
    } catch (geminiErr) {
      console.error('Gemini Projection Analysis fallback failed:', geminiErr);
    }
  }

  // 3. Quantitative analytical heuristic feedback
  const income = Number(monthlyIncome) || 0;
  const expenses = Number(monthlyExpenses) || 0;
  const contrib = Number(monthlyContribution) || 0;
  const savingsPct = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

  const s1 = `With a ${savingsPct}% cash margin and $${contrib.toLocaleString()}/mo capital deployment, your trajectory builds substantial compounding momentum.`;
  const s2 = `To accelerate milestone completion, maintain systematic DCA into low-cost index funds and rebalance surplus returns semi-annually.`;

  res.json({
    analysis: `${s1} ${s2}`,
    provider: 'analytical'
  });
});

// 6. Bank Sync Simulation Endpoint
router.post('/bank-sync', async (req, res) => {
  const { institution, lastSynced } = req.body || {};
  
  // Return some realistic mock transactions using Gemini
  if (!process.env.API_KEY) {
    return res.json([
      { date: new Date().toISOString().split('T')[0], description: 'Mock transaction', amount: 45.00, type: 'expense', category: 'Shopping', institution }
    ]);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Generate an array of 3 realistic transactional items in JSON format that a user might spend on at ${institution}. 
    Categories must be selected from: Food, Transport, Housing, Entertainment, Utilities, Health, Shopping, Education, Personal, Other.
    Return only valid JSON in this schema:
    [
      { "date": "YYYY-MM-DD", "description": "merchant name", "amount": 12.34, "type": "expense", "category": "Food", "institution": "${institution}" }
    ]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsed = JSON.parse(response.text || '[]');
    res.json(parsed);
  } catch (error) {
    res.json([]);
  }
});

// 7. Investment Sync Simulation Endpoint
router.post('/investment-sync', async (req, res) => {
  const { provider } = req.body || {};

  try {
    // Return sample holdings
    if (provider === 'Binance') {
      res.json([
        { symbol: 'BTC', quantity: 0.12, purchasePrice: 62500.00 },
        { symbol: 'ETH', quantity: 1.5, purchasePrice: 2450.00 },
        { symbol: 'SOL', quantity: 12.0, purchasePrice: 110.00 }
      ]);
    } else {
      res.json([
        { symbol: 'VOO', quantity: 45.0, purchasePrice: 480.00 },
        { symbol: 'VOOG', quantity: 15.0, purchasePrice: 280.00 }
      ]);
    }
  } catch (error) {
    res.json([]);
  }
});

export default router;
