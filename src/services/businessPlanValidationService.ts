import {
  StartupPlanDetails,
  BusinessPlanSections
} from '../types';
import { computeStartupCalculations, BusinessPlanCalculations } from './businessPlanExportService';
import {
  generateStartupFinancialForecast,
  calculateLoanAmortizationSchedule,
  calculateMonthlyOperatingExpenses,
  calculateServiceCapacity,
  getServiceOfferingUnitLabel,
  roundCurrency
} from './startupFinancialsService';

export type BusinessPlanReadinessStatus = 'draft' | 'needs_review' | 'ready_for_financial_review' | 'bank_ready';

export interface ValidationIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'model' | 'pricing' | 'capacity' | 'loan' | 'narrative' | 'forecast';
  title: string;
  message: string;
  fieldKey?: keyof BusinessPlanSections;
  actionableRecommendation?: string;
}

export interface BusinessPlanValidationResult {
  status: BusinessPlanReadinessStatus;
  statusLabel: string;
  score: number; // 0 - 100
  completedSectionsCount: number;
  totalSectionsCount: number;
  completionPercent: number;
  issues: ValidationIssue[];
  hasBlockingErrors: boolean;
  warningsCount: number;
  narrativeFinancialDiscrepancies: string[];
}

export const ALL_BUSINESS_PLAN_SECTION_KEYS: (keyof BusinessPlanSections)[] = [
  'executiveSummary', 'businessDescription', 'businessObjectives', 'problemOpportunity',
  'targetMarket', 'customerProfile', 'marketAnalysis', 'competitorAnalysis', 'competitiveAdvantage',
  'productsServices', 'businessModel', 'revenueModel', 'marketingSalesStrategy', 'operationsPlan',
  'equipmentTechRequirements', 'suppliers', 'managementStaffing', 'startupRequirements',
  'financialRequirements', 'salesRevenueProjectionsNotes', 'operatingCostsNotes', 'fundingRequirements',
  'useOfFunds', 'implementationPlan', 'milestonesNotes', 'risksMitigation', 'conclusion'
];

export function validateBusinessPlan(
  details?: StartupPlanDetails,
  customCalcs?: BusinessPlanCalculations
): BusinessPlanValidationResult {
  const issues: ValidationIssue[] = [];
  const narrativeDiscrepancies: string[] = [];

  const bp: BusinessPlanSections = details?.businessPlan || {};
  const calculations = customCalcs || computeStartupCalculations(details);
  const isServices =
    details?.businessModelType === 'services' ||
    details?.businessModelType === 'both' ||
    calculations.isServiceBusiness;

  // 1. Check Section Narrative Completeness
  let completedSectionsCount = 0;
  ALL_BUSINESS_PLAN_SECTION_KEYS.forEach((key) => {
    const content = (bp[key] || '').trim();
    if (content.length > 25) {
      completedSectionsCount++;
    }
  });

  const totalSectionsCount = ALL_BUSINESS_PLAN_SECTION_KEYS.length;
  const completionPercent = Math.round((completedSectionsCount / totalSectionsCount) * 100);

  // 2. Business Model & Operating Model Checks
  if (!details?.businessModelType) {
    issues.push({
      id: 'missing-business-model',
      type: 'error',
      category: 'model',
      title: 'Business Model Unspecified',
      message: 'The business model (services, goods, or hybrid) must be selected for accurate financial underwriting.',
      actionableRecommendation: 'Select Services, Goods, or Hybrid in the Business Details panel.'
    });
  }

  if (isServices && !details?.operatingModel) {
    issues.push({
      id: 'missing-operating-model',
      type: 'info',
      category: 'model',
      title: 'Operating Model Defaulted',
      message: 'Operating model is currently defaulting to Mobile / On-site.',
      actionableRecommendation: 'Specify Mobile, Fixed Facility, or Hybrid in the Services Workflow panel.'
    });
  }

  // 3. Service / Goods Product Line Checks
  if (isServices) {
    const offerings = details?.serviceOfferings || [];
    if (offerings.length === 0) {
      issues.push({
        id: 'no-service-offerings',
        type: 'error',
        category: 'pricing',
        title: 'No Service Offerings Defined',
        message: 'No service offerings or rate tiers have been configured.',
        actionableRecommendation: 'Add at least one service offering with a rate, service-unit label, and monthly volume.'
      });
    } else {
      offerings.forEach((s, idx) => {
        const unitLabel = getServiceOfferingUnitLabel(s);
        if (!s.rate || s.rate <= 0) {
          issues.push({
            id: `service-rate-zero-${idx}`,
            type: 'error',
            category: 'pricing',
            title: `Zero Rate on "${s.name || `Service #${idx + 1}`}"`,
            message: `Service offerings must have a billable rate greater than zero per ${unitLabel.toLowerCase()}.`,
            actionableRecommendation: `Set a positive pricing rate for each ${unitLabel.toLowerCase()}.`
          });
        }
        if (s.expectedVolume === undefined || s.expectedVolume === null || s.expectedVolume <= 0) {
          issues.push({
            id: `service-volume-zero-${idx}`,
            type: 'warning',
            category: 'pricing',
            title: `Zero Volume on "${s.name || `Service #${idx + 1}`}"`,
            message: `Monthly ${unitLabel.toLowerCase()} volume is 0, so this offering contributes no projected revenue.`,
            actionableRecommendation: `Specify the target monthly number of ${unitLabel.toLowerCase()}.`
          });
        }

        const serviceLevelCost = Math.max(0, s.directCostPerUnitOrJob ?? 0);
        if (s.rate > 0 && serviceLevelCost >= s.rate) {
          const serviceCurrency = s.currency || details?.displayCurrency || 'USD';
          const serviceCurrencySymbol = serviceCurrency === 'XCD' ? 'EC$' : 'US$';

          issues.push({
            id: `service-unit-cost-exceeds-rate-${idx}`,
            type: 'error',
            category: 'pricing',
            title: `Service-Level Cost Eliminates Margin on "${s.name || `Service #${idx + 1}`}"`,
            message: `The service-level variable cost (${serviceCurrencySymbol}${serviceLevelCost.toFixed(2)}) is greater than or equal to the billing rate (${serviceCurrencySymbol}${s.rate.toFixed(2)}).`,
            actionableRecommendation: 'Set this field to only the package-specific cost per billed unit. Shared staff/transport costs should be entered once in the direct-cost ledger using a per-booking basis.'
          });
        }

        if ((s.monthlyGrowthRatePercent ?? 0) > 0) {
          issues.push({
            id: `service-monthly-growth-active-${idx}`,
            type: 'info',
            category: 'forecast',
            title: `Monthly Growth Active on "${s.name || `Service #${idx + 1}`}"`,
            message: `This offering is set to grow ${s.monthlyGrowthRatePercent}% every month during Year 1, so the annual forecast is higher than 12 × the starting monthly volume.`,
            actionableRecommendation: 'Keep Year 1 monthly growth at 0% unless this ramp is intentional; longer-term Year 3 and Year 5 growth targets are modeled separately.'
          });
        }
      });
    }

    if (calculations.markupPercent > 500 && calculations.costOfGoodsSoldUnit > 0) {
      issues.push({
        id: 'high-service-markup',
        type: 'info',
        category: 'pricing',
        title: 'High Contribution Margin Ratio',
        message: `Calculated service contribution margin is ${calculations.contributionMarginPercent}%. Ensure direct labor and service-specific variable expenses are captured.`,
        actionableRecommendation: 'Review direct labor, consumables, and other job-specific costs for each service unit.'
      });
    }

    // Only compare demand with capacity when the user explicitly configured capacity,
    // and compare compatible units rather than mixing participants/projects with fleet-days.
    if (details?.serviceCapacityPlan) {
      const capacity = calculateServiceCapacity(details.serviceCapacityPlan);
      const hourlyDemand = offerings
        .filter((o) => o.revenueModel === 'hourly')
        .reduce((sum, o) => sum + Math.max(0, o.expectedVolume ?? 0), 0);
      if (capacity.staff.enabled && hourlyDemand > capacity.staff.effectiveHours) {
        issues.push({
          id: 'staff-capacity-demand-mismatch',
          type: 'warning',
          category: 'capacity',
          title: 'Hourly Demand Exceeds Billable Staff Capacity',
          message: `Planned billable hours (${hourlyDemand}/month) exceed effective staff capacity (${capacity.staff.effectiveHours}/month).`,
          actionableRecommendation: 'Increase billable staff capacity, utilisation assumptions, or reduce planned hourly volume.'
        });
      }

      if (capacity.equipment.enabled && capacity.equipment.revenueTreatment === 'independent_revenue') {
        const rentalDemand = offerings
          .filter((o) => o.revenueModel === 'rental')
          .reduce((sum, o) => sum + Math.max(0, o.expectedVolume ?? 0), 0);
        if (rentalDemand > capacity.equipment.effectiveDays) {
          issues.push({
            id: 'equipment-rental-capacity-demand-mismatch',
            type: 'warning',
            category: 'capacity',
            title: 'Rental Demand Exceeds Effective Equipment Capacity',
            message: `Planned rental volume (${rentalDemand} rental days/month) exceeds effective equipment capacity (${capacity.equipment.effectiveDays} rental days/month).`,
            actionableRecommendation: 'Increase equipment availability/utilisation or reduce planned rental-day volume.'
          });
        }
      }

      if (capacity.equipment.enabled && capacity.equipment.revenueTreatment === 'capacity_only') {
        const linkedServiceId =
          details.serviceCapacityPlan?.equipment?.capacityServiceOfferingId ||
          (offerings.length === 1 ? offerings[0]?.id : undefined);
        const linkedService = offerings.find((o) => o.id === linkedServiceId);

        if (linkedService) {
          const plannedUnits = Math.max(0, linkedService.expectedVolume ?? 0);
          const unitLabel = getServiceOfferingUnitLabel(linkedService);
          if (capacity.equipment.maxServiceUnits > 0 && plannedUnits > capacity.equipment.maxServiceUnits) {
            issues.push({
              id: 'equipment-service-capacity-demand-mismatch',
              type: 'error',
              category: 'capacity',
              title: 'Planned Service Volume Exceeds Equipment Time Capacity',
              message: `Planned volume for "${linkedService.name}" is ${plannedUnits} ${unitLabel}/month, above the configured maximum of ${capacity.equipment.maxServiceUnits} ${unitLabel}/month.`,
              actionableRecommendation: 'Increase operating days/hours, add deployable systems, shorten service duration, or reduce planned monthly volume.'
            });
          } else if (
            capacity.equipment.effectiveServiceUnits > 0 &&
            plannedUnits > capacity.equipment.effectiveServiceUnits
          ) {
            issues.push({
              id: 'equipment-service-capacity-above-target-utilisation',
              type: 'warning',
              category: 'capacity',
              title: 'Planned Service Volume Exceeds Target Utilisation',
              message: `Planned volume for "${linkedService.name}" is ${plannedUnits} ${unitLabel}/month versus ${capacity.equipment.effectiveServiceUnits} ${unitLabel}/month at the configured ${capacity.equipment.targetUtilisationPercent}% utilisation target.`,
              actionableRecommendation: 'Raise the utilisation assumption only if operations can support it, or revise the monthly service-volume target.'
            });
          }
        }
      }
    }
  }

  // 4. Loan & Financing Sanity Checks
  if (details?.loanParameters && details.loanParameters.enabled) {
    const lp = details.loanParameters;
    if (lp.loanAmount <= 0) {
      issues.push({
        id: 'loan-zero-amount',
        type: 'error',
        category: 'loan',
        title: 'Loan Amount Must Be Greater Than Zero',
        message: `The commercial credit facility is enabled but has a ${calculations.currencySymbol || 'EC$'}0 principal balance.`,
        actionableRecommendation: 'Enter the requested loan principal amount in Loan Amortization.'
      });
    }

    if (lp.termYears <= 0 || lp.annualInterestRate < 0) {
      issues.push({
        id: 'loan-invalid-terms',
        type: 'error',
        category: 'loan',
        title: 'Invalid Loan Terms',
        message: 'Loan term must be at least 1 year and interest rate cannot be negative.',
        actionableRecommendation: 'Set valid loan tenure and interest rate.'
      });
    }

    const firstDate = lp.firstPaymentDate || lp.startDate;
    if (firstDate && isNaN(Date.parse(firstDate))) {
      issues.push({
        id: 'loan-invalid-date',
        type: 'error',
        category: 'loan',
        title: 'Invalid First Payment Date',
        message: 'The loan first payment date is not a valid calendar date format.',
        actionableRecommendation: 'Select a valid date for loan disbursement/payment.'
      });
    }

    const loanSummary = calculateLoanAmortizationSchedule(
      lp,
      details.displayCurrency || 'XCD',
      details.exchangeRate || 2.70,
      calculations.ebitdaYear1 ?? calculations.y1Net
    );

    if (loanSummary) {
      if (loanSummary.dscrStatus === 'insufficient') {
        issues.push({
          id: 'loan-dscr-insufficient',
          type: 'error',
          category: 'loan',
          title: 'DSCR Below 1.0x (Insufficient Debt Service Coverage)',
          message: `Year 1 simplified DSCR is ${loanSummary.dscrYear1.toFixed(2)}x using EBITDA / scheduled debt service.`,
          actionableRecommendation: 'Increase revenue, trim operating overhead, increase equity/grant funding, or revise loan terms.'
        });
      } else if (loanSummary.dscrStatus === 'tight') {
        issues.push({
          id: 'loan-dscr-tight',
          type: 'warning',
          category: 'loan',
          title: 'DSCR Tight (<1.25x Screening Threshold)',
          message: `Year 1 simplified DSCR is ${loanSummary.dscrYear1.toFixed(2)}x using EBITDA / scheduled debt service. Lender-specific thresholds may differ.`,
          actionableRecommendation: 'Review the lender-specific DSCR requirement and consider more equity, lower debt, or revised repayment terms.'
        });
      }
    }
  }

  // 5. Operating Expenses Reconciliation Rule
  const opexData = calculateMonthlyOperatingExpenses(details);
  const sumBreakdown = roundCurrency(opexData.operatingExpensesBreakdown.reduce((sum, item) => sum + item.amount, 0));
  const forecast = generateStartupFinancialForecast(
    details,
    details?.displayCurrency || 'USD',
    details?.exchangeRate || 2.70
  );
  const forecastMonthlyOpEx = forecast.monthlyYear1[0]?.recurringExpenses ?? 0;
  const calcMonthlyOpEx = calculations.monthlyOpExpenses ?? 0;

  if (Math.abs(sumBreakdown - forecastMonthlyOpEx) > 1.0 || Math.abs(sumBreakdown - calcMonthlyOpEx) > 1.0) {
    issues.push({
      id: 'opex-reconciliation-mismatch',
      type: 'error',
      category: 'forecast',
      title: 'Operating Expense Reconciliation Discrepancy',
      message: `The sum of recurring operating expense rows (${calculations.currencySymbol || 'EC$'}${sumBreakdown.toLocaleString()}/mo) does not match the recurring forecast overhead (${calculations.currencySymbol || 'EC$'}${forecastMonthlyOpEx.toLocaleString()}/mo).`,
      actionableRecommendation: 'Ensure operating cost items and overhead fields are correctly aligned without double-counting.'
    });
  }

  // 6. Narrative vs Financials Consistency Check
  const execSummary = bp.executiveSummary || '';
  const finNotes = bp.salesRevenueProjectionsNotes || '';
  const combinedNarrative = `${execSummary} ${finNotes}`;
  const revenueNarrative = combinedNarrative
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(revenue|sales|turnover|income)\b/i.test(sentence))
    .join(' ');

  const currencyMatches = revenueNarrative.match(/(?:EC\$|US\$|\$)\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]{4,8})/g);
  if (currencyMatches && currencyMatches.length > 0) {
    const y1Rev = calculations.y1Rev;
    const activeCurrency = details?.displayCurrency || 'USD';
    let foundCloseMatch = false;

    currencyMatches.forEach((matchStr) => {
      const explicitlyXcd = matchStr.trim().startsWith('EC$');
      const explicitlyUsd = matchStr.trim().startsWith('US$');
      if ((activeCurrency === 'XCD' && explicitlyUsd) || (activeCurrency === 'USD' && explicitlyXcd)) return;

      const numStr = matchStr.replace(/[^0-9.]/g, '');
      const numVal = parseFloat(numStr);
      if (numVal > 10000 && y1Rev > 0 && Math.abs(numVal - y1Rev) / y1Rev < 0.25) {
        foundCloseMatch = true;
      }
    });

    if (!foundCloseMatch && y1Rev > 0 && revenueNarrative.length > 100) {
      narrativeDiscrepancies.push(
        `Financial narrative mentions revenue figures that differ from computed Year 1 revenue (${calculations.currencySymbol || 'EC$'}${calculations.y1Rev.toLocaleString()}).`
      );
    }
  }

  // Determine Overall Status
  const hasBlockingErrors = issues.some((i) => i.type === 'error');
  const warningsCount = issues.filter((i) => i.type === 'warning').length;

  let status: BusinessPlanReadinessStatus = 'draft';
  let statusLabel = 'Draft Plan';
  let score = 0;

  // Base score on section completion (max 60 pts) and validation checks (max 40 pts)
  const sectionScore = Math.round((completedSectionsCount / totalSectionsCount) * 60);
  let validationScore = 40;
  if (hasBlockingErrors) validationScore -= 30;
  validationScore -= Math.min(20, warningsCount * 5);
  validationScore = Math.max(0, validationScore);

  score = Math.min(100, Math.max(0, sectionScore + validationScore));

  if (hasBlockingErrors || completionPercent < 30) {
    status = 'draft';
    statusLabel = 'Draft (Incomplete)';
  } else if (completionPercent < 75 || warningsCount > 2) {
    status = 'needs_review';
    statusLabel = 'Needs Review';
  } else if (completionPercent < 90 || warningsCount > 0) {
    status = 'ready_for_financial_review';
    statusLabel = 'Ready for Financial Review';
  } else {
    status = 'bank_ready';
    statusLabel = 'Ready for Lender Review';
  }

  return {
    status,
    statusLabel,
    score,
    completedSectionsCount,
    totalSectionsCount,
    completionPercent,
    issues,
    hasBlockingErrors,
    warningsCount,
    narrativeFinancialDiscrepancies: narrativeDiscrepancies
  };
}