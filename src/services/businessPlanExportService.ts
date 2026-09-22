import { calculateGoodsPricing } from './goodsPricingService';
import { BudgetEvent, StartupPlanDetails, BusinessPlanSections } from '../types';
import {
  calculateMonthlyOperatingExpenses,
  generateStartupFinancialForecast,
  getServiceOfferingUnitLabel
} from './startupFinancialsService';

export interface BusinessPlanCalculations {
  costOfGoodsSoldUnit: number;
  sellingPrice: number;
  markupPercent: number;
  monthlyUnits: number;
  grossMarginPercent: number;
  monthlyRevenue: number;
  monthlyCOGS: number;
  monthlyGrossProfit: number;
  monthlyOpExpenses: number;
  monthlyNetOperatingProfit: number;
  y1Rev: number;
  y3Rev: number;
  y5Rev: number;
  y1COGS: number;
  y3COGS: number;
  y5COGS: number;
  y1Gross: number;
  y3Gross: number;
  y5Gross: number;
  y1OpEx: number;
  y3OpEx: number;
  y5OpEx: number;
  y1Net: number;
  y3Net: number;
  y5Net: number;
  netMarginPercent: number;
  materialsCostPerUnit: number;
  laborCostPerUnit: number;
  allocatedOverheadPerUnit: number;
  calculatedProfitPerUnit: number;
  preTaxSellingPrice: number;
  finalSuggestedPrice: number;
  contingencyPercent: number;
  includeVat: boolean;
  includeLevy: boolean;
  vatCost: number;
  levyCost: number;

  // Service Business & Advanced Model additions
  isServiceBusiness?: boolean;
  businessModelType?: 'goods' | 'services' | 'both';
  operatingModel?: 'mobile' | 'fixed' | 'hybrid';
  directCostPerUnit?: number;
  unitContributionMargin?: number;
  contributionMarginPercent?: number;
  breakEvenRevenueMonthly?: number;
  breakEvenUnitsMonthly?: number;
  breakEvenMetricLabel?: string;
  revenueUnitLabel?: string;
  ebitdaYear1?: number;
  ebitYear1?: number;
  depreciationYear1?: number;
  interestYear1?: number;
  currencySymbol?: string;
}

export const computeStartupCalculations = (sd?: StartupPlanDetails): BusinessPlanCalculations => {
  const isServices = sd?.businessModelType ? sd.businessModelType !== 'goods' : Boolean(sd?.serviceOfferings?.length);

  // Authoritative single-source operating expenses
  const opexData = calculateMonthlyOperatingExpenses(sd);
  const monthlyOpExpenses = opexData.totalMonthlyOperatingExpenses;

  // Check for equipment depreciation in Year 1
  const costItems = sd?.costItems || [];
  const equipmentItems = costItems.filter((i) => i.classification === 'equipment');
  const totalAnnualDepreciation = equipmentItems.reduce((sum, eq) => {
    const cost = eq.purchaseCost ?? eq.amount ?? 0;
    const res = eq.residualValue ?? 0;
    const life = Math.max(1, eq.usefulLifeYears ?? 3);
    return sum + ((cost - res) / life);
  }, 0);

  // Service and hybrid plans use the authoritative forecast engine so currency conversion,
  // month-over-month growth, financing, and annual targets remain consistent across the app and exports.
  {
    const activeCurrency = sd?.displayCurrency || 'USD';
    const activeRate = sd?.exchangeRate || 2.70;
    const forecast = generateStartupFinancialForecast(sd, activeCurrency, activeRate);
    const month1 = forecast.monthlyYear1[0];
    const y1 = forecast.yearlyProjections.find((p) => p.year === 1) || forecast.yearlyProjections[0];
    const y3 = forecast.yearlyProjections.find((p) => p.year === 3) || y1;
    const y5 = forecast.yearlyProjections.find((p) => p.year === 5) || y1;

    const serviceOfferings = sd?.serviceOfferings || [];
    const businessModelType = sd?.businessModelType || (isServices ? 'services' : 'goods');
    const useBlendedBookingBasis = businessModelType === 'services' && serviceOfferings.length > 1;
    const monthlyUnits = businessModelType === 'goods' ? (month1?.salesVolumeUnits || 0) : businessModelType === 'both'
      ? (month1?.salesVolumeUnits || 0) + (month1?.serviceBookingEquivalents || month1?.billableHoursOrJobs || 0)
      : (
          useBlendedBookingBasis
            ? (month1?.serviceBookingEquivalents || 0)
            : (month1?.billableHoursOrJobs || 0)
        );

    const monthlyRevenue = month1?.revenue || 0;
    const monthlyCOGS = month1?.cogs || 0;
    const monthlyGrossProfit = month1?.grossProfit || 0;
    const avgSellingPrice = monthlyUnits > 0 ? parseFloat((monthlyRevenue / monthlyUnits).toFixed(2)) : 0;
    const avgDirectCost = monthlyUnits > 0 ? parseFloat((monthlyCOGS / monthlyUnits).toFixed(2)) : 0;
    const unitContribMargin = parseFloat((avgSellingPrice - avgDirectCost).toFixed(2));
    const grossMarginPercent = monthlyRevenue > 0
      ? Math.round((monthlyGrossProfit / monthlyRevenue) * 100)
      : 0;
    const contribMarginPercent = grossMarginPercent;

    const unitLabels = Array.from(new Set(serviceOfferings.map((s) => getServiceOfferingUnitLabel(s))));
    const unitLabel = businessModelType === 'goods' ? 'Units Sold' : businessModelType === 'both'
      ? 'Combined Product & Service Units'
      : (
          useBlendedBookingBasis
            ? 'Blended Bookings / Sessions'
            : (unitLabels.length === 1 ? unitLabels[0] : 'Service Units')
        );

    const monthlyNetOperatingProfit = monthlyGrossProfit - monthlyOpExpenses;
    const netMarginPercent = monthlyRevenue > 0
      ? Math.round((monthlyNetOperatingProfit / monthlyRevenue) * 100)
      : 0;

    const y1Ebitda = y1 ? y1.grossProfit - y1.operatingExpenses : 0;
    const y3Ebitda = y3 ? y3.grossProfit - y3.operatingExpenses : 0;
    const y5Ebitda = y5 ? y5.grossProfit - y5.operatingExpenses : 0;

    const goodsPricing = calculateGoodsPricing(sd, monthlyOpExpenses);
    if (!isServices && sd?.goodsProducts?.length) {
      goodsPricing.preTaxSellingPrice = avgSellingPrice;
      goodsPricing.finalSuggestedPrice = avgSellingPrice;
      goodsPricing.calculatedProfitPerUnit = unitContribMargin;
      // Explicit product prices are entered before tax, with no inferred tax additions.
      goodsPricing.vatCost = 0;
      goodsPricing.levyCost = 0;
    }
    return {
      ...(!isServices ? goodsPricing : {}),
      costOfGoodsSoldUnit: avgDirectCost,
      sellingPrice: avgSellingPrice,
      markupPercent: avgDirectCost > 0
        ? parseFloat((((avgSellingPrice - avgDirectCost) / avgDirectCost) * 100).toFixed(1))
        : 0,
      monthlyUnits,
      grossMarginPercent,
      netMarginPercent,
      monthlyRevenue,
      monthlyCOGS,
      monthlyGrossProfit,
      monthlyOpExpenses,
      monthlyNetOperatingProfit,
      y1Rev: y1?.revenue || 0,
      y3Rev: y3?.revenue || 0,
      y5Rev: y5?.revenue || 0,
      y1COGS: y1?.cogs || 0,
      y3COGS: y3?.cogs || 0,
      y5COGS: y5?.cogs || 0,
      y1Gross: y1?.grossProfit || 0,
      y3Gross: y3?.grossProfit || 0,
      y5Gross: y5?.grossProfit || 0,
      y1OpEx: y1?.operatingExpenses || 0,
      y3OpEx: y3?.operatingExpenses || 0,
      y5OpEx: y5?.operatingExpenses || 0,
      // These legacy "*Net" fields historically represent operating profit / EBITDA.
      y1Net: y1Ebitda,
      y3Net: y3Ebitda,
      y5Net: y5Ebitda,
      materialsCostPerUnit: !isServices ? goodsPricing.materialsCostPerUnit : avgDirectCost,
      laborCostPerUnit: !isServices ? goodsPricing.laborCostPerUnit : 0,
      allocatedOverheadPerUnit: !isServices ? goodsPricing.allocatedOverheadPerUnit : 0,
      calculatedProfitPerUnit: !isServices ? goodsPricing.calculatedProfitPerUnit : unitContribMargin,
      preTaxSellingPrice: !isServices ? goodsPricing.preTaxSellingPrice : avgSellingPrice,
      finalSuggestedPrice: !isServices ? goodsPricing.finalSuggestedPrice : avgSellingPrice,
      contingencyPercent: !isServices ? goodsPricing.contingencyPercent : 0,
      includeVat: !!sd?.includeVat,
      includeLevy: !!sd?.includeLevy,
      vatCost: !isServices ? goodsPricing.vatCost : 0,
      levyCost: !isServices ? goodsPricing.levyCost : 0,

      isServiceBusiness: isServices,
      businessModelType,
      operatingModel: sd?.operatingModel || 'mobile',
      directCostPerUnit: avgDirectCost,
      unitContributionMargin: unitContribMargin,
      contributionMarginPercent: contribMarginPercent,
      breakEvenRevenueMonthly: forecast.breakEven.breakEvenRevenueMonthly,
      breakEvenUnitsMonthly: forecast.breakEven.breakEvenUnitsMonthly,
      breakEvenMetricLabel: forecast.breakEven.breakEvenMetricLabel || unitLabel,
      revenueUnitLabel: unitLabel,
      ebitdaYear1: y1Ebitda,
      ebitYear1: y1Ebitda - (y1?.depreciation || 0),
      depreciationYear1: y1?.depreciation ?? totalAnnualDepreciation,
      interestYear1: y1?.loanInterestExpense || 0,
      currencySymbol: activeCurrency === 'USD' ? 'US$' : 'EC$'
    };
  }


};

// Load the document engine only when the user requests a Word export.
export async function generateBusinessPlanDocx(project: BudgetEvent, calculations: BusinessPlanCalculations): Promise<Blob> {
  const { generateBusinessPlanDocx: generate } = await import('./businessPlanDocxService');
  return generate(project, calculations);
}
