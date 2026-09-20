import React, { useState } from 'react';
import {
  Wrench,
  Package,
  Layers,
  Calendar,
  Sparkles,
  Info,
  DollarSign,
  HelpCircle,
  Plus,
  Check,
  X,
  Repeat,
  Ship,
  ArrowLeftRight,
  RefreshCw
} from 'lucide-react';
import {
  CostItemClassification,
  StartupCostItem,
  ImportDutyCalculation,
  ImportDutyCategory,
  CurrencyCode
} from '../../types';
import { ImportLandedCostCalculator } from './ImportLandedCostCalculator';
import {
  DEFAULT_USD_TO_XCD_RATE,
  convertCurrency,
  getCurrencySymbol,
  formatCurrencyAmount
} from '../../services/currencyService';

interface SharedCostItemFormProps {
  initialItem?: Partial<StartupCostItem>;
  availableEquipmentList?: StartupCostItem[];
  defaultCurrency?: CurrencyCode;
  exchangeRate?: number;
  onSave: (item: StartupCostItem) => void;
  onCancel: () => void;
}

export const SharedCostItemForm: React.FC<SharedCostItemFormProps> = ({
  initialItem,
  availableEquipmentList = [],
  defaultCurrency = 'USD',
  exchangeRate = DEFAULT_USD_TO_XCD_RATE,
  onSave,
  onCancel
}) => {
  const [classification, setClassification] = useState<CostItemClassification>(
    initialItem?.classification || 'equipment'
  );
  const [name, setName] = useState(initialItem?.name || '');
  const [category, setCategory] = useState(initialItem?.category || '');
  const [notes, setNotes] = useState(initialItem?.notes || '');
  
  // Cost Item Currency (USD vs XCD)
  const [currency, setCurrency] = useState<CurrencyCode>(
    initialItem?.currency || defaultCurrency || 'USD'
  );

  // Import Duties & Landed Shipping State
  const [importDetails, setImportDetails] = useState<ImportDutyCalculation | undefined>(
    initialItem?.importDetails
  );
  const [showImportCalculator, setShowImportCalculator] = useState<boolean>(
    !!initialItem?.importDetails?.isImported
  );

  // Equipment fields
  const [purchaseCost, setPurchaseCost] = useState(initialItem?.purchaseCost?.toString() || initialItem?.amount?.toString() || '1500');
  const [residualValue, setResidualValue] = useState(initialItem?.residualValue?.toString() || '0');
  const [usefulLifeYears, setUsefulLifeYears] = useState(initialItem?.usefulLifeYears?.toString() || '5');
  const [purchaseMonth, setPurchaseMonth] = useState(initialItem?.purchaseMonth?.toString() || '1');

  // Decision 2: Equipment Rental Revenue
  const [isRentalRevenueGenerator, setIsRentalRevenueGenerator] = useState(!!initialItem?.isRentalRevenueGenerator);
  const [rentalUnitsOwned, setRentalUnitsOwned] = useState(initialItem?.rentalUnitsOwned?.toString() || '1');
  const [rentalTimeUnit, setRentalTimeUnit] = useState<'days' | 'hours'>(initialItem?.rentalTimeUnit || 'days');
  const [rentalAvailableTimePerUnit, setRentalAvailableTimePerUnit] = useState(
    initialItem?.rentalAvailableTimePerUnit?.toString() || (initialItem?.rentalTimeUnit === 'hours' ? '160' : '25')
  );
  const [rentalUtilisationPercent, setRentalUtilisationPercent] = useState(
    initialItem?.rentalUtilisationPercent?.toString() || '60'
  );
  const [rentalRatePerUnit, setRentalRatePerUnit] = useState(initialItem?.rentalRatePerUnit?.toString() || '150');

  // Stock / Raw Materials fields
  const [stockQuantity, setStockQuantity] = useState(
    initialItem?.stockQuantity?.toString() || initialItem?.initialStockUnits?.toString() || '100'
  );
  const [stockUnitCost, setStockUnitCost] = useState(initialItem?.stockUnitCost?.toString() || '10');
  const [stockReorderPoint, setStockReorderPoint] = useState(initialItem?.stockReorderPoint?.toString() || '20');
  const [unitsConsumedPerProduct, setUnitsConsumedPerProduct] = useState(
    initialItem?.unitsConsumedPerProduct?.toString() || '1'
  );

  // Direct Cost per Sale / Service
  const [directCostPerUnitOrJob, setDirectCostPerUnitOrJob] = useState(
    initialItem?.directCostPerUnitOrJob?.toString() || initialItem?.unitCost?.toString() || '15'
  );

  // Recurring Operating Expense fields
  const [monthlyExpenseAmount, setMonthlyExpenseAmount] = useState(
    initialItem?.monthlyExpenseAmount?.toString() || initialItem?.amount?.toString() || '300'
  );
  const [isMaintenanceForEquipmentId, setIsMaintenanceForEquipmentId] = useState(
    initialItem?.isMaintenanceForEquipmentId || ''
  );

  // One-Time Setup Expense fields
  const [setupExpenseAmount, setSetupExpenseAmount] = useState(
    initialItem?.setupExpenseAmount?.toString() || initialItem?.amount?.toString() || '500'
  );
  const [setupMonth, setSetupMonth] = useState(initialItem?.setupMonth?.toString() || '1');

  // Helper function to convert all entered monetary numbers when user switches currencies
  const handleCurrencySwitchAndConvert = (targetCurrency: CurrencyCode) => {
    if (targetCurrency === currency) return;
    const fromCur = currency;
    const toCur = targetCurrency;

    const convertNum = (strVal: string): string => {
      const num = parseFloat(strVal);
      if (isNaN(num) || num === 0) return strVal;
      const converted = convertCurrency(num, fromCur, toCur, exchangeRate);
      return (Math.round(converted * 100) / 100).toString();
    };

    setPurchaseCost(convertNum(purchaseCost));
    setResidualValue(convertNum(residualValue));
    setRentalRatePerUnit(convertNum(rentalRatePerUnit));
    setStockUnitCost(convertNum(stockUnitCost));
    setDirectCostPerUnitOrJob(convertNum(directCostPerUnitOrJob));
    setMonthlyExpenseAmount(convertNum(monthlyExpenseAmount));
    setSetupExpenseAmount(convertNum(setupExpenseAmount));

    setCurrency(targetCurrency);
  };

  // Live conversion helper for an individual input field
  const renderConversionHint = (valStr: string) => {
    const num = parseFloat(valStr);
    if (isNaN(num) || num <= 0) return null;

    const otherCurrency: CurrencyCode = currency === 'USD' ? 'XCD' : 'USD';
    const convertedAmount = convertCurrency(num, currency, otherCurrency, exchangeRate);
    const otherSymbol = getCurrencySymbol(otherCurrency);

    return (
      <div className="flex items-center gap-1.5 text-[10.5px] text-stone-500 font-mono mt-1">
        <span>≈</span>
        <span className="font-semibold text-stone-700">
          {otherSymbol} {convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-stone-400 text-[9.5px]">
          ({currency === 'USD' ? `x${exchangeRate} EC$` : `÷${exchangeRate} US$`})
        </span>
      </div>
    );
  };

  // Calculated live previews
  const pCostNum = Math.max(0, parseFloat(purchaseCost) || 0);
  const resValNum = Math.max(0, parseFloat(residualValue) || 0);
  const usefulLifeNum = Math.max(1, parseFloat(usefulLifeYears) || 1);
  const annualDeprec = Math.max(0, pCostNum - resValNum) / usefulLifeNum;
  const monthlyDeprec = annualDeprec / 12;

  // Rental revenue live preview
  const rUnits = Math.max(1, parseFloat(rentalUnitsOwned) || 1);
  const rTime = Math.max(1, parseFloat(rentalAvailableTimePerUnit) || 1);
  const rUtil = Math.max(0, Math.min(100, parseFloat(rentalUtilisationPercent) || 0)) / 100;
  const rRate = Math.max(0, parseFloat(rentalRatePerUnit) || 0);
  const previewRentalDaysOrHours = Math.round(rUnits * rTime * rUtil);
  const previewMonthlyRentalRev = Math.round(previewRentalDaysOrHours * rRate);

  const currentSymbol = getCurrencySymbol(currency);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const saved: StartupCostItem = {
      id: initialItem?.id || `cost-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: name.trim(),
      classification,
      currency,
      category: category.trim() || undefined,
      notes: notes.trim() || undefined,
      importDetails: importDetails
    };

    if (classification === 'equipment') {
      saved.purchaseCost = pCostNum;
      saved.residualValue = resValNum;
      saved.usefulLifeYears = usefulLifeNum;
      saved.purchaseMonth = Math.min(12, Math.max(1, parseInt(purchaseMonth) || 1));
      saved.amount = pCostNum;

      if (isRentalRevenueGenerator) {
        saved.isRentalRevenueGenerator = true;
        saved.rentalUnitsOwned = rUnits;
        saved.rentalTimeUnit = rentalTimeUnit;
        saved.rentalAvailableTimePerUnit = rTime;
        saved.rentalUtilisationPercent = parseFloat(rentalUtilisationPercent) || 60;
        saved.rentalRatePerUnit = rRate;
      }
    } else if (classification === 'stock') {
      const qty = Math.max(0, parseFloat(stockQuantity) || 0);
      const uCost = Math.max(0, parseFloat(stockUnitCost) || 0);
      saved.stockQuantity = qty;
      saved.initialStockUnits = qty;
      saved.stockUnitCost = uCost;
      saved.stockReorderPoint = parseFloat(stockReorderPoint) || 0;
      saved.unitsConsumedPerProduct = parseFloat(unitsConsumedPerProduct) || 1;
      saved.amount = Math.round(qty * uCost * 100) / 100;
      saved.unitCost = uCost;
    } else if (classification === 'direct') {
      const perJob = Math.max(0, parseFloat(directCostPerUnitOrJob) || 0);
      saved.directCostPerUnitOrJob = perJob;
      saved.unitCost = perJob;
      saved.amount = perJob;
    } else if (classification === 'operating') {
      const mAmount = Math.max(0, parseFloat(monthlyExpenseAmount) || 0);
      saved.monthlyExpenseAmount = mAmount;
      saved.amount = mAmount;
      saved.isRecurring = true;
      if (isMaintenanceForEquipmentId) {
        saved.isMaintenanceForEquipmentId = isMaintenanceForEquipmentId;
      }
    } else if (classification === 'setup') {
      const sAmount = Math.max(0, parseFloat(setupExpenseAmount) || 0);
      saved.setupExpenseAmount = sAmount;
      saved.amount = sAmount;
      saved.setupMonth = Math.min(12, Math.max(1, parseInt(setupMonth) || 1));
    }

    onSave(saved);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-md space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70">
            Universal Cost Architecture
          </span>
          <h3 className="text-sm font-bold text-stone-900 mt-1">
            {initialItem?.id ? 'Edit Financial Line Item' : 'Add Financial Line Item'}
          </h3>
        </div>

        {/* Currency Selector & Quick-Convert Bar */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-stone-50 border border-stone-200 p-1.5 rounded-xl">
          <span className="text-[10px] font-bold text-stone-500 uppercase px-1">Cost Currency:</span>
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-stone-200 shadow-2xs">
            <button
              type="button"
              onClick={() => handleCurrencySwitchAndConvert('USD')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                currency === 'USD'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              US$ (USD)
            </button>
            <button
              type="button"
              onClick={() => handleCurrencySwitchAndConvert('XCD')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                currency === 'XCD'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              EC$ (XCD)
            </button>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-lg transition-colors ml-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: What kind of cost is this? */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
            <span>1. What kind of cost or asset is this?</span>
            <span className="text-rose-500 font-bold">*</span>
          </label>
          <p className="text-[11px] text-stone-500">
            Select the classification. The system automatically applies the correct Cash Flow, Inventory, and P&L depreciation accounting.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {/* 1. Reusable Equipment */}
            <button
              type="button"
              onClick={() => setClassification('equipment')}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                classification === 'equipment'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-2xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${classification === 'equipment' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  <Wrench size={14} />
                </div>
                <div className="text-xs font-bold text-stone-900">Reusable Equipment</div>
              </div>
              <p className="text-[10.5px] text-stone-500 mt-2">
                Ovens, machinery, vehicles, computers. Depreciated over years; cash hits in purchase month.
              </p>
            </button>

            {/* 2. Stock / Raw Materials */}
            <button
              type="button"
              onClick={() => setClassification('stock')}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                classification === 'stock'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-2xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${classification === 'stock' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  <Package size={14} />
                </div>
                <div className="text-xs font-bold text-stone-900">Stock / Raw Materials</div>
              </div>
              <p className="text-[10.5px] text-stone-500 mt-2">
                Ingredients, retail merchandise, parts. Cash hits on restock; recognized as COGS upon sale.
              </p>
            </button>

            {/* 3. Cost per Sale / Service */}
            <button
              type="button"
              onClick={() => setClassification('direct')}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                classification === 'direct'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-2xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${classification === 'direct' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  <Layers size={14} />
                </div>
                <div className="text-xs font-bold text-stone-900">Cost per Sale / Service</div>
              </div>
              <p className="text-[10.5px] text-stone-500 mt-2">
                Packaging per order, client travel, freelance task fee. Direct variable cost per job.
              </p>
            </button>

            {/* 4. Recurring Operating Expense */}
            <button
              type="button"
              onClick={() => setClassification('operating')}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                classification === 'operating'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-2xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${classification === 'operating' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  <Repeat size={14} />
                </div>
                <div className="text-xs font-bold text-stone-900">Recurring Operating Expense</div>
              </div>
              <p className="text-[10.5px] text-stone-500 mt-2">
                Premises rent, staff salaries, software subscriptions, utilities, equipment maintenance.
              </p>
            </button>

            {/* 5. One-Time Setup Expense */}
            <button
              type="button"
              onClick={() => setClassification('setup')}
              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                classification === 'setup'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-2xs'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${classification === 'setup' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  <Calendar size={14} />
                </div>
                <div className="text-xs font-bold text-stone-900">One-Time Setup Expense</div>
              </div>
              <p className="text-[10.5px] text-stone-500 mt-2">
                Business registration, security deposits, signage, initial website launch, renovations.
              </p>
            </button>
          </div>
        </div>

        {/* Step 2: Item Name & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-800">
              Item Name / Description <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={
                classification === 'equipment' ? 'e.g., Heavy Duty Spiral Mixer' :
                classification === 'stock' ? 'e.g., Organic Whole Wheat Flour (25kg sacks)' :
                classification === 'direct' ? 'e.g., Eco Kraft Packaging Box per Order' :
                classification === 'operating' ? 'e.g., Commercial Facility Lease' :
                'e.g., Commercial Business Registration & Licensing'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-stone-200 rounded-xl focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-800">
              Category / Department
            </label>
            <input
              type="text"
              placeholder="e.g., Production, Kitchen, Fleet, Facility, Marketing"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-stone-200 rounded-xl focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Step 3: Classification-Specific Fields (Strict Progressive Disclosure) */}
        
        {/* === 1. REUSABLE EQUIPMENT FIELDS === */}
        {classification === 'equipment' && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4.5 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Wrench size={14} className="text-emerald-600" />
                <span>Capital Equipment & Depreciation Specs</span>
              </span>
              <span className="text-[10px] text-stone-500 font-mono">Straight-Line Standard</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Purchase Cost ({currentSymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-xs font-semibold text-stone-500">{currentSymbol}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    className="w-full pl-10 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                {renderConversionHint(purchaseCost)}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Useful Life (Years)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={usefulLifeYears}
                  onChange={(e) => setUsefulLifeYears(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Residual / Salvage Value ({currentSymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-xs font-semibold text-stone-500">{currentSymbol}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={residualValue}
                    onChange={(e) => setResidualValue(e.target.value)}
                    className="w-full pl-10 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                {renderConversionHint(residualValue)}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Purchase Month (Year 1)
                </label>
                <select
                  value={purchaseMonth}
                  onChange={(e) => setPurchaseMonth(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Month {i + 1} ({['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live Depreciation Badge */}
            <div className="bg-white border border-stone-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-stone-600 font-medium">
                P&L Depreciation Schedule ({currency}):
              </span>
              <div className="flex items-center gap-3 font-mono">
                <span className="font-semibold text-stone-800">
                  Annual: <strong>{currentSymbol} {annualDeprec.toFixed(2)}/yr</strong>
                </span>
                <span className="text-stone-300">|</span>
                <span className="font-semibold text-emerald-800">
                  Monthly: <strong>{currentSymbol} {monthlyDeprec.toFixed(2)}/mo</strong>
                </span>
              </div>
            </div>

            {/* Import & Customs Duties Provision */}
            <div className="border border-stone-200 rounded-xl bg-white p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                    <Ship size={14} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900">
                      Import Shipping &amp; Customs Duties (Saint Lucia ASYCUDA Tariffs)
                    </span>
                    <p className="text-[10.5px] text-stone-500">
                      Compute freight, insurance, CSC (6%), HCSL (2.5%), ENV, and VAT (12.5%) for electronics, machinery, computers, or general items.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportCalculator(!showImportCalculator)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer self-start sm:self-auto"
                >
                  {showImportCalculator ? 'Hide Calculator' : (importDetails?.isImported ? 'Edit Landed Calculation' : '+ Calculate Landed Cost')}
                </button>
              </div>

              {importDetails?.isImported && !showImportCalculator && (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                  <span className="font-semibold flex items-center gap-1">
                    <Check size={13} className="text-emerald-700" /> Landed Cost Active ({importDetails.category?.toUpperCase()}):
                  </span>
                  <div className="flex items-center gap-3 font-medium">
                    <span>FOB: <strong>${importDetails.fobCost?.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Taxes &amp; Levies: <strong>${importDetails.totalDutiesAndTaxes?.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Total Landed: <strong className="text-emerald-800">${importDetails.totalLandedCost?.toLocaleString()}</strong></span>
                  </div>
                </div>
              )}

              {showImportCalculator && (
                <div className="pt-2">
                  <ImportLandedCostCalculator
                    initialUnitsCount={isRentalRevenueGenerator ? rUnits : 1}
                    initialFobUnitCost={pCostNum / (isRentalRevenueGenerator ? rUnits : 1)}
                    initialCategory={importDetails?.category || 'electronics'}
                    initialImportDetails={importDetails}
                    isCompact
                    onApplyLandedCost={(res) => {
                      setImportDetails(res.importDetails);
                      setPurchaseCost(res.totalLandedCost.toString());
                      setShowImportCalculator(false);
                    }}
                    onClose={() => setShowImportCalculator(false)}
                  />
                </div>
              )}
            </div>

            {/* Decision 2: Direct Rental Revenue Toggle */}
            <div className="border-t border-stone-200/80 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-stone-900 flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isRentalRevenueGenerator}
                      onChange={(e) => setIsRentalRevenueGenerator(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Generates direct rental revenue?</span>
                  </label>
                  <p className="text-[11px] text-stone-500 ml-6 mt-0.5">
                    Enable if this equipment is rented directly to clients (e.g. tool hire, event sound gear, vehicle lease).
                  </p>
                </div>
                {isRentalRevenueGenerator && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Rental Asset Active
                  </span>
                )}
              </div>

              {isRentalRevenueGenerator && (
                <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-stone-700">
                        Units Available / Owned
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={rentalUnitsOwned}
                        onChange={(e) => setRentalUnitsOwned(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-stone-700">
                        Billing Time Unit
                      </label>
                      <select
                        value={rentalTimeUnit}
                        onChange={(e) => setRentalTimeUnit(e.target.value as 'days' | 'hours')}
                        className="w-full px-2.5 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                      >
                        <option value="days">Per Day (e.g. 30 days/mo)</option>
                        <option value="hours">Per Hour (e.g. 160 hrs/mo)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-stone-700">
                        Expected Utilisation %
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={rentalUtilisationPercent}
                          onChange={(e) => setRentalUtilisationPercent(e.target.value)}
                          className="w-full px-3 pr-7 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                        />
                        <span className="absolute right-2.5 top-1.5 text-xs text-stone-400">%</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-stone-700">
                        Rental Rate per {rentalTimeUnit === 'hours' ? 'Hour' : 'Day'} ({currentSymbol})
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-xs font-semibold text-stone-500">{currentSymbol}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={rentalRatePerUnit}
                          onChange={(e) => setRentalRatePerUnit(e.target.value)}
                          className="w-full pl-10 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg font-mono focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                        />
                      </div>
                      {renderConversionHint(rentalRatePerUnit)}
                    </div>
                  </div>

                  <div className="bg-white border border-emerald-200/80 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <span className="text-stone-600 font-medium">
                      Projected Rental Capacity & Output ({currency}):
                    </span>
                    <span className="font-bold text-emerald-800 font-mono">
                      ~{previewRentalDaysOrHours} {rentalTimeUnit}/mo → <strong>{currentSymbol} {previewMonthlyRentalRev.toLocaleString()}/mo Revenue</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === 2. STOCK / RAW MATERIALS FIELDS === */}
        {classification === 'stock' && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4.5 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Package size={14} className="text-emerald-600" />
                <span>Inventory & Restocking Parameters</span>
              </span>
              <span className="text-[10px] text-stone-500 font-mono">Carries Inventory Month-to-Month</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Initial Order Quantity (Units)
                </label>
                <input
                  type="number"
                  min="1"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Unit Cost from Supplier ({currentSymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-xs font-semibold text-stone-500">{currentSymbol}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={stockUnitCost}
                    onChange={(e) => setStockUnitCost(e.target.value)}
                    className="w-full pl-10 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                {renderConversionHint(stockUnitCost)}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Reorder Safety Threshold (Units)
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockReorderPoint}
                  onChange={(e) => setStockReorderPoint(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Units Needed per Sale
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={unitsConsumedPerProduct}
                  onChange={(e) => setUnitsConsumedPerProduct(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>
            </div>

            <div className="bg-white border border-stone-200 rounded-lg p-3 flex items-center justify-between text-xs">
              <span className="text-stone-600">Initial Stock Outlay ({currency} Month 1 Cash Outflow):</span>
              <span className="font-bold text-emerald-800 font-mono">
                {currentSymbol} {((parseFloat(stockQuantity) || 0) * (parseFloat(stockUnitCost) || 0)).toFixed(2)}
              </span>
            </div>

            {/* Import & Customs Duties Provision for Inventory/Stock */}
            <div className="border border-stone-200 rounded-xl bg-white p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                    <Ship size={14} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900">
                      Import Freight &amp; Customs Duties (Raw Materials / Stock Landed Cost)
                    </span>
                    <p className="text-[10.5px] text-stone-500">
                      Compute CIF, import duties, CSC, HCSL, and VAT to determine the exact unit landed cost of inventory.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportCalculator(!showImportCalculator)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer self-start sm:self-auto"
                >
                  {showImportCalculator ? 'Hide Calculator' : (importDetails?.isImported ? 'Edit Landed Calculation' : '+ Calculate Landed Unit Cost')}
                </button>
              </div>

              {importDetails?.isImported && !showImportCalculator && (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                  <span className="font-semibold flex items-center gap-1">
                    <Check size={13} className="text-emerald-700" /> Landed Unit Cost Active ({importDetails.category?.toUpperCase()}):
                  </span>
                  <div className="flex items-center gap-3 font-medium">
                    <span>Batch Total: <strong>${importDetails.totalLandedCost?.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Unit Landed: <strong className="text-emerald-800">${importDetails.costPerUnitLanded?.toLocaleString()} / unit</strong></span>
                  </div>
                </div>
              )}

              {showImportCalculator && (
                <div className="pt-2">
                  <ImportLandedCostCalculator
                    initialUnitsCount={parseFloat(stockQuantity) || 100}
                    initialFobUnitCost={parseFloat(stockUnitCost) || 10}
                    initialCategory={importDetails?.category || 'raw_materials_food'}
                    initialImportDetails={importDetails}
                    isCompact
                    onApplyLandedCost={(res) => {
                      setImportDetails(res.importDetails);
                      setStockUnitCost(res.costPerUnitLanded.toString());
                      setShowImportCalculator(false);
                    }}
                    onClose={() => setShowImportCalculator(false)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* === 3. DIRECT COST PER SALE / SERVICE FIELDS === */}
        {classification === 'direct' && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4.5 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Layers size={14} className="text-emerald-600" />
                <span>Direct Variable Cost per Sale or Job</span>
              </span>
              <span className="text-[10px] text-stone-500 font-mono">Recognized at Time of Sale</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Direct Cost Amount per Unit / Job ({currentSymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2.5 text-xs font-semibold text-stone-500">{currentSymbol}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={directCostPerUnitOrJob}
                    onChange={(e) => setDirectCostPerUnitOrJob(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                {renderConversionHint(directCostPerUnitOrJob)}
              </div>

              <div className="flex items-center text-xs text-stone-500 pt-5">
                This variable cost automatically scales with monthly sales volume or billable service volume.
              </div>
            </div>
          </div>
        )}

        {/* === 4. RECURRING OPERATING EXPENSE FIELDS === */}
        {classification === 'operating' && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4.5 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Repeat size={14} className="text-emerald-600" />
                <span>Recurring Monthly Overhead</span>
              </span>
              <span className="text-[10px] text-stone-500 font-mono">Billed Every Month</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Monthly Expense Amount ({currentSymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2.5 text-xs font-semibold text-stone-500">{currentSymbol}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={monthlyExpenseAmount}
                    onChange={(e) => setMonthlyExpenseAmount(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                {renderConversionHint(monthlyExpenseAmount)}
              </div>

              {availableEquipmentList.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-700">
                    Tag to Equipment Item (Optional Maintenance)
                  </label>
                  <select
                    value={isMaintenanceForEquipmentId}
                    onChange={(e) => setIsMaintenanceForEquipmentId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  >
                    <option value="">-- General Company Overhead --</option>
                    {availableEquipmentList.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        Maintenance for: {eq.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === 5. ONE-TIME SETUP EXPENSE FIELDS === */}
        {classification === 'setup' && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4.5 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Calendar size={14} className="text-emerald-600" />
                <span>One-Time Pre-Launch Outlay</span>
              </span>
              <span className="text-[10px] text-stone-500 font-mono">Billed Once in Target Month</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Total Setup Amount ({currentSymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2.5 text-xs font-semibold text-stone-500">{currentSymbol}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={setupExpenseAmount}
                    onChange={(e) => setSetupExpenseAmount(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                {renderConversionHint(setupExpenseAmount)}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Incurred in Month (Year 1)
                </label>
                <select
                  value={setupMonth}
                  onChange={(e) => setSetupMonth(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-200 bg-white rounded-lg focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Month {i + 1} ({['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Notes (Optional) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-800">
            Internal Notes or Supplier Reference (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g., Supplier quote attached, includes 1-year warranty, delivery ETA 2 weeks"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3.5 py-1.5 text-xs border border-stone-200 rounded-xl focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-150">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <Check size={14} />
            <span>{initialItem?.id ? 'Save Line Item Changes' : 'Add to Financial Engine'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
