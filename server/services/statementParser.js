import crypto from 'crypto';

const DATE_HEADERS = ['date','transaction date','posted date','posting date','value date'];
const DESCRIPTION_HEADERS = ['description','details','narration','merchant','payee','memo','transaction description','particulars'];
const AMOUNT_HEADERS = ['amount','transaction amount','value'];
const DEBIT_HEADERS = ['debit','withdrawal','withdrawals','money out','paid out'];
const CREDIT_HEADERS = ['credit','deposit','deposits','money in','paid in'];
const TYPE_HEADERS = ['type','transaction type','dr/cr','debit/credit'];

const cleanHeader = value => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
const cleanText = value => String(value || '').replace(/\s+/g,' ').trim();

function indexFor(headers, candidates) {
  return headers.findIndex(header => candidates.includes(cleanHeader(header)));
}

export function parseMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  const normalized = raw
    .replace(/[()]/g,'')
    .replace(/\b(?:XCD|USD|ECD)\b/gi,'')
    .replace(/(?:EC\$|US\$|\$)/g,'')
    .replace(/,/g,'')
    .replace(/\s+/g,'')
    .replace(/^\+/,'');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

export function normalizeStatementDate(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const [,year,month,day] = match;
    return validDate(Number(year),Number(month),Number(day));
  }

  match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (match) {
    const first=Number(match[1]), second=Number(match[2]);
    const year=Number(match[3].length===2 ? `20${match[3]}` : match[3]);
    if (first > 12 && second <= 12) return validDate(year,second,first);
    if (second > 12 && first <= 12) return validDate(year,first,second);
    return null; // ambiguous numeric date: fail closed rather than silently swap day/month
  }

  if (/[A-Za-z]/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return validDate(parsed.getUTCFullYear(),parsed.getUTCMonth()+1,parsed.getUTCDate());
    }
  }
  return null;
}

function validDate(year,month,day) {
  const date = new Date(Date.UTC(year,month-1,day));
  if (date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day) return null;
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function parseCsvRows(text) {
  const rows=[];
  let row=[],field='',quoted=false;
  const source=String(text || '').replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++) {
    const ch=source[i];
    if(ch==='"') {
      if(quoted && source[i+1]==='"') { field+='"'; i++; }
      else quoted=!quoted;
    } else if(ch===',' && !quoted) {
      row.push(field);field='';
    } else if((ch==='\n' || ch==='\r') && !quoted) {
      if(ch==='\r' && source[i+1]==='\n') i++;
      row.push(field);field='';
      if(row.some(value=>String(value).trim())) rows.push(row);
      row=[];
    } else field+=ch;
  }
  row.push(field);
  if(row.some(value=>String(value).trim())) rows.push(row);
  return rows;
}

function classifyType({amount,debit,credit,typeText}) {
  const normalized=cleanHeader(typeText);
  if (/\b(?:debit|dr|withdrawal|payment|purchase|expense)\b/.test(normalized)) return 'expense';
  if (/\b(?:credit|cr|deposit|income|salary|refund)\b/.test(normalized)) return 'income';
  if (debit != null && Math.abs(debit) > 0) return 'expense';
  if (credit != null && Math.abs(credit) > 0) return 'income';
  if (amount != null && amount < 0) return 'expense';
  // A positive amount without an explicit credit/debit marker is ambiguous
  // across bank exports, so fail closed instead of guessing income/outflow.
  return null;
}

function transactionFingerprint(tx) {
  return crypto.createHash('sha256')
    .update([tx.date,tx.type,Number(tx.amount).toFixed(2),cleanText(tx.description).toLowerCase()].join('|'))
    .digest('hex');
}

export function parseCsvStatement(text,{sourceName='CSV statement'}={}) {
  const rows=parseCsvRows(text);
  if(rows.length<2) return {transactions:[],warnings:['The CSV did not contain a header and transaction rows.']};
  const headers=rows[0].map(cleanHeader);
  const dateIndex=indexFor(headers,DATE_HEADERS);
  const descriptionIndex=indexFor(headers,DESCRIPTION_HEADERS);
  const amountIndex=indexFor(headers,AMOUNT_HEADERS);
  const debitIndex=indexFor(headers,DEBIT_HEADERS);
  const creditIndex=indexFor(headers,CREDIT_HEADERS);
  const typeIndex=indexFor(headers,TYPE_HEADERS);

  if(dateIndex<0 || descriptionIndex<0 || (amountIndex<0 && debitIndex<0 && creditIndex<0)) {
    return {transactions:[],warnings:['CSV headers were not recognized. Expected date, description and amount or debit/credit columns.']};
  }

  const transactions=[],warnings=[],seen=new Set();
  let ambiguousDates=0,invalidAmounts=0;
  for(const row of rows.slice(1,501)) {
    const date=normalizeStatementDate(row[dateIndex]);
    if(!date) { ambiguousDates++; continue; }
    const description=cleanText(row[descriptionIndex]) || 'Imported transaction';
    const amountValue=amountIndex>=0 ? parseMoney(row[amountIndex]) : null;
    const debit=debitIndex>=0 ? parseMoney(row[debitIndex]) : null;
    const credit=creditIndex>=0 ? parseMoney(row[creditIndex]) : null;
    const type=classifyType({amount:amountValue,debit,credit,typeText:typeIndex>=0?row[typeIndex]:''});
    const amount = debit != null && Math.abs(debit)>0
      ? Math.abs(debit)
      : credit != null && Math.abs(credit)>0
        ? Math.abs(credit)
        : amountValue == null ? null : Math.abs(amountValue);
    if(!type || amount==null || !Number.isFinite(amount) || amount<=0 || amount>1e12) { invalidAmounts++; continue; }
    const tx={
      updateType:'transaction',
      transaction:{
        amount:Number(amount.toFixed(2)),
        category:type==='income'?'Income':'Other',
        description,
        type,
        date,
        notes:`Imported for review from ${sourceName}`,
      }
    };
    const fingerprint=transactionFingerprint(tx.transaction);
    if(seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    transactions.push({...tx,importFingerprint:fingerprint});
  }
  if(ambiguousDates) warnings.push(`${ambiguousDates} row(s) were skipped because the date was invalid or ambiguous (for example 03/04/2026).`);
  if(invalidAmounts) warnings.push(`${invalidAmounts} row(s) were skipped because the amount/type could not be determined safely.`);
  if(rows.length>501) warnings.push('Only the first 500 statement rows were considered.');
  return {transactions,warnings};
}

export function parseStatementText(text,{sourceName='PDF statement'}={}) {
  const lines=String(text || '').split(/\r?\n/).map(cleanText).filter(Boolean);
  const transactions=[],warnings=[],seen=new Set();
  const datePattern='(?:\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4})';
  const lineRe=new RegExp(`^(${datePattern})\\s+(.+?)\\s+([()\\-+]?(?:EC\\$|US\\$|\\$)?\\s*[\\d,]+\\.\\d{2})\\s*(CR|DR|CREDIT|DEBIT)?$`,'i');
  for(const line of lines.slice(0,3000)) {
    const match=line.match(lineRe);
    if(!match) continue;
    const date=normalizeStatementDate(match[1]);
    const signed=parseMoney(match[3]);
    const marker=String(match[4] || '');
    if(!date || signed==null || signed===0) continue;
    const type=classifyType({amount:signed,debit:null,credit:null,typeText:marker});
    if(!type) continue;
    const tx={
      updateType:'transaction',
      transaction:{
        amount:Number(Math.abs(signed).toFixed(2)),
        category:type==='income'?'Income':'Other',
        description:cleanText(match[2]),
        type,
        date,
        notes:`Imported for review from ${sourceName}`,
      }
    };
    const fingerprint=transactionFingerprint(tx.transaction);
    if(seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    transactions.push({...tx,importFingerprint:fingerprint});
  }
  if(!transactions.length) warnings.push('No transaction rows could be parsed deterministically from the extracted PDF text.');
  return {transactions,warnings};
}

export function normalizeAiStatementRows(rows,{sourceName='PDF statement'}={}) {
  const transactions=[],warnings=[],seen=new Set();
  let rejected=0;
  for(const row of Array.isArray(rows)?rows.slice(0,200):[]) {
    const date=normalizeStatementDate(row?.date);
    const amount=parseMoney(row?.amount);
    const type=String(row?.type || '').toLowerCase();
    const description=cleanText(row?.description);
    if(!date || amount==null || amount<=0 || !['expense','income'].includes(type) || !description) { rejected++; continue; }
    const tx={
      updateType:'transaction',
      transaction:{
        amount:Number(Math.abs(amount).toFixed(2)),
        category:type==='income'?'Income':'Other',
        description:description.slice(0,300),
        type,
        date,
        vendor:cleanText(row?.vendor).slice(0,200) || undefined,
        notes:`AI-assisted statement extraction from ${sourceName}; verify before approval.`,
      }
    };
    const fingerprint=transactionFingerprint(tx.transaction);
    if(seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    transactions.push({...tx,importFingerprint:fingerprint});
  }
  if(rejected) warnings.push(`${rejected} AI row(s) were rejected by deterministic validation.`);
  return {transactions,warnings};
}
