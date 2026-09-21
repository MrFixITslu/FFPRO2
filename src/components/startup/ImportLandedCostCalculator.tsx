import React, { useState, useEffect } from 'react';
import {
  Ship,
  FileText,
  DollarSign,
  HelpCircle,
  Sparkles,
  Check,
  RotateCcw,
  Percent,
  TrendingDown,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ImportDutyCategory, ImportDutyCalculation } from '../../types';
import { CurrencyCode, getCurrencySymbol } from '../../services/currencyService';
import {
  SAINT_LUCIA_DUTY_PRESETS,
  calculateLandedImportCost,
  roundCurrency
} from '../../services/startupFinancialsService';

interface ImportLandedCostCalculatorProps {
  initialUnitsCount?: number;
  initialFobUnitCost?: number;
  initialShippingTotal?: number;
  initialCategory?: ImportDutyCategory;
  initialImportDetails?: ImportDutyCalculation;
  currency?: CurrencyCode;
  title?: string;
  subtitle?: string;
  onApplyLandedCost?: (result: {
    totalLandedCost: number;
    costPerUnitLanded: number;
    importDetails: ImportDutyCalculation;
  }) => void;
  onClose?: () => void;
  isCompact?: boolean;
}

export const ImportLandedCostCalculator: React.FC<ImportLandedCostCalculatorProps> = ({
  initialUnitsCount = 1,
  initialFobUnitCost = 800,
  initialShippingTotal = 250,
  initialCategory = 'electronics',
  initialImportDetails,
  currency = 'USD',
  title = 'Saint Lucia & Caribbean Landed Cost & Customs Duty Calculator',
  subtitle = 'Calculate shipping freight, CARICOM / Saint Lucia import tariffs, levies, and port clearance costs',
  onApplyLandedCost,
  onClose,
  isCompact = false
}) => {
  const sym = getCurrencySymbol((currency as CurrencyCode) || 'XCD');
  const [invoiceCurrency, setInvoiceCurrency] = useState<CurrencyCode>(
    initialImportDetails?.invoiceCurrency || 'USD'
  );
  const invSym = getCurrencySymbol(invoiceCurrency);

  const [category, setCategory] = useState<ImportDutyCategory>(
    initialImportDetails?.category || initialCategory || 'electronics'
  );
  const [quoteEntryMode, setQuoteEntryMode] = useState<'per_unit' | 'package_total'>(
    initialImportDetails?.quoteEntryMode || 'per_unit'
  );
  const [unitsCount, setUnitsCount] = useState<string>(
    (initialImportDetails?.unitsCount ?? initialUnitsCount)?.toString() || '1'
  );
  const storedExchangeRate = initialImportDetails?.exchangeRate || 2.70;
  const initialInvoiceFob = invoiceCurrency === 'USD'
    ? (initialImportDetails?.fobCostUSD ?? ((initialImportDetails?.fobCost ?? 0) / storedExchangeRate))
    : (initialImportDetails?.fobCost ?? 0);
  const [unitFobCost, setUnitFobCost] = useState<string>(
    initialInvoiceFob > 0
      ? (initialInvoiceFob / Math.max(1, initialImportDetails?.unitsCount ?? initialUnitsCount ?? 1)).toString()
      : initialFobUnitCost?.toString() || '500'
  );
  const [packageFobCost, setPackageFobCost] = useState<string>(
    initialInvoiceFob > 0
      ? initialInvoiceFob.toString()
      : roundCurrency((initialFobUnitCost || 0) * Math.max(1, initialUnitsCount || 1)).toString()
  );
  const [shippingFreight, setShippingFreight] = useState<string>(
    invoiceCurrency === 'USD'
      ? (
          initialImportDetails?.shippingFreightUSD?.toString() ||
          (initialImportDetails?.shippingFreight
            ? roundCurrency(initialImportDetails.shippingFreight / storedExchangeRate).toString()
            : initialShippingTotal?.toString() || '250')
        )
      : (initialImportDetails?.shippingFreight?.toString() || initialShippingTotal?.toString() || '250')
  );
  const [insuranceCost, setInsuranceCost] = useState<string>(
    invoiceCurrency === 'USD'
      ? (
          initialImportDetails?.insuranceCostUSD?.toString() ||
          (initialImportDetails?.insuranceCost
            ? roundCurrency(initialImportDetails.insuranceCost / storedExchangeRate).toString()
            : '')
        )
      : (initialImportDetails?.insuranceCost?.toString() || '')
  );
  const [portBrokerageFee, setPortBrokerageFee] = useState<string>(
    initialImportDetails?.portAndBrokerageFee?.toString() || '324' // Default EC$ 324 (~US$ 120)
  );

  // Custom rate overrides if category === 'custom' or user wants manual adjustments
  const [isCustomMode, setIsCustomMode] = useState<boolean>(
    category === 'custom'
  );
  const [customDuty, setCustomDuty] = useState<string>(
    initialImportDetails?.dutyRatePercent?.toString() || '20'
  );
  const [customCsc, setCustomCsc] = useState<string>(
    initialImportDetails?.cscRatePercent?.toString() || '6'
  );
  const [customHcsl, setCustomHcsl] = useState<string>(
    initialImportDetails?.hcslRatePercent?.toString() || '2.5'
  );
  const [customEnv, setCustomEnv] = useState<string>(
    initialImportDetails?.envRatePercent?.toString() || '1.5'
  );
  const [customVat, setCustomVat] = useState<string>(
    initialImportDetails?.vatRatePercent?.toString() || '12.5'
  );

  const [showFormulaDetails, setShowFormulaDetails] = useState<boolean>(false);

  const unitsNum = Math.max(1, parseFloat(unitsCount) || 1);
  const unitFobNum = Math.max(0, parseFloat(unitFobCost) || 0);
  const packageFobNum = Math.max(0, parseFloat(packageFobCost) || 0);
  const totalFobCost = quoteEntryMode === 'package_total'
    ? roundCurrency(packageFobNum)
    : roundCurrency(unitFobNum * unitsNum);
  const shippingNum = Math.max(0, parseFloat(shippingFreight) || 0);
  const insuranceNum = insuranceCost !== '' ? Math.max(0, parseFloat(insuranceCost) || 0) : undefined;
  const portFeeNum = Math.max(0, parseFloat(portBrokerageFee) || 0);

  const currentPreset = SAINT_LUCIA_DUTY_PRESETS[category] || SAINT_LUCIA_DUTY_PRESETS.electronics;

  const handleInvoiceCurrencyChange = (nextCurrency: CurrencyCode) => {
    if (nextCurrency === invoiceCurrency) return;
    const factor = nextCurrency === 'XCD' ? 2.70 : (1 / 2.70);
    const convertInput = (value: string) => {
      if (value.trim() === '') return '';
      return roundCurrency((parseFloat(value) || 0) * factor).toString();
    };

    setUnitFobCost((value) => convertInput(value));
    setPackageFobCost((value) => convertInput(value));
    setShippingFreight((value) => convertInput(value));
    setInsuranceCost((value) => convertInput(value));
    setInvoiceCurrency(nextCurrency);
  };

  const calculationResult = calculateLandedImportCost({
    fobCost: totalFobCost,
    shippingFreight: shippingNum,
    insuranceCost: insuranceNum,
    category,
    country: 'saint_lucia',
    invoiceCurrency,
    exchangeRate: 2.70,
    customDutyRate: isCustomMode ? parseFloat(customDuty) || 0 : undefined,
    customCscRate: isCustomMode ? parseFloat(customCsc) || 0 : undefined,
    customHcslRate: isCustomMode ? parseFloat(customHcsl) || 0 : undefined,
    customEnvRate: isCustomMode ? parseFloat(customEnv) || 0 : undefined,
    customVatRate: isCustomMode ? parseFloat(customVat) || 0 : undefined,
    portAndBrokerageFee: portFeeNum,
    unitsCount: unitsNum,
    quoteEntryMode
  });

  const effectiveTaxOnCif = calculationResult.cifValue > 0
    ? ((calculationResult.totalDutiesAndTaxes / calculationResult.cifValue) * 100).toFixed(2)
    : '0';

  const landedMultiplierOnFob = totalFobCost > 0
    ? ((calculationResult.totalLandedCost / (invoiceCurrency === 'USD' ? totalFobCost * 2.70 : totalFobCost)) * 100 - 100).toFixed(1)
    : '0';

  const handleCategoryChange = (newCat: ImportDutyCategory) => {
    setCategory(newCat);
    if (newCat === 'custom') {
      setIsCustomMode(true);
    } else {
      setIsCustomMode(false);
      const p = SAINT_LUCIA_DUTY_PRESETS[newCat];
      if (p) {
        setCustomDuty(p.dutyRatePercent.toString());
        setCustomCsc(p.cscRatePercent.toString());
        setCustomHcsl(p.hcslRatePercent.toString());
        setCustomEnv(p.envRatePercent.toString());
        setCustomVat(p.vatRatePercent.toString());
      }
    }
  };

  const handleApply = () => {
    if (onApplyLandedCost) {
      onApplyLandedCost({
        totalLandedCost: calculationResult.totalLandedCost,
        costPerUnitLanded: calculationResult.costPerUnitLanded,
        importDetails: calculationResult
      });
    }
  };

  return (
    <div className={`bg-stone-50/90 border border-stone-200 rounded-2xl ${isCompact ? 'p-3.5' : 'p-5'} space-y-4 shadow-2xs`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/80 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-700 text-white shadow-2xs">
              <Ship size={15} />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-stone-900">{title}</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Saint Lucia (ASYCUDA)
            </span>
          </div>
          <p className="text-[11px] text-stone-500 ml-8">{subtitle}</p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 text-xs px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors self-start sm:self-auto cursor-pointer"
          >
            Close
          </button>
        )}
      </div>

      {/* Invoice Currency Selection & Customs Valuation Notice */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
            <span>Supplier Quote / Invoice Currency</span>
          </label>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {invoiceCurrency === 'USD' 
              ? 'Overseas supplier invoice (USD). ASYCUDA Customs converts to EC$ at statutory 1 USD = 2.70 XCD to evaluate duties.'
              : 'Regional or local invoice quoted directly in Eastern Caribbean Dollars (EC$).'
            }
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200 shrink-0">
          <button
            type="button"
            onClick={() => handleInvoiceCurrencyChange('USD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              invoiceCurrency === 'USD'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            US$ (USD) Invoice
          </button>
          <button
            type="button"
            onClick={() => handleInvoiceCurrencyChange('XCD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              invoiceCurrency === 'XCD'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            EC$ (XCD) Invoice
          </button>
        </div>
      </div>

      {/* Supplier Quote Entry Mode */}
      <div className="bg-white border border-stone-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <label className="text-xs font-bold text-stone-800">Supplier Quote Entry</label>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Use <strong>Whole Package</strong> when the supplier quotes one complete system/bundle; use <strong>Per Unit</strong> for identical separately priced items.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-xl border border-stone-200 shrink-0">
          <button
            type="button"
            onClick={() => setQuoteEntryMode('package_total')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              quoteEntryMode === 'package_total'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white'
            }`}
          >
            Whole Package
          </button>
          <button
            type="button"
            onClick={() => setQuoteEntryMode('per_unit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              quoteEntryMode === 'per_unit'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white'
            }`}
          >
            Per Unit
          </button>
        </div>
      </div>

      {/* Commodity Category Profile Selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-stone-800 flex items-center justify-between">
          <span>Import Commodity & Tariff Profile</span>
          <span className="text-[10px] font-normal text-emerald-700 font-mono">
            Estimated duties + levies + VAT: ~{isCustomMode ? 'Custom' : `${currentPreset.effectiveRatePercent}%`} on CIF
          </span>
        </label>
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value as ImportDutyCategory)}
          className="w-full px-3 py-2 text-xs border border-stone-200 bg-white rounded-xl font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
        >
          {Object.entries(SAINT_LUCIA_DUTY_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label}
            </option>
          ))}
        </select>
        <p className="text-[10.5px] text-stone-500 italic">
          {currentPreset.description}
        </p>
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          Planning estimate only. Final duty, levy, VAT and concession treatment depends on Customs classification, documentary evidence and any approved concessions.
        </p>
      </div>

      {/* Primary Input Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 border border-stone-200 rounded-xl">
        <div className="space-y-1">
          <label className="text-[10.5px] font-bold text-stone-700">
            Quantity (Units)
          </label>
          <input
            type="number"
            min="1"
            value={unitsCount}
            onChange={(e) => setUnitsCount(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50/50 focus:bg-white focus:border-emerald-600"
            placeholder="1"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10.5px] font-bold text-stone-700">
            {quoteEntryMode === 'package_total' ? `Package FOB Total (${invSym})` : `FOB Unit Price (${invSym})`}
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">{invSym}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={quoteEntryMode === 'package_total' ? packageFobCost : unitFobCost}
              onChange={(e) => quoteEntryMode === 'package_total'
                ? setPackageFobCost(e.target.value)
                : setUnitFobCost(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50/50 focus:bg-white focus:border-emerald-600"
              placeholder={quoteEntryMode === 'package_total' ? '15000' : '500'}
            />
          </div>
          <div className="text-[9.5px] text-stone-400">
            {quoteEntryMode === 'package_total' ? 'Complete supplier package before freight' : `Total FOB: ${invSym}${totalFobCost.toLocaleString()}`}
            {invoiceCurrency === 'USD' && (
              <span className="text-stone-500 font-mono"> (≈ EC$ {(totalFobCost * 2.70).toLocaleString()})</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10.5px] font-bold text-stone-700">
            Freight / Shipping ({invSym})
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">{invSym}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={shippingFreight}
              onChange={(e) => setShippingFreight(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50/50 focus:bg-white focus:border-emerald-600"
              placeholder="250"
            />
          </div>
          <div className="text-[9.5px] text-stone-400">
            {invoiceCurrency === 'USD' ? 'Air/Ocean (≈ EC$ ' + (shippingNum * 2.70).toLocaleString() + ')' : 'Air/Ocean Cargo'}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10.5px] font-bold text-stone-700">
            Port & Brokerage (EC$)
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">EC$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={portBrokerageFee}
              onChange={(e) => setPortBrokerageFee(e.target.value)}
              className="w-full pl-9 pr-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50/50 focus:bg-white focus:border-emerald-600"
              placeholder="324"
            />
          </div>
          <div className="text-[9.5px] text-stone-400">Local SLU clearance entry</div>
        </div>
      </div>

      {/* Custom Tariff Rate Fine-Tuning Drawer */}
      <div className="border border-stone-200 rounded-xl bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setIsCustomMode(!isCustomMode);
            if (!isCustomMode) setCategory('custom');
          }}
          className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-stone-800 hover:bg-stone-50 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Percent size={13} className="text-emerald-700" />
            <span>Tariff Rate Breakdown & Overrides ({isCustomMode ? 'Custom Overrides Active' : 'Standard St. Lucia Rates'})</span>
          </span>
          <span className="text-[11px] text-emerald-700 flex items-center gap-1 font-normal">
            {isCustomMode ? 'Active' : 'Customize Rates'}
            {isCustomMode ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </button>

        {isCustomMode && (
          <div className="p-3.5 border-t border-stone-100 bg-stone-50/50 grid grid-cols-2 sm:grid-cols-5 gap-2.5 animate-in fade-in duration-150">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-stone-600">Import Duty %</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={customDuty}
                  onChange={(e) => setCustomDuty(e.target.value)}
                  className="w-full px-2 pr-6 py-1 text-xs border border-stone-200 rounded-md bg-white"
                />
                <span className="absolute right-2 top-1 text-[10px] text-stone-400">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-stone-600">CSC (Service) %</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={customCsc}
                  onChange={(e) => setCustomCsc(e.target.value)}
                  className="w-full px-2 pr-6 py-1 text-xs border border-stone-200 rounded-md bg-white"
                />
                <span className="absolute right-2 top-1 text-[10px] text-stone-400">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-stone-600">HCSL (Security) %</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={customHcsl}
                  onChange={(e) => setCustomHcsl(e.target.value)}
                  className="w-full px-2 pr-6 py-1 text-xs border border-stone-200 rounded-md bg-white"
                />
                <span className="absolute right-2 top-1 text-[10px] text-stone-400">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-stone-600">ENV (Eco Levy) %</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={customEnv}
                  onChange={(e) => setCustomEnv(e.target.value)}
                  className="w-full px-2 pr-6 py-1 text-xs border border-stone-200 rounded-md bg-white"
                />
                <span className="absolute right-2 top-1 text-[10px] text-stone-400">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-stone-600">VAT Rate %</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={customVat}
                  onChange={(e) => setCustomVat(e.target.value)}
                  className="w-full px-2 pr-6 py-1 text-xs border border-stone-200 rounded-md bg-white"
                />
                <span className="absolute right-2 top-1 text-[10px] text-stone-400">%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Landed Cost Breakdown Waterfall Card */}
      <div className="bg-emerald-950 text-white rounded-xl p-4 space-y-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-800/70 pb-2.5">
          <div>
            <div className="text-[11px] font-mono text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
              <span>Estimated Landed Cost Output (Saint Lucia ASYCUDA basis)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-800/80 text-emerald-200">XCD / EC$</span>
            </div>
            <div className="text-xl font-extrabold text-white mt-0.5 flex flex-wrap items-baseline gap-2">
              <span>EC$ {calculationResult.totalLandedCostXCD?.toLocaleString()}</span>
              <span className="text-xs font-normal text-emerald-300">
                (≈ US$ {calculationResult.totalLandedCostUSD?.toLocaleString()})
              </span>
              <span className="text-xs font-normal text-emerald-200/80">
                • {unitsNum} unit{unitsNum > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-[10.5px] text-emerald-300">Unit Landed Cost:</div>
            <div className="text-sm font-bold text-emerald-100 flex items-center sm:justify-end gap-1.5">
              <span>EC$ {calculationResult.costPerUnitLandedXCD?.toLocaleString()} / unit</span>
              <span className="text-xs font-normal text-emerald-300 font-mono">(≈ US$ {calculationResult.costPerUnitLandedUSD?.toLocaleString()})</span>
            </div>
            <div className="text-[9.5px] text-emerald-400 font-mono">
              (+{landedMultiplierOnFob}% over base FOB)
            </div>
          </div>
        </div>

        {/* Detailed Waterfall Table */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">1. Base Invoice (FOB)</div>
            <div className="text-xs font-bold text-white mt-0.5">
              {invoiceCurrency === 'USD' ? `US$ ${calculationResult.fobCostUSD?.toLocaleString()}` : `EC$ ${calculationResult.fobCost.toLocaleString()}`}
            </div>
            <div className="text-[9px] text-emerald-400">
              {invoiceCurrency === 'USD' 
                ? `≈ EC$ ${calculationResult.fobCost.toLocaleString()} (at 2.70)` 
                : (quoteEntryMode === 'package_total'
                  ? 'Whole package invoice'
                  : `${unitsNum} × EC$ ${unitFobNum.toLocaleString()}`)
              }
            </div>
          </div>

          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">2. Statutory CIF (EC$)</div>
            <div className="text-xs font-bold text-white mt-0.5">EC$ {calculationResult.cifValue.toLocaleString()}</div>
            <div className="text-[9px] text-emerald-400">
              +EC$ {calculationResult.shippingFreight.toLocaleString()} freight, EC$ {calculationResult.insuranceCost.toLocaleString()} ins.
            </div>
          </div>

          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">3. Customs Duties & Levies</div>
            <div className="text-xs font-bold text-amber-300 mt-0.5">
              EC$ {calculationResult.totalDutiesAndTaxes.toLocaleString()}
            </div>
            <div className="text-[9px] text-emerald-300">
              {effectiveTaxOnCif}% effective tax on CIF
            </div>
          </div>

          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">4. Port & Brokerage</div>
            <div className="text-xs font-bold text-white mt-0.5">EC$ {calculationResult.portAndBrokerageFee.toLocaleString()}</div>
            <div className="text-[9px] text-emerald-400">Local port clearance entry</div>
          </div>
        </div>

        {/* Toggleable line-item breakdown */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowFormulaDetails(!showFormulaDetails)}
            className="text-[10.5px] text-emerald-300 hover:text-white flex items-center gap-1 font-mono cursor-pointer"
          >
            <Info size={11} />
            <span>{showFormulaDetails ? 'Hide' : 'View'} statutory tax line items (ASYCUDA formula in EC$)</span>
          </button>

          {showFormulaDetails && (
            <div className="mt-2 p-2.5 rounded-lg bg-emerald-900/90 text-[10.5px] font-mono space-y-1 text-emerald-100 animate-in fade-in">
              <div className="flex justify-between">
                <span>• Import Duty ({calculationResult.dutyRatePercent}% on EC$ CIF):</span>
                <span>EC$ {calculationResult.dutyAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Customs Service Charge (CSC {calculationResult.cscRatePercent}% on CIF):</span>
                <span>EC$ {calculationResult.cscAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Health & Citizen Security Levy (HCSL {calculationResult.hcslRatePercent}% on CIF):</span>
                <span>EC$ {calculationResult.hcslAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Environmental Levy (ENV {calculationResult.envRatePercent}% on CIF):</span>
                <span>EC$ {calculationResult.envAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-300 font-semibold border-t border-emerald-800 pt-0.5">
                <span>• Landed Subtotal before VAT:</span>
                <span>EC$ {calculationResult.landedBeforeVat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• VAT ({calculationResult.vatRatePercent}% on Landed Subtotal):</span>
                <span>EC$ {calculationResult.vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-amber-300 font-bold border-t border-emerald-800 pt-0.5">
                <span>Total Statutory Taxes & Duties:</span>
                <span>EC$ {calculationResult.totalDutiesAndTaxes.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      {onApplyLandedCost && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Check size={14} />
            <span>
              Apply Landed Cost (EC$ {calculationResult.totalLandedCostXCD?.toLocaleString()} / US$ {calculationResult.totalLandedCostUSD?.toLocaleString()}) to Asset Plan
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
