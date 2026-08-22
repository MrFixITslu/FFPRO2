
import { InstitutionType } from "./types";

/**
 * Intelligent Gateway for regional institutions and investment platforms.
 * FIX: Now uses backend endpoint instead of direct API calls
 */
export const syncBankData = async (
  institution: string,
  lastSynced?: string
): Promise<any[]> => {
  if (!lastSynced) return [];

  try {
    const response = await fetch('/api/ai/bank-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ institution, lastSynced })
    });

    if (!response.ok) {
      console.error('Bank sync error:', response.statusText);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Bank API Error:", error);
    return [];
  }
};

export interface InvestmentHolding {
  symbol: string;
  quantity: number;
  purchasePrice: number;
}

/**
 * Pulls real, current holdings for a connected investment provider.
 * Binance: a real HMAC-signed call to Binance's account endpoint, via the
 * backend (the API secret never lives in the browser after the initial
 * connect — see connectInvestmentAccount).
 * Vanguard: no real brokerage API integration exists yet, so this still
 * returns backend-generated sample data via /api/ai/investment-sync.
 */
export const syncInvestmentHoldings = async (
  provider: 'Binance' | 'Vanguard'
): Promise<InvestmentHolding[]> => {
  try {
    if (provider === 'Binance') {
      const response = await fetch('/api/investments/binance/holdings', {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        console.error('Binance holdings sync error:', body?.error || response.statusText);
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }

    const response = await fetch('/api/ai/investment-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider })
    });

    if (!response.ok) {
      console.error('Investment sync error:', response.statusText);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Investment Sync Error:", error);
    return [];
  }
};

export const syncLucelecPortal = async (): Promise<{ balance: number; dueDate: string } | null> => {
  console.log("Navigating to LUCELEC portal...");
  await new Promise(r => setTimeout(r, 1000));
  const mockBalance = Math.floor(Math.random() * 150) + 85.50;
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(25);
  
  return {
    balance: mockBalance,
    dueDate: nextMonth.toISOString().split('T')[0]
  };
};

/**
 * Verifies API credentials for an investment provider by actually
 * submitting them to the backend, which makes a real signed call to the
 * provider (Binance) before ever storing anything. Only Binance is real
 * today — every other institution in the connect flow (traditional banks,
 * credit unions, Vanguard) has no live API behind it and still just
 * simulates success, matching the previous behavior.
 */
export const verifyApiConnection = async (
  credentials: { apiKey?: string; apiSecret?: string },
  institution: string
): Promise<{ ok: boolean; error?: string }> => {
  if (institution === 'Binance') {
    try {
      const response = await fetch('/api/investments/binance/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: credentials.apiKey, apiSecret: credentials.apiSecret }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return { ok: false, error: body?.error || 'Could not verify Binance credentials.' };
      }
      return { ok: true };
    } catch (error) {
      console.error('Binance credential verification error:', error);
      return { ok: false, error: 'Could not reach the server to verify your credentials.' };
    }
  }

  // Every other institution: no real API integration exists yet.
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true }), 1500);
  });
};

