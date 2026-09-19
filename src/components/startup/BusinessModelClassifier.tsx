import React, { useState } from 'react';
import { Package, Briefcase, Layers, ArrowRight } from 'lucide-react';
import { GoodsSubType, ServiceRevenueModel, StartupBusinessModelType } from '../../types';

interface Props {
  /** True when this is shown as a one-time migration prompt for a pre-existing project. */
  isMigration?: boolean;
  onComplete: (result: {
    businessModelType: StartupBusinessModelType;
    goodsSubType?: GoodsSubType;
    serviceRevenueModels?: ServiceRevenueModel[];
  }) => void;
}

const SERVICE_REVENUE_MODEL_OPTIONS: Array<{ value: ServiceRevenueModel; label: string }> = [
  { value: 'hourly', label: 'Hourly / Daily' },
  { value: 'fixed_project', label: 'Fixed-price Project' },
  { value: 'package', label: 'Package' },
  { value: 'retainer', label: 'Monthly / Annual Retainer' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'per_transaction', label: 'Per Customer / Transaction' },
  { value: 'other', label: 'Other' }
];

/**
 * Entry-point gate for the Startup workflow. Shown either when a new
 * Startup project is created, or as a one-time migration prompt when an
 * existing project has no businessModelType yet (see
 * needsBusinessModelClassification in startupFinancialsService.ts).
 */
export const BusinessModelClassifier: React.FC<Props> = ({ isMigration, onComplete }) => {
  const [model, setModel] = useState<StartupBusinessModelType | null>(null);
  const [goodsSubType, setGoodsSubType] = useState<GoodsSubType | null>(null);
  const [serviceModels, setServiceModels] = useState<ServiceRevenueModel[]>([]);

  const toggleServiceModel = (value: ServiceRevenueModel) => {
    setServiceModels((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const needsGoodsSubType = model === 'goods' || model === 'hybrid';
  const needsServiceModels = model === 'services' || model === 'hybrid';

  const canContinue =
    !!model &&
    (!needsGoodsSubType || !!goodsSubType) &&
    (!needsServiceModels || serviceModels.length > 0);

  const handleContinue = () => {
    if (!model || !canContinue) return;
    onComplete({
      businessModelType: model,
      goodsSubType: needsGoodsSubType ? goodsSubType || undefined : undefined,
      serviceRevenueModels: needsServiceModels ? serviceModels : undefined
    });
  };

  return (
    <div className="space-y-5 bg-white border border-stone-150 rounded-2xl p-5">
      {isMigration && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg px-3 py-2">
          This project was created before business-model-specific planning was added. Classify it once below —
          your existing figures are kept and mapped in automatically.
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-stone-800">What does this business primarily do?</h3>
        <p className="text-[11px] text-stone-400 mt-0.5">
          This determines which questions, calculations and forecasts you'll see next.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(
          [
            { value: 'goods', label: 'Goods', desc: 'Sells physical products', icon: Package },
            { value: 'services', label: 'Services', desc: 'Sells time, expertise or labour', icon: Briefcase },
            { value: 'hybrid', label: 'Goods + Services', desc: 'Does both', icon: Layers }
          ] as const
        ).map((opt) => {
          const Icon = opt.icon;
          const active = model === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setModel(opt.value)}
              className={`text-left p-3.5 rounded-xl border transition-all ${
                active
                  ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                  : 'border-stone-200 hover:border-stone-300 bg-stone-50'
              }`}
            >
              <Icon className={`w-4 h-4 mb-1.5 ${active ? 'text-emerald-600' : 'text-stone-400'}`} />
              <div className="text-xs font-bold text-stone-800">{opt.label}</div>
              <div className="text-[10px] text-stone-400 mt-0.5">{opt.desc}</div>
            </button>
          );
        })}
      </div>

      {needsGoodsSubType && (
        <div className="pt-3 border-t border-stone-100 space-y-2">
          <label className="text-[10px] font-bold text-stone-400 uppercase block">
            How do you get your goods?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { value: 'manufacturing', label: 'We manufacture / produce them' },
                { value: 'resale', label: 'We buy finished goods for resale' },
                { value: 'both', label: 'Both manufacturing and resale' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGoodsSubType(opt.value)}
                className={`text-left px-3 py-2 rounded-lg border text-[11px] font-semibold transition-all ${
                  goodsSubType === opt.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {needsServiceModels && (
        <div className="pt-3 border-t border-stone-100 space-y-2">
          <label className="text-[10px] font-bold text-stone-400 uppercase block">
            How are your services sold? (select all that apply)
          </label>
          <div className="flex flex-wrap gap-2">
            {SERVICE_REVENUE_MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleServiceModel(opt.value)}
                className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-all ${
                  serviceModels.includes(opt.value)
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          disabled={!canContinue}
          onClick={handleContinue}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default BusinessModelClassifier;
