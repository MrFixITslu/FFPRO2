import {
  StartupPlanDetails,
  ServiceOffering,
  LoanAmortizationSummary,
  CurrencyCode
} from '../types';
import { generateStartupFinancialForecast, calculateLoanAmortizationSchedule } from './startupFinancialsService';
import { computeStartupCalculations, BusinessPlanCalculations } from './businessPlanExportService';
import { getCurrencySymbol, formatCurrencyAmount } from './currencyService';

export interface RevenueStreamPresentation {
  id: string;
  name: string;
  revenueModel: string;
  unitLabel: string;
  rate: number;
  rateFormatted: string;
  monthlyVolume: number;
  monthlyRevenue: number;
  monthlyRevenueFormatted: string;
  directCostPerUnit: number;
  directCostPerUnitFormatted: string;
  monthlyDirectCost: number;
  monthlyDirectCostFormatted: string;
  contributionMargin: number;
  contributionMarginFormatted: string;
  contributionMarginPercent: number;
}

export interface BusinessPlanPresentationModel {
  currencyCode: CurrencyCode;
  currencySymbol: string;
  isServiceBusiness: boolean;
  businessModelType: 'goods' | 'services' | 'both';
  operatingModel: string;
  
  // Headline Metrics
  headline: {
    primaryMetricLabel: string;
    primaryPrice: number;
    primaryPriceFormatted: string;
    
    primaryCostLabel: string;
    primaryCost: number;
    primaryCostFormatted: string;
    
    marginMetricLabel: string;
    marginMetricValue: number;
    marginMetricFormatted: string;
    marginMetricPercent: number;
    
    volumeMetricLabel: string;
    volumeMonthly: number;
    volumeYear1: number;
  };

  // Revenue Streams
  revenueStreams: RevenueStreamPresentation[];
  totalMonthlyRevenue: number;
  totalMonthlyRevenueFormatted: string;
  totalMonthlyDirectCosts: number;
  totalMonthlyDirectCostsFormatted: string;
  totalMonthlyGrossProfit: number;
  totalMonthlyGrossProfitFormatted: string;
  blendedGrossMarginPercent: number;

  // Operating Expenses
  operatingExpensesMonthly: number;
  operatingExpensesMonthlyFormatted: string;
  operatingExpensesYear1: number;
  operatingExpensesYear1Formatted: string;
  operatingExpensesBreakdown: Array<{ name: string; amount: number; formatted: string }>;

  // Projections
  year1: {
    revenue: number;
    revenueFormatted: string;
    cogs: number;
    cogsFormatted: string;
    grossProfit: number;
    grossProfitFormatted: string;
    operatingExpenses: number;
    operatingExpensesFormatted: string;
    ebitda: number;
    ebitdaFormatted: string;
    depreciation: number;
    depreciationFormatted: string;
    ebit: number;
    ebitFormatted: string;
    interest: number;
    interestFormatted: string;
    profitBeforeTax: number;
    profitBeforeTaxFormatted: string;
    netProfit: number;
    netProfitFormatted: string;
    netMarginPercent: number;
  };
  year3: {
    revenue: number;
    revenueFormatted: string;
    grossProfit: number;
    grossProfitFormatted: string;
    netProfit: number;
    netProfitFormatted: string;
  };
  year5: {
    revenue: number;
    revenueFormatted: string;
    grossProfit: number;
    grossProfitFormatted: string;
    netProfit: number;
    netProfitFormatted: string;
  };

  // Break-even
  breakEven: {
    monthlyRevenue: number;
    monthlyRevenueFormatted: string;
    monthlyUnits: number;
    metricLabel: string;
    contributionMarginPercent: number;
  };

  // Loan & Capitalization
  loan?: {
    enabled: boolean;
    principal: number;
    principalFormatted: string;
    negotiationFee: number;
    negotiationFeeFormatted: string;
    insuranceFee: number;
    insuranceFeeFormatted: string;
    totalFees: number;
    totalFeesFormatted: string;
    includeFeesInLoan: boolean;
    openingBalance: number;
    openingBalanceFormatted: string;
    annualInterestRate: number;
    termYears: number;
    paymentFrequency: string;
    disbursementDate?: string;
    firstPaymentDate?: string;
    monthlyDebtService: number;
    monthlyDebtServiceFormatted: string;
    annualDebtService: number;
    annualDebtServiceFormatted: string;
    dscrYear1: number;
    dscrStatus: string;
    dscrBasis: string;
  };
}

export function buildBusinessPlanPresentation(
  details?: StartupPlanDetails,
  customCalcs?: BusinessPlanCalculations
): BusinessPlanPresentationModel {
  const calculations = customCalcs || computeStartupCalculations(details);
  const currencyCode: CurrencyCode = details?.displayCurrency || 'XCD';
  const currencySymbol = getCurrencySymbol(currencyCode);
  const exchangeRate = details?.exchangeRate || 2.70;

  const isServiceBusiness = details?.businessModelType === 'services' || calculations.isServiceBusiness;
  const businessModelType = details?.businessModelType || 'services';
  const operatingModel = details?.operatingModel || 'mobile';

  const fmt = (amt?: number) => formatCurrencyAmount(amt || 0, currencyCode);

  // Revenue streams for service business
  const revenueStreams: RevenueStreamPresentation[] = [];
  const offerings = details?.serviceOfferings || [];
  
  offerings.forEach((s) => {
    const vol = s.expectedVolume || 10;
    const rate = s.rate || 0;
    const direct = s.directCostPerUnitOrJob || 0;
    const rev = vol * rate;
    const directTotal = vol * direct;
    const cm = rate - direct;
    const cmPct = rate > 0 ? Math.round((cm / rate) * 100) : 0;
    
    let defaultUnitLabel = 'Bookings';
    if (s.unitLabel) defaultUnitLabel = s.unitLabel;
    else if (s.revenueModel === 'hourly') defaultUnitLabel = 'Billable Hours';
    else if (s.revenueModel === 'retainer') defaultUnitLabel = 'Retained Clients';
    else if (s.revenueModel === 'subscription') defaultUnitLabel = 'Subscribers';
    else if (s.revenueModel === 'rental') defaultUnitLabel = 'Rental Days';
    else if (s.revenueModel === 'event') defaultUnitLabel = 'Events';
    else if (s.revenueModel === 'package') defaultUnitLabel = 'Packages';
    else if (s.revenueModel === 'per_participant') defaultUnitLabel = 'Participants';

    revenueStreams.push({
      id: s.id,
      name: s.name,
      revenueModel: s.revenueModel,
      unitLabel: defaultUnitLabel,
      rate,
      rateFormatted: fmt(rate),
      monthlyVolume: vol,
      monthlyRevenue: rev,
      monthlyRevenueFormatted: fmt(rev),
      directCostPerUnit: direct,
      directCostPerUnitFormatted: fmt(direct),
      monthlyDirectCost: directTotal,
      monthlyDirectCostFormatted: fmt(directTotal),
      contributionMargin: cm,
      contributionMarginFormatted: fmt(cm),
      contributionMarginPercent: cmPct
    });
  });

  // Operating Expenses Breakdown
  const rent = details?.rent || 0;
  const salaries = details?.salaries || 0;
  const marketing = details?.marketing || 0;
  const utilities = details?.utilities || 0;
  const other = details?.otherExpenses || 0;
  
  const operatingExpensesBreakdown: Array<{ name: string; amount: number; formatted: string }> = [];
  if (rent > 0) operatingExpensesBreakdown.push({ name: 'Facility Rent / Lease', amount: rent, formatted: fmt(rent) });
  if (salaries > 0) operatingExpensesBreakdown.push({ name: 'Management & Staff Salaries', amount: salaries, formatted: fmt(salaries) });
  if (marketing > 0) operatingExpensesBreakdown.push({ name: 'Advertising & Marketing', amount: marketing, formatted: fmt(marketing) });
  if (utilities > 0) operatingExpensesBreakdown.push({ name: 'Utilities & Internet', amount: utilities, formatted: fmt(utilities) });
  if (other > 0) operatingExpensesBreakdown.push({ name: 'Other Fixed Administrative Expenses', amount: other, formatted: fmt(other) });

  (details?.customExpenses || []).forEach(exp => {
    if (exp.amount > 0) {
      operatingExpensesBreakdown.push({ name: exp.name || 'Miscellaneous Operating Cost', amount: exp.amount, formatted: fmt(exp.amount) });
    }
  });

  // Calculate Loan summary if configured
  let loanPresentation: BusinessPlanPresentationModel['loan'] = undefined;
  if (details?.loanParameters && details.loanParameters.enabled) {
    const loanSummary: LoanAmortizationSummary = calculateLoanAmortizationSchedule(
      details.loanParameters,
      currencyCode,
      exchangeRate,
      calculations.ebitdaYear1 || calculations.y1Net
    );

    loanPresentation = {
      enabled: true,
      principal: loanSummary.loanAmount,
      principalFormatted: fmt(loanSummary.loanAmount),
      negotiationFee: details.loanParameters.negotiationFee || 0,
      negotiationFeeFormatted: fmt(details.loanParameters.negotiationFee || 0),
      insuranceFee: details.loanParameters.insuranceFee || 0,
      insuranceFeeFormatted: fmt(details.loanParameters.insuranceFee || 0),
      totalFees: loanSummary.totalFees,
      totalFeesFormatted: fmt(loanSummary.totalFees),
      includeFeesInLoan: !!details.loanParameters.includeFeesInLoan,
      openingBalance: loanSummary.effectiveLoanAmount,
      openingBalanceFormatted: fmt(loanSummary.effectiveLoanAmount),
      annualInterestRate: details.loanParameters.annualInterestRate || 7.0,
      termYears: details.loanParameters.termYears || 5,
      paymentFrequency: details.loanParameters.paymentFrequency || 'monthly',
      disbursementDate: details.loanParameters.disbursementDate,
      firstPaymentDate: details.loanParameters.firstPaymentDate || details.loanParameters.startDate,
      monthlyDebtService: loanSummary.monthlyDebtService,
      monthlyDebtServiceFormatted: fmt(loanSummary.monthlyDebtService),
      annualDebtService: loanSummary.annualDebtService,
      annualDebtServiceFormatted: fmt(loanSummary.annualDebtService),
      dscrYear1: loanSummary.dscrYear1,
      dscrStatus: loanSummary.dscrStatus,
      dscrBasis: 'EBITDA'
    };
  }

  // Headline metrics synthesis
  let headline: BusinessPlanPresentationModel['headline'];
  if (isServiceBusiness) {
    headline = {
      primaryMetricLabel: offerings.length === 1 ? 'Service Rate' : 'Average Booking Value',
      primaryPrice: calculations.sellingPrice,
      primaryPriceFormatted: fmt(calculations.sellingPrice),
      primaryCostLabel: 'Direct Cost per Unit',
      primaryCost: calculations.directCostPerUnit || calculations.costOfGoodsSoldUnit,
      primaryCostFormatted: fmt(calculations.directCostPerUnit || calculations.costOfGoodsSoldUnit),
      marginMetricLabel: 'Contribution Margin',
      marginMetricValue: calculations.unitContributionMargin || (calculations.sellingPrice - calculations.costOfGoodsSoldUnit),
      marginMetricFormatted: fmt(calculations.unitContributionMargin || (calculations.sellingPrice - calculations.costOfGoodsSoldUnit)),
      marginMetricPercent: calculations.contributionMarginPercent || calculations.grossMarginPercent,
      volumeMetricLabel: calculations.revenueUnitLabel || 'Monthly Sessions / Bookings',
      volumeMonthly: calculations.monthlyUnits,
      volumeYear1: calculations.monthlyUnits * 12
    };
  } else {
    headline = {
      primaryMetricLabel: 'Retail Unit Price',
      primaryPrice: calculations.sellingPrice,
      primaryPriceFormatted: fmt(calculations.sellingPrice),
      primaryCostLabel: 'Unit COGS',
      primaryCost: calculations.costOfGoodsSoldUnit,
      primaryCostFormatted: fmt(calculations.costOfGoodsSoldUnit),
      marginMetricLabel: 'Gross Margin',
      marginMetricValue: calculations.sellingPrice - calculations.costOfGoodsSoldUnit,
      marginMetricFormatted: fmt(calculations.sellingPrice - calculations.costOfGoodsSoldUnit),
      marginMetricPercent: calculations.grossMarginPercent,
      volumeMetricLabel: 'Monthly Units Sold',
      volumeMonthly: calculations.monthlyUnits,
      volumeYear1: calculations.monthlyUnits * 12
    };
  }

  const annualInterest = loanPresentation ? (loanPresentation.annualDebtService - (loanPresentation.principal / (loanPresentation.termYears || 5))) : 0;
  const year1Deprec = calculations.depreciationYear1 || 0;
  const year1Ebitda = calculations.ebitdaYear1 !== undefined ? calculations.ebitdaYear1 : calculations.y1Net;
  const year1Ebit = calculations.ebitYear1 !== undefined ? calculations.ebitYear1 : (year1Ebitda - year1Deprec);
  const year1ProfitBeforeTax = year1Ebit - Math.max(0, annualInterest);
  const year1NetProfit = calculations.y1Net;

  return {
    currencyCode,
    currencySymbol,
    isServiceBusiness,
    businessModelType,
    operatingModel,
    headline,
    revenueStreams,
    totalMonthlyRevenue: calculations.monthlyRevenue,
    totalMonthlyRevenueFormatted: fmt(calculations.monthlyRevenue),
    totalMonthlyDirectCosts: calculations.monthlyCOGS,
    totalMonthlyDirectCostsFormatted: fmt(calculations.monthlyCOGS),
    totalMonthlyGrossProfit: calculations.monthlyGrossProfit,
    totalMonthlyGrossProfitFormatted: fmt(calculations.monthlyGrossProfit),
    blendedGrossMarginPercent: calculations.grossMarginPercent,
    operatingExpensesMonthly: calculations.monthlyOpExpenses,
    operatingExpensesMonthlyFormatted: fmt(calculations.monthlyOpExpenses),
    operatingExpensesYear1: calculations.y1OpEx,
    operatingExpensesYear1Formatted: fmt(calculations.y1OpEx),
    operatingExpensesBreakdown,
    year1: {
      revenue: calculations.y1Rev,
      revenueFormatted: fmt(calculations.y1Rev),
      cogs: calculations.y1COGS,
      cogsFormatted: fmt(calculations.y1COGS),
      grossProfit: calculations.y1Gross,
      grossProfitFormatted: fmt(calculations.y1Gross),
      operatingExpenses: calculations.y1OpEx,
      operatingExpensesFormatted: fmt(calculations.y1OpEx),
      ebitda: year1Ebitda,
      ebitdaFormatted: fmt(year1Ebitda),
      depreciation: year1Deprec,
      depreciationFormatted: fmt(year1Deprec),
      ebit: year1Ebit,
      ebitFormatted: fmt(year1Ebit),
      interest: Math.max(0, annualInterest),
      interestFormatted: fmt(Math.max(0, annualInterest)),
      profitBeforeTax: year1ProfitBeforeTax,
      profitBeforeTaxFormatted: fmt(year1ProfitBeforeTax),
      netProfit: year1NetProfit,
      netProfitFormatted: fmt(year1NetProfit),
      netMarginPercent: calculations.netMarginPercent
    },
    year3: {
      revenue: calculations.y3Rev,
      revenueFormatted: fmt(calculations.y3Rev),
      grossProfit: calculations.y3Gross,
      grossProfitFormatted: fmt(calculations.y3Gross),
      netProfit: calculations.y3Net,
      netProfitFormatted: fmt(calculations.y3Net)
    },
    year5: {
      revenue: calculations.y5Rev,
      revenueFormatted: fmt(calculations.y5Rev),
      grossProfit: calculations.y5Gross,
      grossProfitFormatted: fmt(calculations.y5Gross),
      netProfit: calculations.y5Net,
      netProfitFormatted: fmt(calculations.y5Net)
    },
    breakEven: {
      monthlyRevenue: calculations.breakEvenRevenueMonthly,
      monthlyRevenueFormatted: fmt(calculations.breakEvenRevenueMonthly),
      monthlyUnits: calculations.breakEvenUnitsMonthly,
      metricLabel: calculations.breakEvenMetricLabel || 'Bookings',
      contributionMarginPercent: calculations.contributionMarginPercent || calculations.grossMarginPercent
    },
    loan: loanPresentation
  };
}
