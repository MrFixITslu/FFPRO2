import React from 'react';
import { Package, Briefcase, Layers, Hammer, ShoppingBag, ArrowRight, CheckCircle2 } from 'lucide-react';
import { BusinessModelType, GoodsBusinessType } from '../../types';

interface BusinessModelClassifierProps {
  currentModel?: BusinessModelType;
  currentGoodsType?: GoodsBusinessType;
  onSelectModel: (model: BusinessModelType, goodsType?: GoodsBusinessType) => void;
  isMigrationPrompt?: boolean;
}

export const BusinessModelClassifier: React.FC<BusinessModelClassifierProps> = ({
  currentModel,
  currentGoodsType,
  onSelectModel,
  isMigrationPrompt = false
}) => {
  const [selectedType, setSelectedType] = React.useState<BusinessModelType>(currentModel || 'goods');
  const [selectedGoodsSubtype, setSelectedGoodsSubtype] = React.useState<GoodsBusinessType>(currentGoodsType || 'make');

  const handleConfirm = () => {
    onSelectModel(selectedType, selectedType === 'goods' || selectedType === 'both' ? selectedGoodsSubtype : undefined);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-6">
      <div className="border-b border-stone-150 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70">
            {isMigrationPrompt ? 'Project Upgrade Required' : 'Step 1: Business Model Architecture'}
          </span>
        </div>
        <h3 className="text-base font-bold text-stone-900 mt-2">
          What type of business are you planning?
        </h3>
        <p className="text-xs text-stone-500 mt-1">
          Select your core commercial model. This customises your questions, unit economics, and capacity planning.
        </p>
      </div>

      {/* 3 Main Business Models */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Goods */}
        <button
          type="button"
          onClick={() => setSelectedType('goods')}
          className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between relative group ${
            selectedType === 'goods'
              ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20 shadow-xs'
              : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/60'
          }`}
        >
          <div className="space-y-2.5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              selectedType === 'goods' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700 group-hover:bg-stone-200'
            }`}>
              <Package size={18} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-stone-900">Goods / Physical Products</h4>
                {selectedType === 'goods' && <CheckCircle2 size={16} className="text-emerald-600" />}
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Selling physical inventory, manufactured items, food & beverages, retail merchandise, or crafted goods.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-150/70 text-[11px] font-semibold text-stone-600">
            Includes stock carrying, raw materials & equipment
          </div>
        </button>

        {/* Services */}
        <button
          type="button"
          onClick={() => setSelectedType('services')}
          className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between relative group ${
            selectedType === 'services'
              ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20 shadow-xs'
              : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/60'
          }`}
        >
          <div className="space-y-2.5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              selectedType === 'services' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700 group-hover:bg-stone-200'
            }`}>
              <Briefcase size={18} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-stone-900">Services & Rentals</h4>
                {selectedType === 'services' && <CheckCircle2 size={16} className="text-emerald-600" />}
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Professional services, consulting, subscriptions, retainers, hourly contracting, or equipment rental operations.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-150/70 text-[11px] font-semibold text-stone-600">
            Capacity-driven: billable hours, projects or rental days
          </div>
        </button>

        {/* Hybrid / Both */}
        <button
          type="button"
          onClick={() => setSelectedType('both')}
          className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between relative group ${
            selectedType === 'both'
              ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20 shadow-xs'
              : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/60'
          }`}
        >
          <div className="space-y-2.5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              selectedType === 'both' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700 group-hover:bg-stone-200'
            }`}>
              <Layers size={18} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-stone-900">Hybrid (Goods & Services)</h4>
                {selectedType === 'both' && <CheckCircle2 size={16} className="text-emerald-600" />}
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Combined model (e.g. salon selling hair products, catering events with food & service, tech hardware + service plans).
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-150/70 text-[11px] font-semibold text-stone-600">
            Full dual-stream revenue & unified cost engine
          </div>
        </button>
      </div>

      {/* Sub-Classification for Goods: Make vs Resell */}
      {(selectedType === 'goods' || selectedType === 'both') && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-stone-800">
              Goods Operational Workflow:
            </label>
            <span className="text-[10px] text-stone-400 font-medium">Production vs. Trading</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedGoodsSubtype('make')}
              className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-all ${
                selectedGoodsSubtype === 'make'
                  ? 'border-emerald-600 bg-white ring-1 ring-emerald-500 shadow-2xs'
                  : 'border-stone-200 bg-white/70 hover:bg-white'
              }`}
            >
              <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                selectedGoodsSubtype === 'make' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
              }`}>
                <Hammer size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900">Make / Manufacture</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  You purchase raw materials and assemble or cook finished products.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedGoodsSubtype('resell')}
              className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-all ${
                selectedGoodsSubtype === 'resell'
                  ? 'border-emerald-600 bg-white ring-1 ring-emerald-500 shadow-2xs'
                  : 'border-stone-200 bg-white/70 hover:bg-white'
              }`}
            >
              <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                selectedGoodsSubtype === 'resell' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
              }`}>
                <ShoppingBag size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900">Resell / Wholesale / Retail</div>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  You purchase ready-made inventory from suppliers and resell with a markup.
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Confirm & Proceed Button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleConfirm}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors"
        >
          <span>Confirm Business Model & Configure Plan</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
