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
  Ship
} from 'lucide-react';
import { CostItemClassification, StartupCostItem } from '../../types';
import { calculateEquipmentDepreciation, calculateEquipmentRentalRevenue } from '../../services/startupFinancialsService';

interface SharedCostItemListProps {
  items: StartupCostItem[];
  onAddItem: () => void;
  onEditItem: (item: StartupCostItem) => void;
  onDeleteItem: (itemId: string) => void;
  title?: string;
  subtitle?: string;
}

export const SharedCostItemList: React.FC<SharedCostItemListProps> = ({
  items,
  onAddItem,
  onEditItem,
  onDeleteItem,
  title = 'Universal Cost & Asset Ledger',
  subtitle = 'Manage capital equipment, raw materials, direct job costs, and monthly overheads'
}) => {
  const [activeFilter, setActiveFilter] = useState<CostItemClassification | 'all'>('all');

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.classification === activeFilter;
  });

  // Calculate high-level summary buckets
  const equipmentItems = items.filter((i) => i.classification === 'equipment');
  const stockItems = items.filter((i) => i.classification === 'stock');
  const directItems = items.filter((i) => i.classification === 'direct');
  const operatingItems = items.filter((i) => i.classification === 'operating');
  const setupItems = items.filter((i) => i.classification === 'setup');

  const totalEquipmentCost = equipmentItems.reduce((sum, i) => sum + (i.purchaseCost ?? i.amount ?? 0), 0);
  const totalStockInitial = stockItems.reduce(
    (sum, i) => sum + (i.stockQuantity ?? i.initialStockUnits ?? 1) * (i.stockUnitCost ?? 0),
    0
  );
  const totalMonthlyOpEx = operatingItems.reduce(
    (sum, i) => sum + (i.monthlyExpenseAmount ?? i.amount ?? 0),
    0
  );
  const totalSetupCost = setupItems.reduce(
    (sum, i) => sum + (i.setupExpenseAmount ?? i.amount ?? 0),
    0
  );

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900">{title}</h3>
            <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onAddItem}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus size={14} />
            <span>Add Cost Item</span>
          </button>
        </div>

        {/* Ledger Category Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Wrench size={12} className="text-blue-600" /> Equipment Assets
            </div>
            <div className="text-sm font-bold text-stone-900 mt-1">
              ${totalEquipmentCost.toLocaleString()}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {equipmentItems.length} asset{equipmentItems.length === 1 ? '' : 's'} registered
            </div>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Package size={12} className="text-amber-600" /> Initial Stock
            </div>
            <div className="text-sm font-bold text-stone-900 mt-1">
              ${totalStockInitial.toLocaleString()}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {stockItems.length} item{stockItems.length === 1 ? '' : 's'} tracked
            </div>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Repeat size={12} className="text-emerald-600" /> Monthly Overhead
            </div>
            <div className="text-sm font-bold text-emerald-800 mt-1">
              ${totalMonthlyOpEx.toLocaleString()}/mo
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {operatingItems.length} recurring bill{operatingItems.length === 1 ? '' : 's'}
            </div>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl">
            <div className="text-[10.5px] font-semibold text-stone-500 flex items-center gap-1">
              <Calendar size={12} className="text-stone-600" /> Setup Outlay
            </div>
            <div className="text-sm font-bold text-stone-900 mt-1">
              ${totalSetupCost.toLocaleString()}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {setupItems.length} one-time cost{setupItems.length === 1 ? '' : 's'}
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
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
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
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors"
          >
            <Plus size={13} />
            <span>Add Item</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map((item) => {
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
                      </div>
                      <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                        {getClassificationBadge(item.classification)}
                        {item.importDetails?.isImported && (
                          <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <Ship size={10} /> Landed Import (Duties: ${item.importDetails.totalDutiesAndTaxes?.toLocaleString()})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                        title="Edit Item"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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
                      return (
                        <div className="space-y-1 text-[11px] text-stone-600">
                          <div className="flex justify-between">
                            <span>Purchase Cost:</span>
                            <span className="font-bold text-stone-900">${(item.purchaseCost ?? 0).toLocaleString()} (Month {item.purchaseMonth || 1})</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Useful Life / Residual:</span>
                            <span>{item.usefulLifeYears || 5} yrs (${item.residualValue || 0} salvage)</span>
                          </div>
                          <div className="flex justify-between text-emerald-800 font-semibold border-t border-stone-200/60 pt-1 mt-1">
                            <span>Monthly Depreciation:</span>
                            <span>${dep.monthlyDepreciation.toFixed(2)}/mo</span>
                          </div>
                          {item.isRentalRevenueGenerator && (
                            <div className="flex justify-between text-blue-800 font-semibold bg-blue-50/70 p-1 rounded mt-1">
                              <span>Rental Revenue Potential:</span>
                              <span>+${rental.monthlyRentalRevenue.toLocaleString()}/mo</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {item.classification === 'stock' && (
                      <div className="space-y-1 text-[11px] text-stone-600">
                        <div className="flex justify-between">
                          <span>Unit Supplier Cost:</span>
                          <span className="font-bold text-stone-900">${(item.stockUnitCost ?? 0).toFixed(2)} / unit</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Initial Stock / Threshold:</span>
                          <span>{item.stockQuantity ?? 100} units (Reorder at {item.stockReorderPoint || 0})</span>
                        </div>
                        <div className="flex justify-between text-stone-800 font-semibold border-t border-stone-200/60 pt-1 mt-1">
                          <span>Initial Cash Outlay:</span>
                          <span>${((item.stockQuantity ?? 100) * (item.stockUnitCost ?? 0)).toLocaleString()}</span>
                        </div>
                      </div>
                    )}

                    {item.classification === 'direct' && (
                      <div className="space-y-1 text-[11px] text-stone-600">
                        <div className="flex justify-between">
                          <span>Direct Cost per Sale/Job:</span>
                          <span className="font-bold text-stone-900">${(item.directCostPerUnitOrJob ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="text-[10px] text-stone-400">
                          Automatically multiplies by monthly sales volume or billable services.
                        </div>
                      </div>
                    )}

                    {item.classification === 'operating' && (
                      <div className="space-y-1 text-[11px] text-stone-600">
                        <div className="flex justify-between">
                          <span>Monthly Recurring Overhead:</span>
                          <span className="font-bold text-emerald-800">${(item.monthlyExpenseAmount ?? 0).toLocaleString()}/mo</span>
                        </div>
                        {item.isMaintenanceForEquipmentId && (
                          <div className="text-[10px] text-blue-700">
                            Tagged for equipment maintenance
                          </div>
                        )}
                      </div>
                    )}

                    {item.classification === 'setup' && (
                      <div className="space-y-1 text-[11px] text-stone-600">
                        <div className="flex justify-between">
                          <span>One-Time Outlay:</span>
                          <span className="font-bold text-stone-900">${(item.setupExpenseAmount ?? 0).toLocaleString()} (Month {item.setupMonth || 1})</span>
                        </div>
                        <div className="text-[10px] text-stone-400">
                          Cash hits during month {item.setupMonth || 1} of Year 1.
                        </div>
                      </div>
                    )}
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
