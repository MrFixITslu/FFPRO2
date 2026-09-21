import {
  StartupPlanDetails,
  BusinessPlanSections
} from '../types';
import { computeStartupCalculations, BusinessPlanCalculations } from './businessPlanExportService';
import {
  generateStartupFinancialForecast,
  calculateLoanAmortizationSchedule,
  calculateMonthlyOperatingExpenses,
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
  const isServices = details?.businessModelType === 'services' || calculations.isServiceBusiness;

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
        actionableRecommendation: 'Add at least one service offering with rate, unit label, and volume in Services Workflow.'
      });
    } else {
      offerings.forEach((s, idx) => {
        if (!s.rate || s.rate <= 0) {
          issues.push({
            id: `service-rate-zero-${idx}`,
            type: 'error',
            category: 'pricing',
            title: `Zero Rate on "${s.name || `Service #${idx + 1}`}"`,
            message: 'Service offerings must have a billable rate greater than zero.',
            actionableRecommendation: 'Set a positive pricing rate per session or booking.'
          });
        }
        if (!s.expectedVolume || s.expectedVolume <= 0) {
          issues.push({
            id: `service-volume-zero-${idx}`,
            type: 'warning',
            category: 'pricing',
            title: `Zero Volume on "${s.name || `Service #${idx + 1}`}"`,
            message: 'Service volume is set to 0, which yields $0 projected revenue.',
            actionableRecommendation: 'Specify target monthly sessions or bookings.'
          });
        }
      });
    }

    // High markup / margin check
    if (calculations.markupPercent > 500 && calculations.costOfGoodsSoldUnit > 0) {
      issues.push({
        id: 'high-service-markup',
        type: 'info',
        category: 'pricing',
        title: 'High Contribution Margin Ratio',
        message: `Calculated service contribution margin is ${calculations.contributionMarginPercent}%. Ensure staff direct labor or direct event expenses are captured.`,
        actionableRecommendation: 'Review direct consumables and job-specific expenses per booking.'
      });
    }

    // Capacity vs Demand check
    const fleetCapacity = details?.serviceCapacityPlan?.equipment;
    if (fleetCapacity && fleetCapacity.enabled && fleetCapacity.resourceCount > 0) {
      const maxMonthlyDays = fleetCapacity.resourceCount * (fleetCapacity.availableDaysPerUnit || 25);
      const totalPlannedMonthlyDemand = offerings.reduce((sum, o) => sum + (o.expectedVolume || 0), 0);
      if (totalPlannedMonthlyDemand > maxMonthlyDays * 1.5) {
        issues.push({
          id: 'capacity-demand-mismatch',
          type: 'warning',
          category: 'capacity',
          title: 'Demand Exceeds Fleet Capacity Limit',
          message: `Planned monthly bookings (${totalPlannedMonthlyDemand}) exceed maximum fleet operational capacity (${maxMonthlyDays} unit-days/month).`,
          actionableRecommendation: 'Increase fleet units owned or adjust target monthly bookings.'
        });
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
        message: 'The commercial credit facility is enabled but has a $0 principal balance.',
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

    // DSCR Check
    const loanSummary = calculateLoanAmortizationSchedule(
      lp,
      details.displayCurrency || 'XCD',
      details.exchangeRate || 2.70,
      calculations.ebitdaYear1 || calculations.y1Net
    );

    if (loanSummary.dscrYear1 < 1.0) {
      issues.push({
        id: 'loan-dscr-insufficient',
        type: 'error',
        category: 'loan',
        title: 'DSCR Below 1.0x (Insufficient Debt Service Coverage)',
        message: `Year 1 DSCR is ${loanSummary.dscrYear1.toFixed(2)}x. Net operating cash flow is insufficient to service loan debt.`,
        actionableRecommendation: 'Increase revenue projections, trim operating overhead, or extend loan tenure.'
      });
    } else if (loanSummary.dscrYear1 < 1.25) {
      issues.push({
        id: 'loan-dscr-tight',
        type: 'warning',
        category: 'loan',
        title: 'DSCR Tight (<1.25x Commercial Benchmark)',
        message: `Year 1 DSCR is ${loanSummary.dscrYear1.toFixed(2)}x. Commercial banks generally prefer a minimum 1.25x - 1.35x coverage ratio.`,
        actionableRecommendation: 'Consider requesting a partial grant or injecting additional equity.'
      });
    }
  }

  // 5. Operating Expenses Reconciliation Rule
  const opexData = calculateMonthlyOperatingExpenses(details);
  const sumBreakdown = roundCurrency(opexData.operatingExpensesBreakdown.reduce((sum, item) => sum + item.amount, 0));
  const forecast = generateStartupFinancialForecast(details);
  const forecastMonthlyOpEx = forecast.monthlyYear1[0]?.operatingExpenses ?? 0;
  const calcMonthlyOpEx = calculations.monthlyOpExpenses ?? 0;

  if (Math.abs(sumBreakdown - forecastMonthlyOpEx) > 1.0 || Math.abs(sumBreakdown - calcMonthlyOpEx) > 1.0) {
    issues.push({
      id: 'opex-reconciliation-mismatch',
      type: 'error',
      category: 'forecast',
      title: 'Operating Expense Reconciliation Discrepancy',
      message: `The sum of displayed operating expense rows (${calculations.currencySymbol || 'EC$'}${sumBreakdown.toLocaleString()}/mo) does not match the forecast operating overhead (${calculations.currencySymbol || 'EC$'}${forecastMonthlyOpEx.toLocaleString()}/mo).`,
      actionableRecommendation: 'Ensure operating cost items and overhead fields are correctly aligned without double-counting.'
    });
  }

  // 6. Narrative vs Financials Consistency Check
  const execSummary = bp.executiveSummary || '';
  const finNotes = bp.salesRevenueProjectionsNotes || '';
  const combinedNarrative = `${execSummary} ${finNotes}`;

  // Extract dollar figures from narrative (e.g. $150,000 or EC$ 150,000)
  const currencyMatches = combinedNarrative.match(/(?:EC\$|US\$|\$)\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]{4,8})/g);
  if (currencyMatches && currencyMatches.length > 0) {
    const y1Rev = calculations.y1Rev;
    let foundCloseMatch = false;
    currencyMatches.forEach((matchStr) => {
      const numStr = matchStr.replace(/[^0-9.]/g, '');
      const numVal = parseFloat(numStr);
      if (numVal > 10000) {
        // If within 20% of Year 1 revenue, mark matched
        if (Math.abs(numVal - y1Rev) / y1Rev < 0.25) {
          foundCloseMatch = true;
        }
      }
    });

    // If narrative specifically mentions high numbers far from computed revenue, flag warning
    if (!foundCloseMatch && y1Rev > 0 && combinedNarrative.length > 200) {
      narrativeDiscrepancies.push(
        `Financial narrative mentions figures that differ from computed Year 1 revenue (${calculations.currencySymbol || 'EC$'}${calculations.y1Rev.toLocaleString()}).`
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
    statusLabel = 'Funding & Bank Ready';
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
