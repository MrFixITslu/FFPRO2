import {
  StartupPlanDetails,
  ServiceOffering,
  LoanAmortizationSummary,
  CurrencyCode
} from '../types';
import {
  generateStartupFinancialForecast,
  calculateLoanAmortizationSchedule,
  calculateMonthlyOperatingExpenses,
  getServiceOfferingUnitLabel,
  roundCurrency
} from './startupFinancialsService';
import { computeStartupCalculations, BusinessPlanCalculations } from './businessPlanExportService';
import { getCurrencySymbol, formatCurrencyAmount, normalizeServiceOfferingToCurrency } from './currencyService';

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
  year5: {
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
    gracePeriodMonths?: number;
    gracePeriodType?: string;
    disbursementDate?: string;
    firstPaymentDate?: string;
    monthlyDebtService: number;
    monthlyDebtServiceFormatted: string;
    annualDebtService: number;
    annualDebtServiceFormatted: string;
    dscrYear1: number | null;
    dscrStatus: string;
    dscrBasis: string;
  };
}

export function buildBusinessPlanPresentation(
  details?: StartupPlanDetails,
  customCalcs?: BusinessPlanCalculations
): BusinessPlanPresentationModel {
  const calculations = customCalcs || computeStartupCalculations(details);
  const currencyCode: CurrencyCode = details?.displayCurrency || 'USD';
  const currencySymbol = getCurrencySymbol(currencyCode);
  const exchangeRate = details?.exchangeRate || 2.70;

  const isServiceBusiness = details?.businessModelType === 'services' || calculations.isServiceBusiness;
  const businessModelType = details?.businessModelType || (calculations.isServiceBusiness ? 'services' : 'goods');
  const operatingModel = details?.operatingModel || 'mobile';

  const fmt = (amt?: number) => formatCurrencyAmount(amt ?? 0, currencyCode);
  const forecast = generateStartupFinancialForecast(details, currencyCode, exchangeRate);
  const opexData = calculateMonthlyOperatingExpenses(details);

  // Revenue streams for service business, normalized into the active presentation currency.
  const revenueStreams: RevenueStreamPresentation[] = [];
  const offerings = (details?.serviceOfferings || []).map((s) =>
    normalizeServiceOfferingToCurrency(s, currencyCode, exchangeRate)
  );
  
  offerings.forEach((s) => {
    const vol = Math.max(0, s.expectedVolume ?? 0);
    const rate = Math.max(0, s.rate ?? 0);
    const direct = Math.max(0, s.directCostPerUnitOrJob ?? 0);
    const rev = vol * rate;
    const directTotal = vol * direct;
    const cm = rate - direct;
    const cmPct = rate > 0 ? Math.round((cm / rate) * 100) : 0;
    
    const defaultUnitLabel = getServiceOfferingUnitLabel(s);

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

  // Operating Expenses Breakdown — use the same authoritative ledger as the forecast/calculation layer.
  const operatingExpensesBreakdown: Array<{ name: string; amount: number; formatted: string }> =
    opexData.operatingExpensesBreakdown.map((item) => ({
      name: item.name,
      amount: item.amount,
      formatted: fmt(item.amount)
    }));

  // Calculate Loan summary if configured. Invalid/zero facilities stay non-crashing and are handled by validation.
  let loanPresentation: BusinessPlanPresentationModel['loan'] = undefined;
  if (details?.loanParameters && details.loanParameters.enabled) {
    const loanSummary: LoanAmortizationSummary | null =
      forecast.loanSummary ||
      calculateLoanAmortizationSchedule(
        details.loanParameters,
        currencyCode,
        exchangeRate,
        calculations.ebitdaYear1 ?? calculations.y1Net
      );

    if (loanSummary) {
      const principal = loanSummary.loanAmount;
      const negotiationFee = roundCurrency(
        details.loanParameters.negotiationFee ??
        ((principal * (details.loanParameters.negotiationFeePercent ?? 0)) / 100)
      );
      const insuranceFee = roundCurrency(
        details.loanParameters.insuranceFee ??
        ((principal * (details.loanParameters.insuranceFeePercent ?? 0)) / 100)
      );

      loanPresentation = {
        enabled: true,
        principal,
        principalFormatted: fmt(principal),
        negotiationFee,
        negotiationFeeFormatted: fmt(negotiationFee),
        insuranceFee,
        insuranceFeeFormatted: fmt(insuranceFee),
        totalFees: loanSummary.totalFees,
        totalFeesFormatted: fmt(loanSummary.totalFees),
        includeFeesInLoan: !!details.loanParameters.includeFeesInLoan,
        openingBalance: loanSummary.effectiveLoanAmount,
        openingBalanceFormatted: fmt(loanSummary.effectiveLoanAmount),
        annualInterestRate: details.loanParameters.annualInterestRate ?? 7.0,
        termYears: details.loanParameters.termYears ?? 5,
        paymentFrequency: details.loanParameters.paymentFrequency || 'monthly',
        gracePeriodMonths: details.loanParameters.gracePeriodMonths ?? 0,
        gracePeriodType: (details.loanParameters.gracePeriodMonths ?? 0) > 0
          ? (details.loanParameters.gracePeriodType === 'full_defer' ? 'full_defer' : 'interest_only')
          : 'none',
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
  }

  const baselineMonth = forecast.monthlyYear1[0];
  const useBlendedBookingBasis = businessModelType === 'services' && offerings.length > 1;
  const year1Volume = forecast.monthlyYear1.reduce((sum, month) => {
    if (businessModelType === 'both') {
      return sum + month.salesVolumeUnits + (month.serviceBookingEquivalents || month.billableHoursOrJobs);
    }
    if (isServiceBusiness) {
      return sum + (
        useBlendedBookingBasis
          ? (month.serviceBookingEquivalents || 0)
          : month.billableHoursOrJobs
      );
    }
    return sum + month.salesVolumeUnits;
  }, 0);
  const monthlyVolume = businessModelType === 'both'
    ? (baselineMonth?.salesVolumeUnits || 0) + (baselineMonth?.serviceBookingEquivalents || baselineMonth?.billableHoursOrJobs || 0)
    : (
        isServiceBusiness
          ? (
              useBlendedBookingBasis
                ? (baselineMonth?.serviceBookingEquivalents || 0)
                : (baselineMonth?.billableHoursOrJobs || 0)
            )
          : (baselineMonth?.salesVolumeUnits || 0)
      );
  const serviceLabels = Array.from(new Set(offerings.map((s) => getServiceOfferingUnitLabel(s))));
  const serviceVolumeLabel = useBlendedBookingBasis
    ? 'Blended Bookings / Sessions'
    : (serviceLabels.length === 1 ? serviceLabels[0] : 'Service Units');
  const resolvedVolumeLabel = businessModelType === 'both'
    ? 'Combined Product & Service Units'
    : (isServiceBusiness ? serviceVolumeLabel : 'Units Sold');

  // Headline metrics synthesis
  let headline: BusinessPlanPresentationModel['headline'];
  if (isServiceBusiness) {
    headline = {
      primaryMetricLabel: businessModelType === 'both'
        ? 'Blended Revenue per Unit'
        : (offerings.length === 1 ? 'Service Rate' : 'Average Service Unit Value'),
      primaryPrice: calculations.sellingPrice,
      primaryPriceFormatted: fmt(calculations.sellingPrice),
      primaryCostLabel: businessModelType === 'both' ? 'Blended Direct Cost per Unit' : 'Direct Cost per Service Unit',
      primaryCost: calculations.directCostPerUnit ?? calculations.costOfGoodsSoldUnit,
      primaryCostFormatted: fmt(calculations.directCostPerUnit ?? calculations.costOfGoodsSoldUnit),
      marginMetricLabel: 'Contribution Margin',
      marginMetricValue: calculations.unitContributionMargin ?? (calculations.sellingPrice - calculations.costOfGoodsSoldUnit),
      marginMetricFormatted: fmt(calculations.unitContributionMargin ?? (calculations.sellingPrice - calculations.costOfGoodsSoldUnit)),
      marginMetricPercent: calculations.contributionMarginPercent ?? calculations.grossMarginPercent,
      volumeMetricLabel: resolvedVolumeLabel,
      volumeMonthly: monthlyVolume,
      volumeYear1: year1Volume
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
      volumeMetricLabel: resolvedVolumeLabel,
      volumeMonthly: monthlyVolume,
      volumeYear1: year1Volume
    };
  }

  const projectionFor = (yearNumber: number) =>
    forecast.yearlyProjections.find((p) => p.year === yearNumber) ?? forecast.yearlyProjections[0]!;

  const toStatement = (projection: ReturnType<typeof projectionFor>) => {
    const ebitda = roundCurrency(projection.grossProfit - projection.operatingExpenses);
    const depreciation = roundCurrency(projection.depreciation || 0);
    const ebit = roundCurrency(ebitda - depreciation);
    const interest = roundCurrency(projection.loanInterestExpense || 0);
    const profitBeforeTax = roundCurrency(ebit - interest);
    const netProfit = roundCurrency(projection.netProfit);
    const netMarginPercent = projection.revenue > 0
      ? roundCurrency((netProfit / projection.revenue) * 100)
      : 0;
    return { ...projection, ebitda, depreciation, ebit, interest, profitBeforeTax, netProfit, netMarginPercent };
  };

  const y1 = toStatement(projectionFor(1));
  const y3 = toStatement(projectionFor(3));
  const y5 = toStatement(projectionFor(5));

  return {
    currencyCode,
    currencySymbol,
    isServiceBusiness,
    businessModelType,
    operatingModel,
    headline,
    revenueStreams,
    totalMonthlyRevenue: baselineMonth?.revenue ?? calculations.monthlyRevenue,
    totalMonthlyRevenueFormatted: fmt(baselineMonth?.revenue ?? calculations.monthlyRevenue),
    totalMonthlyDirectCosts: baselineMonth?.cogs ?? calculations.monthlyCOGS,
    totalMonthlyDirectCostsFormatted: fmt(baselineMonth?.cogs ?? calculations.monthlyCOGS),
    totalMonthlyGrossProfit: baselineMonth?.grossProfit ?? calculations.monthlyGrossProfit,
    totalMonthlyGrossProfitFormatted: fmt(baselineMonth?.grossProfit ?? calculations.monthlyGrossProfit),
    blendedGrossMarginPercent: baselineMonth?.grossMarginPercent ?? calculations.grossMarginPercent,
    operatingExpensesMonthly: opexData.totalMonthlyOperatingExpenses,
    operatingExpensesMonthlyFormatted: fmt(opexData.totalMonthlyOperatingExpenses),
    operatingExpensesYear1: opexData.totalAnnualOperatingExpenses,
    operatingExpensesYear1Formatted: fmt(opexData.totalAnnualOperatingExpenses),
    operatingExpensesBreakdown,
    year1: {
      revenue: y1.revenue,
      revenueFormatted: fmt(y1.revenue),
      cogs: y1.cogs,
      cogsFormatted: fmt(y1.cogs),
      grossProfit: y1.grossProfit,
      grossProfitFormatted: fmt(y1.grossProfit),
      operatingExpenses: y1.operatingExpenses,
      operatingExpensesFormatted: fmt(y1.operatingExpenses),
      ebitda: y1.ebitda,
      ebitdaFormatted: fmt(y1.ebitda),
      depreciation: y1.depreciation,
      depreciationFormatted: fmt(y1.depreciation),
      ebit: y1.ebit,
      ebitFormatted: fmt(y1.ebit),
      interest: y1.interest,
      interestFormatted: fmt(y1.interest),
      profitBeforeTax: y1.profitBeforeTax,
      profitBeforeTaxFormatted: fmt(y1.profitBeforeTax),
      netProfit: y1.netProfit,
      netProfitFormatted: fmt(y1.netProfit),
      netMarginPercent: y1.netMarginPercent
    },
    year3: {
      revenue: y3.revenue,
      revenueFormatted: fmt(y3.revenue),
      cogs: y3.cogs,
      cogsFormatted: fmt(y3.cogs),
      grossProfit: y3.grossProfit,
      grossProfitFormatted: fmt(y3.grossProfit),
      operatingExpenses: y3.operatingExpenses,
      operatingExpensesFormatted: fmt(y3.operatingExpenses),
      ebitda: y3.ebitda,
      ebitdaFormatted: fmt(y3.ebitda),
      depreciation: y3.depreciation,
      depreciationFormatted: fmt(y3.depreciation),
      ebit: y3.ebit,
      ebitFormatted: fmt(y3.ebit),
      interest: y3.interest,
      interestFormatted: fmt(y3.interest),
      profitBeforeTax: y3.profitBeforeTax,
      profitBeforeTaxFormatted: fmt(y3.profitBeforeTax),
      netProfit: y3.netProfit,
      netProfitFormatted: fmt(y3.netProfit),
      netMarginPercent: y3.netMarginPercent
    },
    year5: {
      revenue: y5.revenue,
      revenueFormatted: fmt(y5.revenue),
      cogs: y5.cogs,
      cogsFormatted: fmt(y5.cogs),
      grossProfit: y5.grossProfit,
      grossProfitFormatted: fmt(y5.grossProfit),
      operatingExpenses: y5.operatingExpenses,
      operatingExpensesFormatted: fmt(y5.operatingExpenses),
      ebitda: y5.ebitda,
      ebitdaFormatted: fmt(y5.ebitda),
      depreciation: y5.depreciation,
      depreciationFormatted: fmt(y5.depreciation),
      ebit: y5.ebit,
      ebitFormatted: fmt(y5.ebit),
      interest: y5.interest,
      interestFormatted: fmt(y5.interest),
      profitBeforeTax: y5.profitBeforeTax,
      profitBeforeTaxFormatted: fmt(y5.profitBeforeTax),
      netProfit: y5.netProfit,
      netProfitFormatted: fmt(y5.netProfit),
      netMarginPercent: y5.netMarginPercent
    },
    breakEven: {
      monthlyRevenue: forecast.breakEven.breakEvenRevenueMonthly,
      monthlyRevenueFormatted: fmt(forecast.breakEven.breakEvenRevenueMonthly),
      monthlyUnits: forecast.breakEven.breakEvenUnitsMonthly,
      metricLabel: forecast.breakEven.breakEvenMetricLabel || resolvedVolumeLabel,
      contributionMarginPercent: forecast.breakEven.averageContributionMarginPercent
    },
    loan: loanPresentation
  };
}
