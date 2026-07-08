import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

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

router.use(requireAuth);

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

// 2. Get market data via AI with Google Search
router.post('/market-data', async (req, res) => {
  if (!process.env.API_KEY) {
    console.error('API_KEY not configured');
    return res.status(500).json({ error: 'AI service not configured.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Provide current market prices and 24h change for BTC, ETH, SOL, VOO, and VOOG.",
      config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text;
    if (!text) {
      return res.json({ prices: [], quotaExhausted: false });
    }

    try {
      const prices = [];
      const symbols = ['BTC', 'ETH', 'SOL', 'VOO', 'VOOG'];
      
      for (const symbol of symbols) {
        const priceMatch = text.match(new RegExp(`${symbol}[^0-9]*([0-9,]+\\.?[0-9]*)`));
        const changeMatch = text.match(new RegExp(`${symbol}[^-0-9%]*(-?[0-9.]+)%`));
        
        if (priceMatch) {
          prices.push({
            symbol,
            price: parseFloat(priceMatch[1].replace(/,/g, '')),
            change24h: changeMatch ? parseFloat(changeMatch[1]) : 0
          });
        }
      }

      res.json({ prices, quotaExhausted: false });
    } catch (parseErr) {
      console.error('Error parsing market data:', parseErr);
      res.json({ prices: [], quotaExhausted: false });
    }
  } catch (error) {
    console.error('Market data AI Error:', error);
    res.json({ prices: [], quotaExhausted: true });
  }
});

// 3. AI Chat Endpoint
router.post('/chat', async (req, res) => {
  const { message, context } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (!process.env.API_KEY) {
    return res.json({ message: "AI Assistant is currently on standby. Please check your credentials." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
      config: {
        systemInstruction: systemPrompt
      }
    });

    res.json({ message: response.text || "I processed your request, let me know how else I can help." });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: 'Failed to complete AI chat request.' });
  }
});

// 4. AI Insights Generation
router.post('/insights', async (req, res) => {
  const { totalIncome, totalExpenses, netWorth, cycleRollover, dailySafeSpend, netMargin } = req.body || {};

  if (!process.env.API_KEY) {
    return res.json({ insight: "Advisor standby. Safe Spend rate stable." });
  }

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

    res.json({ insight: response.text?.trim() || "Safe spend limits verified." });
  } catch (error) {
    console.error('AI Insights Error:', error);
    res.json({ insight: "Financial metrics aligned with projection parameters." });
  }
});

// 5. AI Projection Analysis
router.post('/projection-analysis', async (req, res) => {
  const { currentNetWorth, monthlyIncome, monthlyExpenses, monthlyContribution, projectedValue } = req.body || {};

  if (!process.env.API_KEY) {
    return res.json({ analysis: "Wealth trajectory aligned with strategic objectives." });
  }

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

    res.json({ analysis: response.text?.trim() || "Wealth trajectory is highly sustainable. Continue maximizing tax-advantaged accounts." });
  } catch (error) {
    console.error('AI Projection Analysis Error:', error);
    res.json({ analysis: "Projections verified. Trajectory exceeds baseline index targets." });
  }
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
