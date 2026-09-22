import type { StartupPlanDetails } from '../types';

export function calculateGoodsPricing(sd: StartupPlanDetails | undefined, monthlyOpExpenses: number) {
  // Legacy goods pricing; zero inputs are intentional, and sales taxes are not revenue.
  const productionItems = sd?.productionItems || [];
  const derivedUnits = sd?.derivedUnits !== undefined ? sd.derivedUnits : 1;
  const hourlyRate = sd?.hourlyRate !== undefined ? sd.hourlyRate : 0;
  const laborHours = sd?.laborHours !== undefined ? sd.laborHours : 0;
  const desiredProfitType = sd?.desiredProfitType || 'percentage';
  const desiredProfitValue = sd?.desiredProfitValue !== undefined ? sd.desiredProfitValue : 0;
  const includeVat = !!sd?.includeVat;
  const includeLevy = !!sd?.includeLevy;
  const contingencyPercent = sd?.contingencyPercent !== undefined ? sd.contingencyPercent : 0;
  const allocateOverhead = !!sd?.allocateOverhead;

  const totalMaterialsCost = productionItems.reduce((sum, item) => sum + (item.cost || 0), 0);
  const materialsCostPerUnit = derivedUnits > 0 ? totalMaterialsCost / derivedUnits : 0;
  const contingencyCostPerUnit = materialsCostPerUnit * (contingencyPercent / 100);
  const finalMaterialsCostPerUnit = materialsCostPerUnit + contingencyCostPerUnit;

  const totalLaborCost = hourlyRate * laborHours;
  const laborCostPerUnit = derivedUnits > 0 ? totalLaborCost / derivedUnits : 0;

  const monthlyVolumeUnits = sd?.monthlyVolume ?? 0;
  const allocatedOverheadPerUnit = (allocateOverhead && monthlyVolumeUnits > 0) ? (monthlyOpExpenses / monthlyVolumeUnits) : 0;

  const hasDynamicCosting = productionItems.length > 0 || laborHours > 0 || allocateOverhead;
  // Direct unit cost excludes overhead, which is deducted separately in the P&L.
  const directCogsUnit = hasDynamicCosting ? parseFloat((finalMaterialsCostPerUnit + laborCostPerUnit).toFixed(2)) : (sd?.cogs ?? 0);
  // Pricing baseline unit cost (includes allocated overhead for full absorption pricing when requested)
  const pricingCogsUnit = parseFloat((directCogsUnit + allocatedOverheadPerUnit).toFixed(2));

  let calculatedProfitPerUnit = 0;
  if (!hasDynamicCosting) {
    calculatedProfitPerUnit = pricingCogsUnit * ((sd?.markup ?? 0) / 100);
  } else if (desiredProfitType === 'percentage') {
    calculatedProfitPerUnit = pricingCogsUnit * (desiredProfitValue / 100);
  } else {
    calculatedProfitPerUnit = desiredProfitValue;
  }
  calculatedProfitPerUnit = parseFloat(calculatedProfitPerUnit.toFixed(2));

  const preTaxSellingPrice = parseFloat((pricingCogsUnit + calculatedProfitPerUnit).toFixed(2));
  const levyCost = includeLevy ? parseFloat((preTaxSellingPrice * 0.025).toFixed(2)) : 0;
  const vatCost = includeVat ? parseFloat((preTaxSellingPrice * 0.125).toFixed(2)) : 0;
  const finalSuggestedPrice = parseFloat((preTaxSellingPrice + levyCost + vatCost).toFixed(2));

  const unitCostForPricing = hasDynamicCosting ? pricingCogsUnit : (sd?.cogs ?? 0);
  const markupPercent = hasDynamicCosting 
    ? (desiredProfitType === 'percentage' ? desiredProfitValue : parseFloat(((calculatedProfitPerUnit / (pricingCogsUnit || 1)) * 100).toFixed(1)))
    : (sd?.markup ?? 0);

  const sellingPrice = hasDynamicCosting ? preTaxSellingPrice : parseFloat((unitCostForPricing * (1 + markupPercent / 100)).toFixed(2));
  
  // In the P&L statement, COGS reflects direct variable production costs only.
  // Operating overhead is deducted separately in OpEx to prevent double-counting.
  const costOfGoodsSoldUnit = hasDynamicCosting ? directCogsUnit : (sd?.cogs ?? 0);

  return { costOfGoodsSoldUnit, sellingPrice, markupPercent, materialsCostPerUnit: finalMaterialsCostPerUnit, laborCostPerUnit, allocatedOverheadPerUnit, calculatedProfitPerUnit, preTaxSellingPrice, finalSuggestedPrice, contingencyPercent, includeVat, includeLevy, vatCost, levyCost };
}
