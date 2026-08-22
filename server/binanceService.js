import crypto from 'crypto';

// Binance requires every SIGNED (account-level) endpoint to be called with a
// query string containing `timestamp` (and optionally `recvWindow`), plus a
// `signature` parameter equal to HMAC-SHA256(queryString, apiSecret) in hex,
// and the API key sent as the `X-MBX-APIKEY` header (never as a query param).
// Docs: https://binance-docs.github.io/apidocs/spot/en/#signed-trade-user_data-and-margin-endpoints-security

const BASE_URL = 'https://api.binance.com';
const RECV_WINDOW = 5000;

function sign(queryString, apiSecret) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

async function signedRequest(path, apiKey, apiSecret, { method = 'GET' } = {}) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=${RECV_WINDOW}`;
  const signature = sign(queryString, apiSecret);
  const url = `${BASE_URL}${path}?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey },
    signal: AbortSignal.timeout(8000),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // Binance error payloads look like { code: -2015, msg: "Invalid API-key..." }
    const msg = body?.msg || `Binance API request failed (HTTP ${res.status}).`;
    const err = new Error(msg);
    err.binanceCode = body?.code;
    err.status = res.status;
    throw err;
  }

  return body;
}

/**
 * Verifies a Binance API key/secret pair actually works, by making one real
 * signed call. Throws with a human-readable message if the credentials are
 * invalid, IP-restricted, or missing the required permission.
 */
export async function verifyBinanceCredentials(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) {
    throw new Error('API key and secret are both required.');
  }
  await signedRequest('/api/v3/account', apiKey, apiSecret);
  return true;
}

/**
 * Fetches the user's actual holdings from Binance and returns them as
 * holdings (symbol + quantity). Only non-zero balances are returned.
 *
 * Binance splits a user's crypto across several separate "wallets", and the
 * account most people actually keep money in isn't Spot:
 *   - Spot wallet          (/api/v3/account)              — free trading balance
 *   - Funding wallet       (/sapi/v1/asset/get-funding-asset) — P2P/card/gift-card proceeds
 *   - Simple Earn Flexible (/sapi/v1/simple-earn/flexible/position) — "Earn" savings
 *   - Simple Earn Locked   (/sapi/v1/simple-earn/locked/position)  — fixed-term "Earn"
 * A user whose funds are entirely in Earn (very common — Binance actively
 * pushes people there for yield) would show a real, successfully-verified
 * API connection but zero results if only Spot were queried. All four are
 * queried and summed per asset here so the total actually matches what the
 * user sees in the Binance app.
 *
 * Note on purchasePrice: none of these endpoints report historical cost
 * basis. Computing a true average cost would require pulling full trade
 * history per asset (a much larger, heavily rate-limited call volume).
 * purchasePrice is set to the current spot price at sync time instead, i.e.
 * this treats "now" as the cost basis baseline — unrealized gain/loss reads
 * $0 immediately after a sync and only reflects gains from that point
 * forward. Users who know their real cost basis can edit it manually.
 */
export async function fetchBinanceHoldings(apiKey, apiSecret) {
  const totals = new Map(); // symbol -> quantity

  const addAmount = (symbol, amount) => {
    if (!symbol || !Number.isFinite(amount) || amount <= 0) return;
    totals.set(symbol, (totals.get(symbol) || 0) + amount);
  };

  const errors = [];

  // 1. Spot wallet
  try {
    const account = await signedRequest('/api/v3/account', apiKey, apiSecret);
    for (const b of account?.balances || []) {
      addAmount(b.asset, parseFloat(b.free) + parseFloat(b.locked));
    }
  } catch (err) {
    errors.push(`Spot: ${err.message}`);
  }

  // 2. Funding wallet (P2P / Binance Pay / Card / Gift Card proceeds)
  try {
    const funding = await signedRequest('/sapi/v1/asset/get-funding-asset', apiKey, apiSecret, { method: 'POST' });
    for (const b of funding || []) {
      addAmount(b.asset, parseFloat(b.free) + parseFloat(b.locked) + parseFloat(b.freeze));
    }
  } catch (err) {
    // Not every account has Funding wallet activity — don't fail the whole
    // sync over it, just note it in case every source ends up empty.
    errors.push(`Funding: ${err.message}`);
  }

  // 3. Simple Earn — Flexible positions
  try {
    const flexible = await signedRequest('/sapi/v1/simple-earn/flexible/position', apiKey, apiSecret);
    for (const row of flexible?.rows || []) {
      addAmount(row.asset, parseFloat(row.totalAmount));
    }
  } catch (err) {
    errors.push(`Simple Earn (Flexible): ${err.message}`);
  }

  // 4. Simple Earn — Locked positions
  try {
    const locked = await signedRequest('/sapi/v1/simple-earn/locked/position', apiKey, apiSecret);
    for (const row of locked?.rows || []) {
      addAmount(row.asset, parseFloat(row.amount));
    }
  } catch (err) {
    errors.push(`Simple Earn (Locked): ${err.message}`);
  }

  const balances = Array.from(totals.entries()).map(([symbol, quantity]) => ({ symbol, quantity }));

  if (balances.length === 0) {
    // If literally every source failed (as opposed to succeeding-but-empty),
    // surface that clearly instead of silently returning an empty portfolio
    // that looks identical to "you really do have $0 on Binance."
    if (errors.length === 4) {
      throw new Error(`Could not read any Binance wallet: ${errors.join('; ')}`);
    }
    return [];
  }

  // Stablecoins have no USD trading pair on Binance (e.g. no "USDTUSDT")
  // and are already worth ~$1, so price them at par instead of querying.
  const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI', 'LDUSDT', 'LDUSDC']);
  const prices = {};

  await Promise.all(balances.map(async (b) => {
    if (STABLECOINS.has(b.symbol)) {
      prices[b.symbol] = 1;
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/api/v3/ticker/price?symbol=${b.symbol}USDT`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const price = parseFloat(data?.price);
        if (Number.isFinite(price)) prices[b.symbol] = price;
      }
    } catch {
      // No USDT pair, or a transient network blip — leave unpriced; the
      // holding still gets recorded, just with a $0 baseline price below.
    }
  }));

  return balances.map(b => ({
    symbol: b.symbol,
    quantity: b.quantity,
    purchasePrice: prices[b.symbol] ?? 0,
  }));
}
