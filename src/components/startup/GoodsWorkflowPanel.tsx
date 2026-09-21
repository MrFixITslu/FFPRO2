import React, { useState } from 'react';
import {
  Package,
  Plus,
  Trash2,
  TrendingUp,
  DollarSign,
  Layers,
  Sparkles,
  HelpCircle,
  Hammer,
  ShoppingBag,
  ArrowRight,
  Info,
  ArrowLeftRight
} from 'lucide-react';
import { GoodsProduct, GoodsBusinessType, StartupCostItem, StartupPlanDetails, CurrencyCode } from '../../types';
import { SharedCostItemList } from './SharedCostItemList';
import { SharedCostItemForm } from './SharedCostItemForm';
import { CurrencyToggle } from './CurrencyToggle';
import { roundCurrency } from '../../services/startupFinancialsService';
import { DEFAULT_USD_TO_XCD_RATE, getCurrencySymbol, convertCurrency } from '../../services/currencyService';

interface GoodsWorkflowPanelProps {
  goodsType: GoodsBusinessType;
  products: GoodsProduct[];
  costItems: StartupCostItem[];
  startingCash?: number;
  displayCurrency?: CurrencyCode;
  exchangeRate?: number;
  onUpdateProducts: (products: GoodsProduct[]) => void;
  onUpdateCostItems: (items: StartupCostItem[]) => void;
  onUpdateStartingCash: (cash: number) => void;
  onUpdateGoodsType: (type: GoodsBusinessType) => void;
  onChangeDisplayCurrency?: (currency: CurrencyCode) => void;
  onUpdateExchangeRate?: (rate: number) => void;
}

export const GoodsWorkflowPanel: React.FC<GoodsWorkflowPanelProps> = ({
  goodsType,
  products,
  costItems,
  startingCash = 10000,
  displayCurrency: controlledDisplayCurrency,
  exchangeRate: controlledExchangeRate,
  onUpdateProducts,
  onUpdateCostItems,
  onUpdateStartingCash,
  onUpdateGoodsType,
  onChangeDisplayCurrency,
  onUpdateExchangeRate
}) => {
  const [localDisplayCurrency, setLocalDisplayCurrency] = useState<CurrencyCode>('XCD');
  const [localExchangeRate, setLocalExchangeRate] = useState<number>(DEFAULT_USD_TO_XCD_RATE);

  const displayCurrency = controlledDisplayCurrency ?? localDisplayCurrency;
  const exchangeRate = controlledExchangeRate ?? localExchangeRate;

  const handleCurrencyChange = (curr: CurrencyCode) => {
    setLocalDisplayCurrency(curr);
    onChangeDisplayCurrency?.(curr);
  };

  const handleRateChange = (rate: number) => {
    setLocalExchangeRate(rate);
    onUpdateExchangeRate?.(rate);
  };

  const currentSymbol = getCurrencySymbol(displayCurrency);
  const otherCurrency: CurrencyCode = displayCurrency === 'USD' ? 'XCD' : 'USD';
  const otherSymbol = getCurrencySymbol(otherCurrency);

  const [editingItem, setEditingItem] = useState<StartupCostItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);

  // New product form inline state
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('25.00');
  const [newProdCurrency, setNewProdCurrency] = useState<CurrencyCode>(displayCurrency);
  const [newProdVolume, setNewProdVolume] = useState('500');
  const [newProdGrowth, setNewProdGrowth] = useState('2.0');
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Live conversion helper for input fields
  const renderConversionHint = (valStr: string, inputCurrency: CurrencyCode = displayCurrency) => {
    const val = parseFloat(valStr) || 0;
    if (val <= 0) return null;
    const target = inputCurrency === 'USD' ? 'XCD' : 'USD';
    const converted = convertCurrency(val, inputCurrency, target, exchangeRate);
    const targetSym = getCurrencySymbol(target);
    return (
      <span className="text-[10px] text-stone-500 font-mono flex items-center gap-1 mt-0.5">
        <ArrowLeftRight size={10} className="text-blue-500 shrink-0" />
        <span>≈ {targetSym} {converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </span>
    );
  };

  // Helper to normalize product price to active display currency
  const normalizeProductPrice = (product: GoodsProduct): number => {
    const pCurrency = product.currency || 'USD';
    return convertCurrency(product.sellingPrice, pCurrency, displayCurrency, exchangeRate);
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    const newProduct: GoodsProduct = {
      id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: newProdName.trim(),
      currency: newProdCurrency,
      sellingPrice: Math.max(0.01, parseFloat(newProdPrice) || 25),
      monthlySalesVolume: Math.max(1, parseInt(newProdVolume) || 100),
      monthlyGrowthRatePercent: parseFloat(newProdGrowth) || 0,
      annualGrowthRatePercent: 15
    };

    onUpdateProducts([...products, newProduct]);
    setNewProdName('');
    setNewProdPrice('25.00');
    setNewProdCurrency(displayCurrency);
    setNewProdVolume('500');
    setShowAddProduct(false);
  };

  const handleRemoveProduct = (id: string) => {
    onUpdateProducts(products.filter((p) => p.id !== id));
  };

  const handleUpdateProductField = (id: string, field: keyof GoodsProduct, value: any) => {
    const updated = products.map((p) => {
      if (p.id === id) {
        return { ...p, [field]: value };
      }
      return p;
    });
    onUpdateProducts(updated);
  };

  // Cost items handlers
  const handleSaveCostItem = (item: StartupCostItem) => {
    const exists = costItems.some((i) => i.id === item.id);
    if (exists) {
      onUpdateCostItems(costItems.map((i) => (i.id === item.id ? item : i)));
    } else {
      onUpdateCostItems([...costItems, item]);
    }
    setEditingItem(null);
    setIsAddingItem(false);
  };

  const handleDeleteCostItem = (itemId: string) => {
    onUpdateCostItems(costItems.filter((i) => i.id !== itemId));
  };

  // Unit economics aggregation (normalized to display currency)
  const stockItems = costItems.filter((i) => i.classification === 'stock');
  const directItems = costItems.filter((i) => i.classification === 'direct');
  const equipmentItems = costItems.filter((i) => i.classification === 'equipment');

  const totalMonthlySalesUnits = products.reduce((sum, p) => sum + p.monthlySalesVolume, 0);
  const totalMonthlyProductRevenue = products.reduce(
    (sum, p) => sum + p.monthlySalesVolume * normalizeProductPrice(p),
    0
  );

  const avgSellingPrice =
    totalMonthlySalesUnits > 0 ? totalMonthlyProductRevenue / totalMonthlySalesUnits : 25;

  const stockUnitCostEst =
    stockItems.length > 0
      ? stockItems.reduce((sum, s) => {
          const itemCurr = s.currency || 'USD';
          const cost = s.stockUnitCost || 0;
          return sum + convertCurrency(cost, itemCurr, displayCurrency, exchangeRate);
        }, 0) / stockItems.length
      : 0;

  const directUnitCostEst = directItems.reduce((sum, d) => {
    const itemCurr = d.currency || 'USD';
    const cost = d.directCostPerUnitOrJob || 0;
    return sum + convertCurrency(cost, itemCurr, displayCurrency, exchangeRate);
  }, 0);

  const totalUnitCostEst = roundCurrency(stockUnitCostEst + directUnitCostEst);
  const unitGrossMarginDollars = roundCurrency(avgSellingPrice - totalUnitCostEst);
  const unitGrossMarginPercent =
    avgSellingPrice > 0 ? roundCurrency((unitGrossMarginDollars / avgSellingPrice) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Workflow Strategy & Currency Header */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70">
              Goods Operational Engine
            </span>
          </div>
          <h3 className="text-sm font-bold text-stone-900">
            {goodsType === 'make' ? 'Make & Manufacturing Setup' : 'Resale & Merchandise Trading Setup'}
          </h3>
          <p className="text-xs text-stone-500">
            Configure product catalog, unit pricing, sales volume trajectories, and production cost items.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CurrencyToggle
            currentCurrency={displayCurrency}
            onChangeCurrency={handleCurrencyChange}
            exchangeRate={exchangeRate}
            onUpdateExchangeRate={handleRateChange}
            size="sm"
          />

          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200/60">
            <button
              type="button"
              onClick={() => onUpdateGoodsType('make')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                goodsType === 'make'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Hammer size={13} />
              <span>Make / Assembly</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateGoodsType('resell')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                goodsType === 'resell'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShoppingBag size={13} />
              <span>Resell / Retail</span>
            </button>
          </div>
        </div>
      </div>

      {/* Starting Cash Balance Input */}
      <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
            Initial Capitalization & Liquidity
          </div>
          <div className="text-sm font-semibold text-emerald-50">
            Starting Cash in Bank (Month 1 Reserve)
          </div>
          <div className="text-[11px] text-emerald-200/80">
            This starting balance funds initial equipment purchases and pre-launch setup expenses before revenue arrives.
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs text-stone-500 font-bold font-mono">{currentSymbol}</span>
              <input
                type="number"
                min="0"
                step="100"
                value={startingCash}
                onChange={(e) => onUpdateStartingCash(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-40 pl-11 pr-3 py-1.5 text-xs font-bold font-mono bg-white text-stone-900 rounded-xl border border-emerald-300/40 focus:ring-2 focus:ring-emerald-400 focus:outline-hidden text-right"
              />
            </div>
          </div>
          {startingCash > 0 && (
            <div className="text-[10px] text-emerald-200/90 font-mono">
              ≈ {otherSymbol} {convertCurrency(startingCash, displayCurrency, otherCurrency, exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {/* Product Catalog & Volume Drivers */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-3">
          <div>
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Package size={16} className="text-emerald-700" />
              <span>Product Line & Sales Targets</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              Specify selling price, expected initial monthly unit sales, and month-over-month growth rate for Year 1.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewProdCurrency(displayCurrency);
              setShowAddProduct(!showAddProduct);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Product</span>
          </button>
        </div>

        {/* Add Product Inline Form */}
        {showAddProduct && (
          <form onSubmit={handleAddProduct} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-stone-900">Add New Product to Lineup</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setNewProdCurrency('USD')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    newProdCurrency === 'USD' ? 'bg-blue-600 text-white' : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  US$ Price
                </button>
                <button
                  type="button"
                  onClick={() => setNewProdCurrency('XCD')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    newProdCurrency === 'XCD' ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  EC$ Price
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard 500g Sourdough Loaf"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Selling Price ({getCurrencySymbol(newProdCurrency)})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-stone-400 font-bold font-mono">
                    {getCurrencySymbol(newProdCurrency)}
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full pl-10 pr-3 py-1.5 text-xs font-bold font-mono border border-stone-200 bg-white rounded-lg"
                  />
                </div>
                {renderConversionHint(newProdPrice, newProdCurrency)}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Initial Monthly Volume (Units)</label>
                <input
                  type="number"
                  min="1"
                  value={newProdVolume}
                  onChange={(e) => setNewProdVolume(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-stone-200 bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">MoM Growth Rate (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newProdGrowth}
                    onChange={(e) => setNewProdGrowth(e.target.value)}
                    className="w-full px-3 pr-6 py-1.5 text-xs font-mono border border-stone-200 bg-white rounded-lg"
                  />
                  <span className="absolute right-2 top-1.5 text-xs text-stone-400">%</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddProduct(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-stone-500 hover:bg-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
              >
                Save Product
              </button>
            </div>
          </form>
        )}

        {/* Product Cards Table */}
        <div className="space-y-2.5">
          {products.map((product) => {
            const prodCurrency = product.currency || 'USD';
            const normalizedPrice = normalizeProductPrice(product);
            const monthlyRev = normalizedPrice * product.monthlySalesVolume;
            const isDifferentCurrency = prodCurrency !== displayCurrency;

            return (
              <div
                key={product.id}
                className="bg-stone-50/70 border border-stone-200/90 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-stone-900">{product.name}</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                      <span>{currentSymbol} {normalizedPrice.toFixed(2)}</span>
                      {isDifferentCurrency && (
                        <span className="text-[9px] text-emerald-700 font-normal">
                          (native: {getCurrencySymbol(prodCurrency)} {product.sellingPrice.toFixed(2)})
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateProductField(
                          product.id,
                          'currency',
                          prodCurrency === 'USD' ? 'XCD' : 'USD'
                        )
                      }
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-200 hover:bg-stone-300 text-stone-700 transition-colors cursor-pointer"
                      title="Toggle product's native entered currency"
                    >
                      Set as {prodCurrency === 'USD' ? 'EC$' : 'US$'}
                    </button>
                  </div>
                  <div className="text-[11px] text-stone-500 flex flex-wrap items-center gap-3">
                    <span>Target Volume: <strong>{product.monthlySalesVolume.toLocaleString()} units/mo</strong></span>
                    <span>•</span>
                    <span>Monthly Revenue: <strong className="font-mono">{currentSymbol} {monthlyRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                    <span>•</span>
                    <span>Growth: <strong>+{product.monthlyGrowthRatePercent || 0}% / mo</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <div className="flex items-center gap-1 text-xs">
                    <label className="text-[10px] text-stone-500">Vol/mo:</label>
                    <input
                      type="number"
                      min="1"
                      value={product.monthlySalesVolume}
                      onChange={(e) =>
                        handleUpdateProductField(product.id, 'monthlySalesVolume', parseInt(e.target.value) || 1)
                      }
                      className="w-20 px-2 py-1 text-xs font-mono border border-stone-200 bg-white rounded-lg"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <label className="text-[10px] text-stone-500">
                      Price ({getCurrencySymbol(prodCurrency)}):
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={product.sellingPrice}
                      onChange={(e) =>
                        handleUpdateProductField(product.id, 'sellingPrice', parseFloat(e.target.value) || 0)
                      }
                      className="w-20 px-2 py-1 text-xs font-bold font-mono border border-stone-200 bg-white rounded-lg"
                    />
                  </div>

                  {products.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(product.id)}
                      className="p-1 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                      title="Remove product"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unit Economics Snapshot */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-700" />
            <span className="font-bold text-stone-900">Unit Economics & Gross Margin Profile ({displayCurrency}):</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <span>Avg Price: <strong className="font-mono">{currentSymbol} {avgSellingPrice.toFixed(2)}</strong></span>
            <span className="text-stone-300">|</span>
            <span>Direct Cost: <strong className="font-mono">{currentSymbol} {totalUnitCostEst.toFixed(2)}</strong></span>
            <span className="text-stone-300">|</span>
            <span>Gross Margin: <strong className="font-mono">{currentSymbol} {unitGrossMarginDollars.toFixed(2)} ({unitGrossMarginPercent}%)</strong></span>
          </div>
        </div>
      </div>

      {/* Embedded Cost Items Ledger & Form Modal */}
      {isAddingItem || editingItem ? (
        <SharedCostItemForm
          initialItem={editingItem || undefined}
          displayCurrency={displayCurrency}
          exchangeRate={exchangeRate}
          availableEquipmentList={equipmentItems}
          onSave={handleSaveCostItem}
          onCancel={() => {
            setIsAddingItem(false);
            setEditingItem(null);
          }}
        />
      ) : (
        <SharedCostItemList
          items={costItems}
          displayCurrency={displayCurrency}
          exchangeRate={exchangeRate}
          onChangeCurrency={handleCurrencyChange}
          onUpdateExchangeRate={handleRateChange}
          onAddItem={() => setIsAddingItem(true)}
          onEditItem={(item) => setEditingItem(item)}
          onDeleteItem={handleDeleteCostItem}
          title="Production Cost Structure & Assets"
          subtitle="Manage equipment assets, raw materials / stock items, packaging, and facility overheads"
        />
      )}
    </div>
  );
};
