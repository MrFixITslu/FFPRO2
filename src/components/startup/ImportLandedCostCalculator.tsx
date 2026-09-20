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
  title = 'Saint Lucia & Caribbean Landed Cost & Customs Duty Calculator',
  subtitle = 'Calculate shipping freight, CARICOM / Saint Lucia import tariffs, levies, and port clearance costs',
  onApplyLandedCost,
  onClose,
  isCompact = false
}) => {
  const [category, setCategory] = useState<ImportDutyCategory>(
    initialImportDetails?.category || initialCategory || 'electronics'
  );
  const [unitsCount, setUnitsCount] = useState<string>(
    initialUnitsCount?.toString() || '1'
  );
  const [unitFobCost, setUnitFobCost] = useState<string>(
    initialImportDetails?.fobCost && initialUnitsCount
      ? (initialImportDetails.fobCost / (initialUnitsCount || 1)).toString()
      : initialFobUnitCost?.toString() || '800'
  );
  const [shippingFreight, setShippingFreight] = useState<string>(
    initialImportDetails?.shippingFreight?.toString() || initialShippingTotal?.toString() || '250'
  );
  const [insuranceCost, setInsuranceCost] = useState<string>(
    initialImportDetails?.insuranceCost?.toString() || ''
  );
  const [portBrokerageFee, setPortBrokerageFee] = useState<string>(
    initialImportDetails?.portAndBrokerageFee?.toString() || '120'
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
  const totalFobCost = roundCurrency(unitFobNum * unitsNum);
  const shippingNum = Math.max(0, parseFloat(shippingFreight) || 0);
  const insuranceNum = insuranceCost !== '' ? Math.max(0, parseFloat(insuranceCost) || 0) : undefined;
  const portFeeNum = Math.max(0, parseFloat(portBrokerageFee) || 0);

  const currentPreset = SAINT_LUCIA_DUTY_PRESETS[category] || SAINT_LUCIA_DUTY_PRESETS.electronics;

  const calculationResult = calculateLandedImportCost({
    fobCost: totalFobCost,
    shippingFreight: shippingNum,
    insuranceCost: insuranceNum,
    category,
    country: 'saint_lucia',
    customDutyRate: isCustomMode ? parseFloat(customDuty) || 0 : undefined,
    customCscRate: isCustomMode ? parseFloat(customCsc) || 0 : undefined,
    customHcslRate: isCustomMode ? parseFloat(customHcsl) || 0 : undefined,
    customEnvRate: isCustomMode ? parseFloat(customEnv) || 0 : undefined,
    customVatRate: isCustomMode ? parseFloat(customVat) || 0 : undefined,
    portAndBrokerageFee: portFeeNum,
    unitsCount: unitsNum
  });

  const effectiveTaxOnCif = calculationResult.cifValue > 0
    ? ((calculationResult.totalDutiesAndTaxes / calculationResult.cifValue) * 100).toFixed(2)
    : '0';

  const landedMultiplierOnFob = totalFobCost > 0
    ? ((calculationResult.totalLandedCost / totalFobCost) * 100 - 100).toFixed(1)
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

      {/* Commodity Category Profile Selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-stone-800 flex items-center justify-between">
          <span>Import Commodity & Tariff Profile</span>
          <span className="text-[10px] font-normal text-emerald-700 font-mono">
            Est. Duties + Levies + VAT: ~{isCustomMode ? 'Custom' : `${currentPreset.effectiveRatePercent}%`} on CIF
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
            FOB Unit Price ($)
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitFobCost}
              onChange={(e) => setUnitFobCost(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50/50 focus:bg-white focus:border-emerald-600"
              placeholder="800"
            />
          </div>
          <div className="text-[9.5px] text-stone-400">Total FOB: ${totalFobCost.toLocaleString()}</div>
        </div>

        <div className="space-y-1">
          <label className="text-[10.5px] font-bold text-stone-700">
            Freight / Shipping ($)
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={shippingFreight}
              onChange={(e) => setShippingFreight(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50/50 focus:bg-white focus:border-emerald-600"
              placeholder="250"
            />
          </div>
          <div className="text-[9.5px] text-stone-400">Air/Ocean Cargo</div>
        </div>

        <div className="space-y-1">
          <label className="text-[10.5px] font-bold text-stone-700">
            Port & Brokerage ($)
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={portBrokerageFee}
              onChange={(e) => setPortBrokerageFee(e.target.value)}
              className="w-full pl-6 pr-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50/50 focus:bg-white focus:border-emerald-600"
              placeholder="120"
            />
          </div>
          <div className="text-[9.5px] text-stone-400">Clearance & Entry</div>
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
            <div className="text-[11px] font-mono text-emerald-300 uppercase tracking-wide">
              Official Landed Cost Output
            </div>
            <div className="text-lg font-extrabold text-white mt-0.5">
              ${calculationResult.totalLandedCost.toLocaleString()} <span className="text-xs font-normal text-emerald-200">Total Investment ({unitsNum} unit{unitsNum > 1 ? 's' : ''})</span>
            </div>
          </div>

          <div className="text-right sm:text-right">
            <div className="text-[10.5px] text-emerald-300">Unit Landed Cost:</div>
            <div className="text-sm font-bold text-emerald-100">
              ${calculationResult.costPerUnitLanded.toLocaleString()} / unit
            </div>
            <div className="text-[9.5px] text-emerald-400 font-mono">
              (+{landedMultiplierOnFob}% over FOB invoice)
            </div>
          </div>
        </div>

        {/* Detailed Waterfall Table */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">1. Base Invoice (FOB)</div>
            <div className="text-xs font-bold text-white mt-0.5">${calculationResult.fobCost.toLocaleString()}</div>
            <div className="text-[9px] text-emerald-400">{unitsNum} × ${unitFobNum.toLocaleString()}</div>
          </div>

          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">2. CIF Customs Value</div>
            <div className="text-xs font-bold text-white mt-0.5">${calculationResult.cifValue.toLocaleString()}</div>
            <div className="text-[9px] text-emerald-400">+${calculationResult.shippingFreight} freight, ${calculationResult.insuranceCost} ins.</div>
          </div>

          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">3. Customs Duties & Levies</div>
            <div className="text-xs font-bold text-amber-300 mt-0.5">
              ${calculationResult.totalDutiesAndTaxes.toLocaleString()}
            </div>
            <div className="text-[9px] text-emerald-300">
              {effectiveTaxOnCif}% effective tax on CIF
            </div>
          </div>

          <div className="p-2 rounded-lg bg-emerald-900/60 border border-emerald-800/60">
            <div className="text-[10px] text-emerald-300 font-medium">4. Port & Brokerage</div>
            <div className="text-xs font-bold text-white mt-0.5">${calculationResult.portAndBrokerageFee.toLocaleString()}</div>
            <div className="text-[9px] text-emerald-400">Customs clearance</div>
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
            <span>{showFormulaDetails ? 'Hide' : 'View'} statutory tax line items (ASYCUDA formula)</span>
          </button>

          {showFormulaDetails && (
            <div className="mt-2 p-2.5 rounded-lg bg-emerald-900/90 text-[10.5px] font-mono space-y-1 text-emerald-100 animate-in fade-in">
              <div className="flex justify-between">
                <span>• Import Duty ({calculationResult.dutyRatePercent}% on CIF):</span>
                <span>${calculationResult.dutyAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Customs Service Charge (CSC {calculationResult.cscRatePercent}% on CIF):</span>
                <span>${calculationResult.cscAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Health & Citizen Security Levy (HCSL {calculationResult.hcslRatePercent}% on CIF):</span>
                <span>${calculationResult.hcslAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Environmental Levy (ENV {calculationResult.envRatePercent}% on CIF):</span>
                <span>${calculationResult.envAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-300 font-semibold border-t border-emerald-800 pt-0.5">
                <span>• Landed Subtotal before VAT:</span>
                <span>${calculationResult.landedBeforeVat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>• VAT ({calculationResult.vatRatePercent}% on Landed Subtotal):</span>
                <span>${calculationResult.vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-amber-300 font-bold border-t border-emerald-800 pt-0.5">
                <span>Total Statutory Taxes & Duties:</span>
                <span>${calculationResult.totalDutiesAndTaxes.toFixed(2)}</span>
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
            <span>Apply Landed Cost (${calculationResult.totalLandedCost.toLocaleString()}) to Item</span>
          </button>
        </div>
      )}
    </div>
  );
};
