import React, { useMemo, useRef, useState } from 'react';
import { CATEGORIES, CurrencyCode, Transaction, TransactionType } from '../types';
import { formatCurrencyAmount } from '../services/currencyService';

interface ImportedCandidate {
  date: string;
  amount: number;
  description: string;
  type: TransactionType;
  category: string;
  vendor?: string;
  notes?: string;
  confidence?: number | null;
}

interface ImportResponse {
  ok: boolean;
  source: { fileName: string; mimeType: string; retained: boolean };
  method: 'deterministic' | 'ai-assisted';
  warnings: string[];
  transactions: ImportedCandidate[];
}

interface Props {
  existingTransactions: Transaction[];
  displayCurrency: CurrencyCode;
  onImport: (items: Omit<Transaction, 'id'>[]) => void;
  onClose: () => void;
}

const duplicateKey = (item: Pick<Transaction, 'date' | 'amount' | 'description' | 'type'>) => [
  item.date,
  Number(item.amount).toFixed(2),
  item.type,
  String(item.description || '').toLowerCase().replace(/\s+/g, ' ').trim(),
].join('|');

const TransactionImportPanel: React.FC<Props> = ({ existingTransactions, displayCurrency, onImport, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [rows, setRows] = useState<ImportedCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const existingKeys = useMemo(() => new Set(existingTransactions.map(duplicateKey)), [existingTransactions]);
  const duplicateRows = useMemo(() => new Set(rows.map((row, index) => existingKeys.has(duplicateKey(row)) ? index : -1).filter(index => index >= 0)), [rows, existingKeys]);

  const chooseFile = (next: File | null) => {
    setFile(next);
    setResult(null);
    setRows([]);
    setSelected(new Set());
    setError('');
  };

  const extract = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/ai/import-transactions', {
        method: 'POST',
        body,
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The file could not be imported.');
      const parsed = payload as ImportResponse;
      const candidates = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      setResult(parsed);
      setRows(candidates);
      const nextSelected = new Set<number>();
      candidates.forEach((candidate, index) => {
        if (!existingKeys.has(duplicateKey(candidate))) nextSelected.add(index);
      });
      setSelected(nextSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be imported.');
    } finally {
      setBusy(false);
    }
  };

  const updateRow = <K extends keyof ImportedCandidate>(index: number, field: K, value: ImportedCandidate[K]) => {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const toggle = (index: number) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const approve = () => {
    const approved = rows
      .filter((_, index) => selected.has(index))
      .map(row => ({
        date: row.date,
        amount: Number(row.amount),
        description: row.description.trim(),
        type: row.type,
        category: row.type === 'transfer' ? 'Transfer' : row.category,
        vendor: row.vendor?.trim() || undefined,
        notes: row.notes?.trim() || undefined,
        institution: 'Cash in Hand',
      }))
      .filter(row => Number.isFinite(row.amount) && row.amount > 0 && row.description && /^\d{4}-\d{2}-\d{2}$/.test(row.date));

    if (!approved.length) {
      setError('Select at least one valid transaction to import.');
      return;
    }
    onImport(approved);
  };

  return (
    <div className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Review-first import</div>
          <h3 className="mt-1 text-base font-black text-stone-900">Receipt or statement import</h3>
          <p className="mt-1 text-[11px] leading-5 text-stone-500">
            CSV is parsed deterministically. Text-based PDFs are extracted without storage. Receipt images and difficult PDFs may use AI, but nothing is posted until you approve the rows below.
          </p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 w-8 h-8 rounded-full border border-stone-200 bg-white text-stone-500 hover:text-stone-900">×</button>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          onChange={event => chooseFile(event.target.files?.[0] || null)}
          className="hidden"
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-3 rounded-xl bg-stone-900 text-white text-xs font-black"
          >
            Choose CSV, PDF or receipt image
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-stone-700 truncate">{file?.name || 'No file selected'}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Maximum 10 MiB. Source documents are not retained by this import workflow.</div>
          </div>
          <button
            type="button"
            onClick={() => void extract()}
            disabled={!file || busy}
            className="px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-600 text-white text-xs font-black disabled:opacity-40"
          >
            {busy ? 'Extracting…' : 'Extract for review'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 font-bold text-stone-600">{rows.length} candidate{rows.length === 1 ? '' : 's'}</span>
            <span className={`rounded-full border px-2.5 py-1 font-bold ${result.method === 'ai-assisted' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {result.method === 'ai-assisted' ? 'AI-assisted extraction' : 'Deterministic extraction'}
            </span>
            {duplicateRows.size > 0 && <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-bold text-rose-700">{duplicateRows.size} possible duplicate{duplicateRows.size === 1 ? '' : 's'}</span>}
          </div>

          {result.warnings?.map((warning, index) => (
            <div key={index} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">{warning}</div>
          ))}

          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr className="text-[9px] uppercase tracking-wider text-stone-400">
                  <th className="p-3">Use</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((row, index) => {
                  const duplicate = existingKeys.has(duplicateKey(row));
                  return (
                    <tr key={index} className={duplicate ? 'bg-rose-50/40' : ''}>
                      <td className="p-3 align-top">
                        <input type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)} aria-label={`Import row ${index + 1}`} />
                      </td>
                      <td className="p-3 align-top">
                        <input type="date" value={row.date} onChange={event => updateRow(index, 'date', event.target.value)} className="w-36 rounded-lg border border-stone-200 px-2 py-1.5 text-xs" />
                      </td>
                      <td className="p-3 align-top">
                        <input value={row.description} onChange={event => updateRow(index, 'description', event.target.value)} className="w-64 rounded-lg border border-stone-200 px-2 py-1.5 text-xs" />
                        {row.vendor && <div className="mt-1 text-[9px] text-stone-400">Vendor: {row.vendor}</div>}
                      </td>
                      <td className="p-3 align-top">
                        <select value={row.type} onChange={event => updateRow(index, 'type', event.target.value as TransactionType)} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs">
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="transfer">Transfer</option>
                          <option value="savings">Savings</option>
                          <option value="withdrawal">Withdrawal</option>
                        </select>
                      </td>
                      <td className="p-3 align-top">
                        <select value={row.category} onChange={event => updateRow(index, 'category', event.target.value)} className="w-36 rounded-lg border border-stone-200 px-2 py-1.5 text-xs">
                          {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </td>
                      <td className="p-3 align-top text-right">
                        <input type="number" step="0.01" min="0.01" value={row.amount} onChange={event => updateRow(index, 'amount', Number(event.target.value))} className="w-28 rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-right" />
                        <div className="mt-1 text-[9px] text-stone-400">{formatCurrencyAmount(row.amount, displayCurrency, { decimals: 2 })}</div>
                      </td>
                      <td className="p-3 align-top">
                        {duplicate ? (
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-bold text-rose-700">Possible duplicate</span>
                        ) : row.confidence != null && row.confidence < 0.8 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-700">Verify carefully</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-700">Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[10px] leading-5 text-stone-500">
              Selected rows will be added to your ledger only after you click approve. Possible duplicates are unselected by default.
            </p>
            <button type="button" onClick={approve} className="shrink-0 px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black">
              Approve {selected.size} transaction{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionImportPanel;
