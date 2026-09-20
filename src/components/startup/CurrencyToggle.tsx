import React, { useState } from 'react';
import { ArrowLeftRight, DollarSign, Info, Check, Settings2 } from 'lucide-react';
import { CurrencyCode } from '../../types';
import { DEFAULT_USD_TO_XCD_RATE, getCurrencySymbol } from '../../services/currencyService';

interface CurrencyToggleProps {
  currentCurrency: CurrencyCode;
  onChangeCurrency: (currency: CurrencyCode) => void;
  exchangeRate?: number;
  onUpdateExchangeRate?: (rate: number) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showRateBadge?: boolean;
}

export const CurrencyToggle: React.FC<CurrencyToggleProps> = ({
  currentCurrency = 'USD',
  onChangeCurrency,
  exchangeRate = DEFAULT_USD_TO_XCD_RATE,
  onUpdateExchangeRate,
  className = '',
  size = 'md',
  showRateBadge = true
}) => {
  const [showRateModal, setShowRateModal] = useState(false);
  const [tempRate, setTempRate] = useState(exchangeRate.toString());

  const isUSD = currentCurrency === 'USD';
  const isXCD = currentCurrency === 'XCD';

  const handleSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(tempRate);
    if (parsed > 0 && onUpdateExchangeRate) {
      onUpdateExchangeRate(parsed);
    }
    setShowRateModal(false);
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Currency Switcher Pill */}
      <div className="flex items-center bg-stone-100 p-0.5 sm:p-1 rounded-xl border border-stone-200 shadow-2xs">
        <button
          type="button"
          onClick={() => onChangeCurrency('USD')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            isUSD
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
          }`}
          title="Switch display to US Dollars (USD)"
        >
          <span className="text-[11px] opacity-80 font-mono">$</span>
          <span>US$ (USD)</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeCurrency('XCD')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            isXCD
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
          }`}
          title="Switch display to Eastern Caribbean Dollars (EC$ / XCD)"
        >
          <span className="text-[11px] opacity-80 font-mono">EC$</span>
          <span>EC$ (XCD)</span>
        </button>
      </div>

      {/* Exchange Rate Badge */}
      {showRateBadge && (
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-stone-50 border border-stone-200/90 rounded-lg text-[11px] text-stone-600">
          <ArrowLeftRight size={11} className="text-stone-400" />
          <span className="font-mono font-medium">1 USD = {exchangeRate.toFixed(2)} XCD</span>
          {onUpdateExchangeRate && (
            <button
              type="button"
              onClick={() => {
                setTempRate(exchangeRate.toString());
                setShowRateModal(true);
              }}
              className="ml-1 text-stone-400 hover:text-stone-700 cursor-pointer"
              title="Edit Exchange Rate"
            >
              <Settings2 size={11} />
            </button>
          )}
        </div>
      )}

      {/* Exchange Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-stone-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-blue-600" />
                <span>USD / XCD Exchange Rate</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowRateModal(false)}
                className="text-stone-400 hover:text-stone-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  1 US Dollar (USD) equals:
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-500">EC$</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.1"
                    value={tempRate}
                    onChange={(e) => setTempRate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-stone-300 rounded-xl text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5">
                  Official CARICOM pegged baseline is <strong>2.7000 XCD</strong>. (Commercial bank buy/sell is typically 2.7169).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTempRate(DEFAULT_USD_TO_XCD_RATE.toString());
                  }}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg cursor-pointer font-medium"
                >
                  Reset (2.70)
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save Rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
