import React, { useState } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { GoodsProduct, GoodsSubType, RawMaterialLine } from '../../types';
import { calculateGoodsUnitCost, calculateGoodsMonthlyResult } from '../../services/startupFinancialsService';

interface Props {
  goodsSubType: GoodsSubType;
  products: GoodsProduct[];
  onChange: (products: GoodsProduct[]) => void;
}

const newProduct = (sourcing: 'manufactured' | 'resale'): GoodsProduct => ({
  id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  sourcing,
  sellingPrice: 0,
  expectedMonthlyUnits: 0
});

const inputCls =
  'w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 text-stone-800 rounded outline-none font-semibold text-xs focus:ring-1 focus:ring-emerald-500 focus:bg-white';
const labelCls = 'text-[9px] font-bold text-stone-400 uppercase block mb-1';

const NumberField: React.FC<{ label: string; value: number | undefined; onChange: (v: number) => void; prefix?: string; suffix?: string }> = ({
  label,
  value,
  onChange,
  prefix,
  suffix
}) => (
  <div>
    <label className={labelCls}>{label}</label>
    <div className="relative">
      {prefix && <span className="absolute left-2.5 top-1.5 text-stone-400 text-xs">{prefix}</span>}
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className={`${inputCls} ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''}`}
      />
      {suffix && <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">{suffix}</span>}
    </div>
  </div>
);

export const GoodsWorkflowPanel: React.FC<Props> = ({ goodsSubType, products, onChange }) => {
  const [expandedId, setExpandedId] = useState<string | null>(products[0]?.id || null);

  const update = (id: string, patch: Partial<GoodsProduct>) => {
    onChange(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const remove = (id: string) => {
    onChange(products.filter((p) => p.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const addProduct = (sourcing: 'manufactured' | 'resale') => {
    const p = newProduct(sourcing);
    onChange([...products, p]);
    setExpandedId(p.id);
  };

  const allowManufactured = goodsSubType === 'manufacturing' || goodsSubType === 'both';
  const allowResale = goodsSubType === 'resale' || goodsSubType === 'both';

  const updateMaterial = (product: GoodsProduct, materialId: string, patch: Partial<RawMaterialLine>) => {
    const materials = (product.rawMaterials || []).map((m) => (m.id === materialId ? { ...m, ...patch } : m));
    update(product.id, { rawMaterials: materials });
  };

  const addMaterial = (product: GoodsProduct) => {
    const materials = [
      ...(product.rawMaterials || []),
      { id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: '', quantityPerUnit: 1, costPerUnit: 0 }
    ];
    update(product.id, { rawMaterials: materials });
  };

  const removeMaterial = (product: GoodsProduct, materialId: string) => {
    update(product.id, { rawMaterials: (product.rawMaterials || []).filter((m) => m.id !== materialId) });
  };

  const summary = calculateGoodsMonthlyResult(products);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
          <Package className="w-4 h-4 text-emerald-600" /> Products
        </h3>
        <div className="flex gap-2">
          {allowResale && (
            <button
              type="button"
              onClick={() => addProduct('resale')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-bold transition-colors"
            >
              <Plus className="w-3 h-3" /> Resale Product
            </button>
          )}
          {allowManufactured && (
            <button
              type="button"
              onClick={() => addProduct('manufactured')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-colors"
            >
              <Plus className="w-3 h-3" /> Manufactured Product
            </button>
          )}
        </div>
      </div>

      {products.length === 0 && (
        <div className="text-center py-8 text-stone-400 text-xs border border-dashed border-stone-200 rounded-xl">
          No products yet — add one above to start building your costing model.
        </div>
      )}

      {products.map((product) => {
        const breakdown = calculateGoodsUnitCost(product);
        const isOpen = expandedId === product.id;
        return (
          <div key={product.id} className="border border-stone-150 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : product.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors"
            >
              <div className="text-left">
                <div className="text-xs font-bold text-stone-800">{product.name || 'Untitled product'}</div>
                <div className="text-[10px] text-stone-400">
                  {product.sourcing === 'manufactured' ? 'Manufactured' : 'Resale'} · Unit cost ${breakdown.unitCost.toFixed(2)} ·
                  Margin {breakdown.grossMarginPercent}%
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(product.id);
                }}
                className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </button>

            {isOpen && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Product Name</label>
                    <input
                      type="text"
                      value={product.name}
                      onChange={(e) => update(product.id, { name: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. Coconut Body Butter 250ml"
                    />
                  </div>
                  <NumberField label="Selling Price" prefix="$" value={product.sellingPrice} onChange={(v) => update(product.id, { sellingPrice: v })} />
                  <NumberField
                    label="Expected Monthly Units"
                    value={product.expectedMonthlyUnits}
                    onChange={(v) => update(product.id, { expectedMonthlyUnits: v })}
                  />
                  <NumberField
                    label="Monthly Sales Growth"
                    suffix="%"
                    value={product.monthlySalesGrowthPercent}
                    onChange={(v) => update(product.id, { monthlySalesGrowthPercent: v })}
                  />
                  <NumberField
                    label="Returns / Warranty Allowance"
                    suffix="%"
                    value={product.returnsWarrantyAllowancePercent}
                    onChange={(v) => update(product.id, { returnsWarrantyAllowancePercent: v })}
                  />
                </div>

                {product.sourcing === 'resale' ? (
                  <div className="border-t border-stone-100 pt-3 space-y-3">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">Resale Costs</label>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberField label="Purchase Cost / Unit" prefix="$" value={product.purchaseCostPerUnit} onChange={(v) => update(product.id, { purchaseCostPerUnit: v })} />
                      <NumberField label="Freight / Import Cost / Unit" prefix="$" value={product.freightImportCostPerUnit} onChange={(v) => update(product.id, { freightImportCostPerUnit: v })} />
                      <NumberField label="Minimum Order Quantity" value={product.minimumOrderQuantity} onChange={(v) => update(product.id, { minimumOrderQuantity: v })} />
                      <NumberField label="Lead Time" suffix="days" value={product.leadTimeDays} onChange={(v) => update(product.id, { leadTimeDays: v })} />
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-stone-100 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-stone-400 uppercase">Raw Materials</label>
                      <button
                        type="button"
                        onClick={() => addMaterial(product)}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Material
                      </button>
                    </div>
                    {(product.rawMaterials || []).map((m) => (
                      <div key={m.id} className="grid grid-cols-[1fr,80px,90px,28px] gap-2 items-end">
                        <div>
                          <label className={labelCls}>Material</label>
                          <input type="text" value={m.name} onChange={(e) => updateMaterial(product, m.id, { name: e.target.value })} className={inputCls} placeholder="e.g. Shea butter" />
                        </div>
                        <div>
                          <label className={labelCls}>Qty/Unit</label>
                          <input type="number" value={m.quantityPerUnit} onChange={(e) => updateMaterial(product, m.id, { quantityPerUnit: parseFloat(e.target.value) || 0 })} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Cost/Qty</label>
                          <input type="number" value={m.costPerUnit} onChange={(e) => updateMaterial(product, m.id, { costPerUnit: parseFloat(e.target.value) || 0 })} className={inputCls} />
                        </div>
                        <button type="button" onClick={() => removeMaterial(product, m.id)} className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <NumberField label="Direct Production Labour / Unit" prefix="$" value={product.directProductionLabourPerUnit} onChange={(v) => update(product.id, { directProductionLabourPerUnit: v })} />
                      <NumberField label="Allocated Production Overhead / Unit" prefix="$" value={product.productionOverheadPerUnit} onChange={(v) => update(product.id, { productionOverheadPerUnit: v })} />
                      <NumberField label="Waste / Scrap" suffix="%" value={product.wasteScrapPercent} onChange={(v) => update(product.id, { wasteScrapPercent: v })} />
                      <NumberField label="Production Capacity" suffix="units/mo" value={product.productionCapacityUnitsPerMonth} onChange={(v) => update(product.id, { productionCapacityUnitsPerMonth: v })} />
                    </div>
                  </div>
                )}

                <div className="border-t border-stone-100 pt-3 grid grid-cols-2 gap-3">
                  <NumberField label="Packaging Cost / Unit" prefix="$" value={product.packagingCostPerUnit} onChange={(v) => update(product.id, { packagingCostPerUnit: v })} />
                  <NumberField label="Distribution Cost / Unit" prefix="$" value={product.distributionCostPerUnit} onChange={(v) => update(product.id, { distributionCostPerUnit: v })} />
                  <NumberField label="Duties / Taxes" suffix="%" value={product.dutiesTaxesPercent} onChange={(v) => update(product.id, { dutiesTaxesPercent: v })} />
                  <div>
                    <label className={labelCls}>Supplier / Manufacturer</label>
                    <input type="text" value={product.supplier || ''} onChange={(e) => update(product.id, { supplier: e.target.value })} className={inputCls} />
                  </div>
                </div>

                <div className="bg-stone-50 rounded-xl p-3 grid grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase font-bold">Unit Cost</div>
                    <div className="text-sm font-bold text-stone-800">${breakdown.unitCost.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase font-bold">Selling Price</div>
                    <div className="text-sm font-bold text-stone-800">${breakdown.sellingPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase font-bold">Gross Profit/Unit</div>
                    <div className="text-sm font-bold text-emerald-600">${breakdown.grossProfitPerUnit.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase font-bold">Gross Margin</div>
                    <div className="text-sm font-bold text-emerald-600">{breakdown.grossMarginPercent}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {products.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Monthly Revenue</div>
            <div className="text-sm font-bold text-emerald-800">${summary.monthlyRevenue.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Monthly COGS</div>
            <div className="text-sm font-bold text-emerald-800">${summary.monthlyCOGS.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Gross Profit</div>
            <div className="text-sm font-bold text-emerald-800">${summary.monthlyGrossProfit.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Gross Margin</div>
            <div className="text-sm font-bold text-emerald-800">{summary.grossMarginPercent}%</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoodsWorkflowPanel;
