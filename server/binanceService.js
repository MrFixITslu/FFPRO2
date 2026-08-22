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

async function signedRequest(path, apiKey, apiSecret) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=${RECV_WINDOW}`;
  const signature = sign(queryString, apiSecret);
  const url = `${BASE_URL}${path}?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'GET',
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
 * Fetches the user's actual spot account balances from Binance and returns
 * them as holdings (symbol + quantity). Only non-zero balances are returned.
 *
 * Note on purchasePrice: Binance's account endpoint reports current balances
 * only, not historical cost basis. Computing a true average cost would
 * require pulling the full trade history per asset (a much larger call
 * volume against a rate-limited API). Here purchasePrice is set to the
 * current spot price at sync time, i.e. this treats "now" as the cost basis
 * baseline. Unrealized gain/loss will read as $0 immediately after a sync
 * and will only reflect gains from that point forward. Users who know their
 * real cost basis can edit it manually after the sync.
 */
export async function fetchBinanceHoldings(apiKey, apiSecret) {
  const account = await signedRequest('/api/v3/account', apiKey, apiSecret);
  const balances = (account?.balances || [])
    .map(b => ({ symbol: b.asset, quantity: parseFloat(b.free) + parseFloat(b.locked) }))
    .filter(b => Number.isFinite(b.quantity) && b.quantity > 0);

  if (balances.length === 0) {
    return [];
  }

  // Stablecoins have no USD trading pair on Binance (e.g. no "USDTUSDT")
  // and are already worth ~$1, so price them at par instead of querying.
  const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI']);
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
