// Deterministic logic only. None of this touches Ollama — deadline status,
// currency validation, and URL validation are plain application code, per
// the requirement to keep AI scoped to genuine content interpretation.

const VALID_CURRENCY_CODES = new Set([
  'USD', 'EUR', 'GBP', 'XCD', 'CAD', 'JMD', 'TTD', 'BBD', 'BSD', 'BZD',
]);

export function normalizeCurrency(value) {
  if (!value || typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return VALID_CURRENCY_CODES.has(code) ? code : null;
}

export function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Deterministic deadline status, computed from a plain date — never
 * inferred by the model. `deadline` is a Date, ISO string, or null.
 */
export function computeDeadlineStatus(deadline) {
  if (!deadline) return 'no_deadline';
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return 'no_deadline';

  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / msPerDay);

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'closing_soon';
  return 'open';
}

/**
 * Parses a plausible deadline value from AI-extracted data into a strict
 * ISO date string, or null if it doesn't look like a real date. AI can
 * SUGGEST a string; this function is the deterministic gate that decides
 * whether it's usable.
 */
export function parseDeadlineToISO(value) {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  // Reject obviously bogus years (model hallucination guard).
  const year = d.getFullYear();
  if (year < 2020 || year > 2100) return null;
  return d.toISOString().slice(0, 10);
}

export function sortOpportunities(items, sortBy = 'deadline') {
  const list = [...items];
  switch (sortBy) {
    case 'amount_desc':
      return list.sort((a, b) => (b.amount_max || 0) - (a.amount_max || 0));
    case 'newest':
      return list.sort((a, b) => new Date(b.first_seen_at) - new Date(a.first_seen_at));
    case 'deadline':
    default:
      return list.sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
      });
  }
}
