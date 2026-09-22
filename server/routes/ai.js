import { Router } from '../http.js';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import { requireAuth } from '../middleware/requireAuth.js';
import rateLimit from 'express-rate-limit';
import { uploadGate } from '../middleware/uploadGate.js';
import {
  checkOllamaHealth,
  getOllamaConfig,
  updateOllamaConfig,
  generateOllama,
  generateStrategicFeedback,
  generateFinancialInsight,
  extractSupplierQuote
} from '../services/ollamaService.js';
import { parseQuoteTextDeterministic } from '../services/quoteParser.js';
import { generateProjectCardImage } from '../services/cardImageGenerator.js';
import { generateBusinessCopilotResponse } from '../services/businessCopilotService.js';

const router = Router();

const quoteUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, fieldSize: 1024, parts: 4 }
});

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

// Helper to safely get and validate Gemini API Key
function getValidGeminiKey() {
  const key = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (!key || key.length < 15 || key.startsWith('your_') || key === 'undefined' || key === 'null') {
    return null;
  }
  return key;
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

const fetchMarketData = async () => {
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

  // Sort prices in standard order: BTC, ETH, SOL, VOO, VOOG
  const order = { 'BTC': 1, 'ETH': 2, 'SOL': 3, 'VOO': 4, 'VOOG': 5 };
  prices.sort((a, b) => (order[a.symbol] || 99) - (order[b.symbol] || 99));

  // Determine if it is live
  const isLive = fetchedSymbols.size > 0;

  return { prices, quotaExhausted: fetchedSymbols.size < allSymbols.length, fetchedAt: new Date().toISOString() };
};
let marketCache=null,marketFetchedAt=0,marketPending=null;
const handleMarketData=async(_req,res)=>{
  if(!marketCache || Date.now()-marketFetchedAt>30000){
    if(!marketPending)marketPending=fetchMarketData().then(data=>{marketCache=data;marketFetchedAt=Date.now();}).finally(()=>{marketPending=null;});
    await marketPending;
  }
  res.json(marketCache);
};

// Public endpoints (no authentication required so ticker is live for anyone, but rate-limited)
router.get('/market-data', marketDataLimiter, handleMarketData);
router.post('/market-data', marketDataLimiter, handleMarketData);

router.use(requireAuth);
router.use(aiGenerationLimiter);

// Ollama Status & Config Endpoints
router.get('/ollama/status', async (req, res) => {
  const health = await checkOllamaHealth(3000);
  res.json(health);
});

router.post('/ollama/config', (_req, res) => res.status(403).json({ error: 'Ollama connection settings are managed by the server administrator.' }));

/**
 * Extract supplier quote data using local Ollama.
 * Strictly bounded: Extracts quote items, costs, and terms into Interactive Sale Price Costing format.
 * No selling price determination, no business plan writing.
 */
router.post('/ollama/extract-quote', uploadGate, quoteUpload.single('quoteFile'), async (req, res) => {
  try {
    let quoteText = '';
    let fileName = 'Quote Document';
    let mimeType = 'text/plain';

    if (req.file) {
      fileName = req.file.originalname || 'Uploaded_Quote.pdf';
      mimeType = req.file.mimetype || 'application/pdf';
      const buffer = req.file.buffer;

      if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        try {
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: buffer });
          try {
            const parsed = await parser.getText();
            quoteText = parsed?.text || '';
          } finally {
            await parser.destroy();
          }
        } catch (pdfErr) {
          console.warn('PDF text extraction error, trying stream fallback:', pdfErr.message);
          // Try naive string extraction for embedded text objects
          try {
            const rawStr = buffer.toString('latin1');
            const matches = rawStr.match(/\(([^()]+)\)[\s]*Tj/g) || rawStr.match(/\[(.*?)\][\s]*TJ/g);
            if (matches && matches.length > 0) {
              quoteText = matches.map(m => m.replace(/[\(\)\[\]TJtj]/g, '').trim()).join(' ');
            }
          } catch {
            // ignore
          }
          if (!quoteText || quoteText.trim().length < 5) {
            return res.status(422).json({
              ok: false,
              error: 'The PDF could not be read directly as text. Upload a digital text-based PDF or paste the quote details in the text tab.'
            });
          }
        }
      } else {
        quoteText = buffer.toString('utf8');
      }
    } else if (req.body?.base64Data) {
      fileName = req.body.fileName || 'Uploaded_Quote.pdf';
      mimeType = req.body.mimeType || 'application/pdf';
      const buffer = Buffer.from(req.body.base64Data, 'base64');
      if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        try {
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: buffer });
          try {
            const parsed = await parser.getText();
            quoteText = parsed?.text || '';
          } finally {
            await parser.destroy();
          }
        } catch (pdfErr) {
          console.warn('PDF text extraction error, trying stream fallback:', pdfErr.message);
          try {
            const rawStr = buffer.toString('latin1');
            const matches = rawStr.match(/\(([^()]+)\)[\s]*Tj/g) || rawStr.match(/\[(.*?)\][\s]*TJ/g);
            if (matches && matches.length > 0) {
              quoteText = matches.map(m => m.replace(/[\(\)\[\]TJtj]/g, '').trim()).join(' ');
            }
          } catch {
            // ignore
          }
          if (!quoteText || quoteText.trim().length < 5) {
            return res.status(422).json({
              ok: false,
              error: 'The PDF could not be read directly as text. Upload a digital text-based PDF or paste the quote details in the text tab.'
            });
          }
        }
      } else {
        quoteText = buffer.toString('utf8');
      }
    } else if (req.body?.quoteText) {
      quoteText = req.body.quoteText;
      fileName = req.body.fileName || 'Pasted Quote Text';
    } else {
      return res.status(400).json({ ok: false, error: 'No quote file or quote text was provided.' });
    }

    if (!quoteText || quoteText.trim().length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'Unable to extract text from the uploaded quote document. Please ensure the file contains readable text or paste the quote in the text field.'
      });
    }

    let extracted = null;
    let usedFallback = false;

    // Check Ollama health quickly (2 seconds)
    try {
      const health = await checkOllamaHealth(2000);
      if (health.online && health.connected) {
        try {
          extracted = await extractSupplierQuote({
            quoteText,
            fileName,
            model: req.body?.model
          });
        } catch (ollamaErr) {
          console.warn('Ollama quote extraction error, falling back to deterministic parser:', ollamaErr.message);
        }
      }
    } catch (healthErr) {
      console.warn('Ollama health check skipped/failed, using fallback parser:', healthErr.message);
    }

    // If Ollama extraction was unavailable, timed out, aborted, or returned no items, use deterministic parser
    if (!extracted || !Array.isArray(extracted.items) || extracted.items.length === 0) {
      extracted = parseQuoteTextDeterministic(quoteText, fileName);
      usedFallback = true;
    }

    return res.json({
      ok: true,
      extracted,
      fileName,
      usedFallback,
      textLength: quoteText.length
    });
  } catch (err) {
    console.error('Error in /ollama/extract-quote:', err);
    // Even if top-level error happens, attempt deterministic parse of whatever quoteText was received
    if (quoteText && quoteText.length > 5) {
      try {
        const fallbackExtracted = parseQuoteTextDeterministic(quoteText, fileName || 'Quote');
        return res.json({
          ok: true,
          extracted: fallbackExtracted,
          fileName,
          usedFallback: true,
          textLength: quoteText.length
        });
      } catch (fbErr) {
        console.warn('Fallback parser failed:', fbErr.message);
      }
    }
    return res.status(err.status || 502).json({
      ok: false,
      error: err.message || 'Failed to extract quote data. Please verify file format or paste quote text directly.'
    });
  }
});

// Generate Project Card Background Image via Ollama
router.post('/ollama/generate-card-image', aiGenerationLimiter, async (req, res) => {
  try {
    const { projectName, eventType, tasks, notes, style, customPrompt, model } = req.body || {};
    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const result = await generateProjectCardImage({
      projectName,
      eventType,
      tasks,
      notes,
      style,
      customPrompt,
      requestedModel: model
    });

    res.json(result);
  } catch (err) {
    console.error('Error generating card image via Ollama:', err);
    res.status(500).json({ error: err.message || 'Failed to generate card image' });
  }
});

// Alias for general card image endpoint
router.post('/generate-card-image', aiGenerationLimiter, async (req, res) => {
  try {
    const { projectName, eventType, tasks, notes, style, customPrompt, model } = req.body || {};
    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const result = await generateProjectCardImage({
      projectName,
      eventType,
      tasks,
      notes,
      style,
      customPrompt,
      requestedModel: model
    });

    res.json(result);
  } catch (err) {
    console.error('Error generating card image:', err);
    res.status(500).json({ error: err.message || 'Failed to generate card image' });
  }
});

router.use(requireAuth);
router.use(aiGenerationLimiter);

// 1. Parse receipt or financial text input
router.post('/parse', async (req, res) => {
  const { input, isMedia = false } = req.body || {};
  
  if (!input) {
    return res.status(400).json({ error: 'Input is required.' });
  }

  const geminiKey = getValidGeminiKey();
  if (!geminiKey) {
    return res.status(503).json({ error: 'Gemini AI service is not configured with a valid API key.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });

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
    console.error('Gemini AI Error:', error?.message || error);
    res.status(500).json({ error: 'Failed to process request with AI service.' });
  }
});

// FFPRO Business Copilot — read-only business-plan assistant.
// The client sends a bounded deterministic context snapshot; this endpoint never mutates plan state.
router.post('/business-copilot', async (req, res) => {
  try {
    const { message, context, history } = req.body || {};
    const response = await generateBusinessCopilotResponse({
      message,
      context,
      history
    });
    res.json(response);
  } catch (error) {
    const status = Number(error?.status || error?.statusCode) || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: error?.publicMessage || error?.message || 'Invalid request.' });
    }
    console.error('[business-copilot]', error?.message || error);
    res.status(500).json({ error: 'FFPRO Copilot could not process this request.' });
  }
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
  const geminiKey = getValidGeminiKey();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
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
      // Continue to fallback
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
  const geminiKey = getValidGeminiKey();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
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
      // Continue to heuristic fallback
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
  const geminiKey = getValidGeminiKey();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
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
      // Continue to analytical fallback
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

// No provider integration is implemented. Never fabricate financial records.
router.post('/bank-sync', (_req,res) => res.status(501).json({error:'Automatic bank sync is not available. Use manual entry or import verified records.',code:'BANK_SYNC_UNAVAILABLE'}));
router.post('/investment-sync', (_req,res) => res.status(501).json({error:'Automatic investment sync is not available. Enter verified holdings manually.',code:'BANK_SYNC_UNAVAILABLE'}));
export default router;
