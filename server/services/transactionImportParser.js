const DEFAULT_CATEGORY = 'Other';

const normalizeNumber = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  const cleaned = raw.replace(/[()$£€ECUSXCDUSD,\s]/gi, '').replace(/[^0-9.+-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
};

const isoDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slash) {
    let [, a, b, y] = slash;
    const year = y.length === 2 ? (Number(y) >= 70 ? `19${y}` : `20${y}`) : y;
    const first = Number(a), second = Number(b);
    // Caribbean/UK-style day-first when the first number cannot be a month.
    const dayFirst = first > 12;
    const month = dayFirst ? second : first;
    const day = dayFirst ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0,10);
  return null;
};

const cleanText = (value, max = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeImportedTransaction(input = {}) {
  let type = String(input.type || '').toLowerCase();
  const signed = normalizeNumber(input.amount);
  const debit = normalizeNumber(input.debit);
  const credit = normalizeNumber(input.credit);

  let amount = signed;
  if (amount === null && debit !== null) amount = -Math.abs(debit);
  if (amount === null && credit !== null) amount = Math.abs(credit);
  if (amount === null || amount === 0) return null;

  if (!['expense','income','transfer','savings','withdrawal'].includes(type)) {
    type = amount < 0 ? 'expense' : 'income';
  }
  const absoluteAmount = Math.abs(amount);
  const description = cleanText(input.description || input.memo || input.details || input.vendor || 'Imported transaction');
  const date = isoDate(input.date || input.transactionDate || input.postedDate);
  if (!date || !description || !Number.isFinite(absoluteAmount) || absoluteAmount <= 0) return null;

  return {
    date,
    amount: Math.round(absoluteAmount * 100) / 100,
    type,
    category: cleanText(input.category || (type === 'income' ? 'Income' : DEFAULT_CATEGORY), 80) || DEFAULT_CATEGORY,
    description,
    ...(cleanText(input.vendor, 120) ? { vendor: cleanText(input.vendor, 120) } : {}),
    ...(cleanText(input.notes, 500) ? { notes: cleanText(input.notes, 500) } : {}),
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : null,
  };
}

function splitCsvLine(line) {
  const result = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      result.push(cell.trim()); cell = '';
    } else {
      cell += ch;
    }
  }
  result.push(cell.trim());
  return result;
}

const aliases = {
  date: ['date','transaction date','posted date','posting date','txn date'],
  description: ['description','details','memo','narrative','transaction','merchant','payee'],
  amount: ['amount','transaction amount','value'],
  debit: ['debit','withdrawal','money out','outflow','charges'],
  credit: ['credit','deposit','money in','inflow'],
  type: ['type','transaction type'],
  category: ['category'],
  vendor: ['vendor','merchant','payee'],
};

const columnIndex = (headers, names) => headers.findIndex(header => names.includes(header));

export function parseCsvTransactions(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { transactions: [], warnings: ['CSV contains no transaction rows.'] };
  if (lines.length > 5001) return { transactions: [], warnings: ['CSV exceeds the 5,000-row import limit.'] };

  const headers = splitCsvLine(lines[0]).map(header => header.toLowerCase().replace(/\s+/g,' ').trim());
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key,names]) => [key,columnIndex(headers,names)]));
  if (indexes.date < 0 || indexes.description < 0 || (indexes.amount < 0 && indexes.debit < 0 && indexes.credit < 0)) {
    return { transactions: [], warnings: ['CSV must include date, description, and amount or debit/credit columns.'] };
  }

  const transactions = [];
  const warnings = [];
  lines.slice(1).forEach((line, offset) => {
    const cells = splitCsvLine(line);
    const get = key => indexes[key] >= 0 ? cells[indexes[key]] : undefined;
    const normalized = normalizeImportedTransaction({
      date: get('date'),
      description: get('description'),
      amount: get('amount'),
      debit: get('debit'),
      credit: get('credit'),
      type: get('type'),
      category: get('category'),
      vendor: get('vendor'),
      confidence: 1,
    });
    if (normalized) transactions.push(normalized);
    else if (warnings.length < 20) warnings.push(`Row ${offset + 2} could not be interpreted and was skipped.`);
  });
  return { transactions, warnings };
}

const statementLine = /^\s*(\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4})\s+(.+?)\s+([()\-+]?[A-Z$£€]*\s*[\d,]+(?:\.\d{2})?)\s*$/;

export function parseStatementTextDeterministic(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const transactions = [];
  for (const line of lines.slice(0, 10000)) {
    const match = line.match(statementLine);
    if (!match) continue;
    const normalized = normalizeImportedTransaction({
      date: match[1],
      description: match[2],
      amount: match[3],
      confidence: 0.72,
    });
    if (normalized) transactions.push(normalized);
  }
  return {
    transactions,
    warnings: transactions.length ? [] : ['No standard transaction rows were detected. Review the file manually or use a clearer statement export.'],
  };
}

export function dedupeImportedTransactions(transactions) {
  const seen = new Set();
  return transactions.filter(transaction => {
    const key = [
      transaction.date,
      Number(transaction.amount).toFixed(2),
      transaction.type,
      String(transaction.description || '').toLowerCase().replace(/\s+/g,' ').trim(),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
