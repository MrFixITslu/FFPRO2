import {
  BusinessPlanSections,
  CurrencyCode,
  StartupCostItem,
  StartupPlanDetails
} from '../types';
import {
  generateStartupFinancialForecast,
  getServiceOfferingUnitLabel
} from './startupFinancialsService';
import { validateBusinessPlan } from './businessPlanValidationService';
import { normalizeCostItemAmount } from './currencyService';
import {
  BusinessCopilotContext,
  BusinessCopilotLocation
} from '../../shared/businessCopilotTypes';

function summarizeCostItem(
  item: StartupCostItem,
  targetCurrency: CurrencyCode,
  exchangeRate: number
) {
  return {
    id: item.id,
    name: item.name,
    classification: item.classification,
    category: item.category,
    currency: item.currency || targetCurrency,
    amount: normalizeCostItemAmount(item, targetCurrency, exchangeRate),
    directCostBasis: item.directCostBasis,
    notes: item.notes
  };
}

function pickNarrative(plan?: BusinessPlanSections) {
  if (!plan) return undefined;
  return {
    executiveSummary: plan.executiveSummary,
    businessDescription: plan.businessDescription,
    businessObjectives: plan.businessObjectives,
    problemOpportunity: plan.problemOpportunity,
    targetMarket: plan.targetMarket,
    customerProfile: plan.customerProfile,
    marketingSalesStrategy: plan.marketingSalesStrategy,
    operationsPlan: plan.operationsPlan,
    equipmentTechRequirements: plan.equipmentTechRequirements,
    managementStaffing: plan.managementStaffing,
    salesRevenueProjectionsNotes: plan.salesRevenueProjectionsNotes,
    operatingCostsNotes: plan.operatingCostsNotes,
    fundingRequirements: plan.fundingRequirements,
    useOfFunds: plan.useOfFunds,
    risksMitigation: plan.risksMitigation
  };
}

export function buildBusinessCopilotContext(
  startupDetails: StartupPlanDetails,
  location: BusinessCopilotLocation,
  options?: {
    projectId?: string;
    businessName?: string;
  }
): BusinessCopilotContext {
  const displayCurrency: CurrencyCode = startupDetails.displayCurrency || 'USD';
  const exchangeRate = startupDetails.exchangeRate || 2.70;
  const forecast = generateStartupFinancialForecast(
    startupDetails,
    displayCurrency,
    exchangeRate
  );
  const validation = validateBusinessPlan(startupDetails);

  const year = (yearNumber: number) =>
    forecast.yearlyProjections.find((item) => item.year === yearNumber);

  const mapMetric = (item: any) => item ? ({
    revenue: item.revenue,
    cogs: item.cogs,
    grossProfit: item.grossProfit,
    grossMarginPercent: item.grossMarginPercent,
    operatingExpenses: item.operatingExpenses,
    depreciation: item.depreciation,
    netProfit: item.netProfit,
    netMarginPercent: item.netMarginPercent,
    cashFlow: item.cashFlow,
    endingCashBalance: item.endingCashBalance
  }) : undefined;

  const month1 = forecast.monthlyYear1[0];
  const services = (startupDetails.serviceOfferings || []).map((service) => ({
    id: service.id,
    name: service.name,
    revenueModel: service.revenueModel,
    unitLabel: getServiceOfferingUnitLabel(service),
    currency: service.currency || displayCurrency,
    rate: service.rate || 0,
    expectedVolume: service.expectedVolume || 0,
    unitsPerBooking: service.unitsPerBooking,
    directCostPerUnitOrJob: service.directCostPerUnitOrJob,
    monthlyGrowthRatePercent: service.monthlyGrowthRatePercent
  }));

  const issues = validation.issues || [];
  const mapIssue = (issue: any) => ({
    id: issue.id,
    title: issue.title,
    message: issue.message,
    recommendation: issue.actionableRecommendation
  });

  const documents = (startupDetails.importedQuotes || []).map((quote) => ({
    id: quote.id,
    name: quote.savedFileName || quote.supplier || 'Supplier Quote',
    type: 'supplier_quote',
    date: quote.quoteDate,
    summary: [
      quote.supplier ? `Supplier: ${quote.supplier}` : '',
      quote.currency ? `Currency: ${quote.currency}` : '',
      quote.total !== undefined ? `Total: ${quote.total}` : ''
    ].filter(Boolean).join(' • ')
  }));

  return {
    projectId: options?.projectId,
    location,
    business: {
      name: options?.businessName || startupDetails.businessPlan?.companyName,
      businessModelType: startupDetails.businessModelType,
      operatingModel: startupDetails.operatingModel,
      displayCurrency,
      exchangeRate
    },
    services,
    costs: (startupDetails.costItems || []).map((item) =>
      summarizeCostItem(item, displayCurrency, exchangeRate)
    ),
    capacity: startupDetails.serviceCapacityPlan
      ? {
          staff: startupDetails.serviceCapacityPlan.staff as unknown as Record<string, unknown>,
          equipment: startupDetails.serviceCapacityPlan.equipment as unknown as Record<string, unknown>
        }
      : undefined,
    loan: startupDetails.loanParameters as unknown as Record<string, unknown> | undefined,
    forecast: {
      month1: month1 ? {
        ...mapMetric(month1),
        serviceBookingEquivalents: month1.serviceBookingEquivalents,
        billableHoursOrJobs: month1.billableHoursOrJobs,
        salesVolumeUnits: month1.salesVolumeUnits
      } : undefined,
      year1: mapMetric(year(1)),
      year3: mapMetric(year(3)),
      year5: mapMetric(year(5)),
      breakEven: forecast.breakEven
    },
    validation: {
      errors: issues.filter((issue: any) => issue.type === 'error').map(mapIssue),
      warnings: issues.filter((issue: any) => issue.type === 'warning').map(mapIssue),
      info: issues.filter((issue: any) => issue.type === 'info').map(mapIssue)
    },
    narrative: pickNarrative(startupDetails.businessPlan),
    documents
  };
}
