import React, { useState } from 'react';
import {
  Wrench,
  Package,
  Layers,
  Repeat,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Filter,
  DollarSign,
  TrendingUp,
  Sparkles,
  Ship,
  ArrowRightLeft
} from 'lucide-react';
import { CostItemClassification, StartupCostItem } from '../../types';
import { calculateEquipmentDepreciation, calculateEquipmentRentalRevenue } from '../../services/startupFinancialsService';
import { CurrencyCode, convertCurrency, DEFAULT_EXCHANGE_RATE, getCurrencySymbol } from '../../services/currencyService';
import { CurrencyToggle } from './CurrencyToggle';

interface SharedCostItemListProps {
  items: StartupCostItem[];
  onAddItem: () => void;
  onEditItem: (item: StartupCostItem) => void;
  onDeleteItem: (itemId: string) => void;
  title?: string;
  subtitle?: string;
  displayCurrency?: CurrencyCode;
  exchangeRate?: number;
  onCurrencyChange?: (currency: CurrencyCode) => void;
  onChangeCurrency?: (currency: CurrencyCode) => void;
  onRateChange?: (rate: number) => void;
  onUpdateExchangeRate?: (rate: number) => void;
}

export const SharedCostItemList: React.FC<SharedCostItemListProps> = ({
  items,
  onAddItem,
  onEditItem,
  onDeleteItem,
  title = 'Universal Cost & Asset Ledger',
  subtitle = 'Manage capital equipment, raw materials, direct job costs, and monthly overheads',
  displayCurrency: controlledCurrency,
  exchangeRate: controlledRate = DEFAULT_EXCHANGE_RATE,
  onCurrencyChange,
  onChangeCurrency,
  onRateChange,
  onUpdateExchangeRate
}) => {
  const [internalCurrency, setInternalCurrency] = useState<CurrencyCode>('USD');
  const [internalRate, setInternalRate] = useState<number>(DEFAULT_EXCHANGE_RATE);
  const [activeFilter, setActiveFilter] = useState<CostItemClassification | 'all'>('all');

  const currency = controlledCurrency ?? internalCurrency;
  const exchangeRate = controlledRate ?? internalRate;
  const currentSymbol = getCurrencySymbol(currency);

  const handleCurrencyToggle = (newCur: CurrencyCode) => {
    if (onChangeCurrency) {
      onChangeCurrency(newCur);
    } else if (onCurrencyChange) {
      onCurrencyChange(newCur);
    } else {
      setInternalCurrency(newCur);
    }
  };

  const handleRateUpdate = (newRate: number) => {
    if (onUpdateExchangeRate) {
      onUpdateExchangeRate(newRate);
    } else if (onRateChange) {
      onRateChange(newRate);
    } else {
      setInternalRate(newRate);
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.classification === activeFilter;
  });

  // Convert an item's raw value from its native currency into current displayCurrency
  const normalizeItemValue = (value: number | undefined, itemCur?: CurrencyCode): number => {
    if (value === undefined || isNaN(value)) return 0;
    const from = itemCur || 'USD';
    return convertCurrency(value, from, currency, exchangeRate);
  };

  // Calculate high-level summary buckets normalized to displayCurrency
  const equipmentItems = items.filter((i) => i.classification === 'equipment');
  const stockItems = items.filter((i) => i.classification === 'stock');
  const directItems = items.filter((i) => i.classification === 'direct');
  const operatingItems = items.filter((i) => i.classification === 'operating');
  const setupItems = items.filter((i) => i.classification === 'setup');

  const totalEquipmentCost = equipmentItems.reduce((sum, i) => {
    const raw = i.purchaseCost ?? i.amount ?? 0;
    return sum + normalizeItemValue(raw, i.currency);
  }, 0);

  const totalStockInitial = stockItems.reduce((sum, i) => {
    const qty = i.stockQuantity ?? i.initialStockUnits ?? 1;
    const unitCost = normalizeItemValue(i.stockUnitCost ?? 0, i.currency);
    return sum + (qty * unitCost);
  }, 0);

  const totalMonthlyOpEx = operatingItems.reduce((sum, i) => {
    const raw = i.monthlyExpenseAmount ?? i.amount ?? 0;
    return sum + normalizeItemValue(raw, i.currency);
  }, 0);

  const totalSetupCost = setupItems.reduce((sum, i) => {
    const raw = i.setupExpenseAmount ?? i.amount ?? 0;
    return sum + normalizeItemValue(raw, i.currency);
  }, 0);

  const getClassificationBadge = (classification: CostItemClassification) => {
    switch (classification) {
      case 'equipment':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
            <Wrench size={11} /> Equipment (Depreciated)
          </span>
        );
      case 'stock':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            <Package size={11} /> Stock / Raw Material
          </span>
        );
      case 'direct':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
            <Layers size={11} /> Direct Cost per Unit
          </span>
        );
      case 'operating':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Repeat size={11} /> Recurring Overhead
          </span>
        );
      case 'setup':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-800 border border-stone-300">
            <Calendar size={11} /> One-Time Setup
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Quick Summary Strip */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900">{title}</h3>
            <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CurrencyToggle
              currentCurrency={currency}
              exchangeRate={exchangeRate}
              onCurrencyChange={handleCurrencyToggle}
              onRateChange={handleRateUpdate}
              compact
            />
            <button
              type="button"
              onClick={onAddItem}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Cost Item</span>
            </button>
          </div>
        </div>

        {/* Ledger Category Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Wrench size={12} className="text-blue-600" /> Equipment Assets
            </div>
            <div className="text-sm font-bold text-stone-900 mt-1 font-mono">
              {currentSymbol} {totalEquipmentCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {equipmentItems.length} asset{equipmentItems.length === 1 ? '' : 's'} registered ({currency})
            </div>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Package size={12} className="text-amber-600" /> Initial Stock
            </div>
            <div className="text-sm font-bold text-stone-900 mt-1 font-mono">
              {currentSymbol} {totalStockInitial.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {stockItems.length} item{stockItems.length === 1 ? '' : 's'} tracked ({currency})
            </div>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Repeat size={12} className="text-emerald-600" /> Monthly Overhead
            </div>
            <div className="text-sm font-bold text-emerald-800 mt-1 font-mono">
              {currentSymbol} {totalMonthlyOpEx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {operatingItems.length} recurring bill{operatingItems.length === 1 ? '' : 's'} ({currency})
            </div>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Calendar size={12} className="text-stone-600" /> Setup Outlay
            </div>
            <div className="text-sm font-bold text-stone-900 mt-1 font-mono">
              {currentSymbol} {totalSetupCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {setupItems.length} one-time cost{setupItems.length === 1 ? '' : 's'} ({currency})
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-150">
          <span className="text-[11px] font-semibold text-stone-500 mr-1 flex items-center gap-1">
            <Filter size={12} /> Filter:
          </span>
          {[
            { id: 'all', label: `All (${items.length})` },
            { id: 'equipment', label: `Equipment (${equipmentItems.length})` },
            { id: 'stock', label: `Stock (${stockItems.length})` },
            { id: 'direct', label: `Direct Costs (${directItems.length})` },
            { id: 'operating', label: `Overheads (${operatingItems.length})` },
            { id: 'setup', label: `Setup (${setupItems.length})` }
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setActiveFilter(pill.id as any)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                activeFilter === pill.id
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <Package size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-800">No cost items in this category yet</div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              Click "Add Cost Item" to register equipment, inventory, direct costs, or recurring overheads.
            </div>
          </div>
          <button
            type="button"
            onClick={onAddItem}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Item</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map((item) => {
            const itemNativeCur: CurrencyCode = item.currency || 'USD';
            const itemSymbol = getCurrencySymbol(itemNativeCur);
            const isDifferentCurrency = itemNativeCur !== currency;

            return (
              <div
                key={item.id}
                className="bg-white border border-stone-200 rounded-xl p-4 shadow-2xs hover:border-stone-300 transition-all flex flex-col justify-between space-y-3 group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-stone-900">{item.name}</h4>
                        {item.category && (
                          <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded">
                            {item.category}
                          </span>
                        )}
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${
                            itemNativeCur === 'USD'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                          title={`Input currency: ${itemNativeCur}`}
                        >
                          {itemNativeCur}
                        </span>
                      </div>
                      <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                        {getClassificationBadge(item.classification)}
                        {item.importDetails?.isImported && (
                          <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <Ship size={10} /> Landed Import (Duties: {itemSymbol} {item.importDetails.totalDutiesAndTaxes?.toLocaleString()})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                        title="Edit Item"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Classification Specific Detail Breakdown */}
                  <div className="mt-3 text-xs bg-stone-50/70 border border-stone-150 rounded-lg p-2.5 space-y-1">
                    {item.classification === 'equipment' && (() => {
                      const dep = calculateEquipmentDepreciation(item);
                      const rental = calculateEquipmentRentalRevenue(item);
                      const pCostDisplay = normalizeItemValue(item.purchaseCost ?? 0, item.currency);
                      const monthlyDepDisplay = normalizeItemValue(dep.monthlyDepreciation, item.currency);
                      const rentalRevDisplay = normalizeItemValue(rental.monthlyRentalRevenue, item.currency);

                      return (
                        <div className="space-y-1 text-[11px] text-stone-600 font-mono">
                          <div className="flex justify-between">
                            <span className="font-sans">Purchase Cost:</span>
                            <span className="font-bold text-stone-900">
                              {currentSymbol} {pCostDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {isDifferentCurrency && (
                                <span className="text-[9.5px] text-stone-400 font-sans ml-1">
                                  ({itemSymbol} {(item.purchaseCost ?? 0).toLocaleString()})
                                </span>
                              )}
                              <span className="font-sans text-stone-500 font-normal ml-1">
                                (Month {item.purchaseMonth || 1})
                              </span>
                            </span>
                          </div>
                          <div className="flex justify-between font-sans text-stone-500 text-[10.5px]">
                            <span>Useful Life / Residual:</span>
                            <span>
                              {item.usefulLifeYears || 5} yrs ({currentSymbol} {normalizeItemValue(item.residualValue || 0, item.currency).toFixed(2)} salvage)
                            </span>
                          </div>
                          <div className="flex justify-between text-emerald-800 font-semibold border-t border-stone-200/60 pt-1 mt-1">
                            <span className="font-sans">Monthly Depreciation:</span>
                            <span>
                              {currentSymbol} {monthlyDepDisplay.toFixed(2)}/mo
                              {isDifferentCurrency && (
                                <span className="text-[9.5px] text-emerald-600 font-sans ml-1">
                                  ({itemSymbol} {dep.monthlyDepreciation.toFixed(2)}/mo)
                                </span>
                              )}
                            </span>
                          </div>
                          {item.isRentalRevenueGenerator && (
                            <div className="flex justify-between text-blue-800 font-semibold bg-blue-50/70 p-1 rounded mt-1">
                              <span className="font-sans">Rental Revenue Potential:</span>
                              <span>
                                +{currentSymbol} {rentalRevDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {item.classification === 'stock' && (() => {
                      const unitCostDisplay = normalizeItemValue(item.stockUnitCost ?? 0, item.currency);
                      const initialStockDisplay = normalizeItemValue((item.stockQuantity ?? 100) * (item.stockUnitCost ?? 0), item.currency);

                      return (
                        <div className="space-y-1 text-[11px] text-stone-600 font-mono">
                          <div className="flex justify-between">
                            <span className="font-sans">Unit Supplier Cost:</span>
                            <span className="font-bold text-stone-900">
                              {currentSymbol} {unitCostDisplay.toFixed(2)} / unit
                              {isDifferentCurrency && (
                                <span className="text-[9.5px] text-stone-400 font-sans ml-1">
                                  ({itemSymbol} {(item.stockUnitCost ?? 0).toFixed(2)})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between font-sans text-stone-500 text-[10.5px]">
                            <span>Initial Stock / Threshold:</span>
                            <span>{item.stockQuantity ?? 100} units (Reorder at {item.stockReorderPoint || 0})</span>
                          </div>
                          <div className="flex justify-between text-stone-800 font-semibold border-t border-stone-200/60 pt-1 mt-1">
                            <span className="font-sans">Initial Cash Outlay:</span>
                            <span>{currentSymbol} {initialStockDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {item.classification === 'direct' && (() => {
                      const directCostDisplay = normalizeItemValue(item.directCostPerUnitOrJob ?? 0, item.currency);

                      return (
                        <div className="space-y-1 text-[11px] text-stone-600 font-mono">
                          <div className="flex justify-between">
                            <span className="font-sans">Direct Cost per Sale/Job:</span>
                            <span className="font-bold text-stone-900">
                              {currentSymbol} {directCostDisplay.toFixed(2)}
                              {isDifferentCurrency && (
                                <span className="text-[9.5px] text-stone-400 font-sans ml-1">
                                  ({itemSymbol} {(item.directCostPerUnitOrJob ?? 0).toFixed(2)})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-[10px] text-stone-400 font-sans">
                            Automatically multiplies by monthly sales volume or billable services.
                          </div>
                        </div>
                      );
                    })()}

                    {item.classification === 'operating' && (() => {
                      const opExDisplay = normalizeItemValue(item.monthlyExpenseAmount ?? 0, item.currency);

                      return (
                        <div className="space-y-1 text-[11px] text-stone-600 font-mono">
                          <div className="flex justify-between">
                            <span className="font-sans">Monthly Recurring Overhead:</span>
                            <span className="font-bold text-emerald-800">
                              {currentSymbol} {opExDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
                              {isDifferentCurrency && (
                                <span className="text-[9.5px] text-emerald-600 font-sans ml-1">
                                  ({itemSymbol} {(item.monthlyExpenseAmount ?? 0).toLocaleString()}/mo)
                                </span>
                              )}
                            </span>
                          </div>
                          {item.isMaintenanceForEquipmentId && (
                            <div className="text-[10px] text-blue-700 font-sans">
                              Tagged for equipment maintenance
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {item.classification === 'setup' && (() => {
                      const setupDisplay = normalizeItemValue(item.setupExpenseAmount ?? 0, item.currency);

                      return (
                        <div className="space-y-1 text-[11px] text-stone-600 font-mono">
                          <div className="flex justify-between">
                            <span className="font-sans">One-Time Outlay:</span>
                            <span className="font-bold text-stone-900">
                              {currentSymbol} {setupDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {isDifferentCurrency && (
                                <span className="text-[9.5px] text-stone-400 font-sans ml-1">
                                  ({itemSymbol} {(item.setupExpenseAmount ?? 0).toLocaleString()})
                                </span>
                              )}
                              <span className="font-sans text-stone-500 font-normal ml-1">
                                (Month {item.setupMonth || 1})
                              </span>
                            </span>
                          </div>
                          <div className="text-[10px] text-stone-400 font-sans">
                            Cash hits during month {item.setupMonth || 1} of Year 1.
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {item.notes && (
                  <div className="text-[10px] text-stone-500 italic truncate pt-1 border-t border-stone-100">
                    "{item.notes}"
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

