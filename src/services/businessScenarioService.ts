import type {
  BusinessScenarioChange,
  BusinessScenarioIntent,
  BusinessScenarioMetric,
  BusinessScenarioResult
} from '../../shared/businessCopilotTypes';
import type { StartupPlanDetails } from '../types';
import { generateStartupFinancialForecast, roundCurrency } from './startupFinancialsService';
import { validateBusinessPlan } from './businessPlanValidationService';

function clonePlan(plan: StartupPlanDetails): StartupPlanDetails {
  if (typeof structuredClone === 'function') {
    return structuredClone(plan);
  }
  return JSON.parse(JSON.stringify(plan));
}

function assertFiniteNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return number;
}

function assertRange(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = assertFiniteNumber(value, label);
  if (number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

function percentDelta(before: number, after: number): number | undefined {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return undefined;
  return roundCurrency(((after - before) / Math.abs(before)) * 100);
}

function metric(
  key: string,
  label: string,
  before: number | undefined,
  after: number | undefined,
  format: BusinessScenarioMetric['format'],
  suffix?: string
): BusinessScenarioMetric | null {
  if (!Number.isFinite(Number(before)) || !Number.isFinite(Number(after))) return null;
  const beforeNumber = roundCurrency(Number(before));
  const afterNumber = roundCurrency(Number(after));
  return {
    key,
    label,
    before: beforeNumber,
    after: afterNumber,
    delta: roundCurrency(afterNumber - beforeNumber),
    deltaPercent: percentDelta(beforeNumber, afterNumber),
    format,
    suffix
  };
}

function findYear(forecast: ReturnType<typeof generateStartupFinancialForecast>, year: number) {
  return forecast.yearlyProjections.find((item) => item.year === year);
}

function getChangeBeforeValue(plan: StartupPlanDetails, change: BusinessScenarioChange): {
  value: number | string;
  label: string;
} {
  if (change.target === 'service') {
    const service = (plan.serviceOfferings || []).find((item) => item.id === change.targetId);
    if (!service) throw new Error('The scenario references a service offering that no longer exists.');
    return {
      value: (service as any)[change.field] ?? 0,
      label: service.name
    };
  }

  if (change.target === 'cost') {
    const cost = (plan.costItems || []).find((item) => item.id === change.targetId);
    if (!cost) throw new Error('The scenario references a cost item that no longer exists.');
    return {
      value: (cost as any)[change.field] ?? (change.field === 'directCostBasis' ? 'per_booking' : 0),
      label: cost.name
    };
  }

  if (change.target === 'capacity') {
    const equipment = plan.serviceCapacityPlan?.equipment;
    if (!equipment) throw new Error('Equipment capacity must be configured before running this scenario.');
    return {
      value: (equipment as any)[change.field] ?? 0,
      label: 'Equipment Capacity'
    };
  }

  const loan = plan.loanParameters;
  if (!loan) throw new Error('Loan parameters must be configured before running this scenario.');
  return {
    value: (loan as any)[change.field] ?? 0,
    label: 'Loan'
  };
}

export function applyBusinessScenario(
  plan: StartupPlanDetails,
  changes: BusinessScenarioChange[]
): StartupPlanDetails {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error('A scenario must include at least one change.');
  }
  if (changes.length > 12) {
    throw new Error('A single scenario can contain at most 12 changes.');
  }

  const next = clonePlan(plan);

  for (const change of changes) {
    if (change.target === 'service') {
      const service = (next.serviceOfferings || []).find((item) => item.id === change.targetId);
      if (!service) throw new Error('The selected service offering could not be found.');

      if (change.field === 'rate') {
        service.rate = assertRange(change.value, 'Service rate', 0, 100000000);
      } else if (change.field === 'expectedVolume') {
        service.expectedVolume = assertRange(change.value, 'Expected monthly volume', 0, 10000000);
      } else if (change.field === 'unitsPerBooking') {
        service.unitsPerBooking = assertRange(change.value, 'Units per booking', 0.01, 100000);
      } else if (change.field === 'monthlyGrowthRatePercent') {
        service.monthlyGrowthRatePercent = assertRange(change.value, 'Monthly growth rate', 0, 1000);
      } else if (change.field === 'directCostPerUnitOrJob') {
        service.directCostPerUnitOrJob = assertRange(change.value, 'Service direct cost', 0, 100000000);
      }
      continue;
    }

    if (change.target === 'cost') {
      const cost = (next.costItems || []).find((item) => item.id === change.targetId);
      if (!cost) throw new Error('The selected cost item could not be found.');

      if (change.field === 'directCostBasis') {
        if (change.value !== 'per_booking' && change.value !== 'per_revenue_unit') {
          throw new Error('Direct-cost basis must be per_booking or per_revenue_unit.');
        }
        cost.directCostBasis = change.value;
      } else if (change.field === 'directCostPerUnitOrJob') {
        const value = assertRange(change.value, 'Direct cost', 0, 100000000);
        cost.directCostPerUnitOrJob = value;
        cost.unitCost = value;
        cost.amount = value;
      } else if (change.field === 'monthlyExpenseAmount') {
        const value = assertRange(change.value, 'Monthly operating expense', 0, 100000000);
        cost.monthlyExpenseAmount = value;
        cost.amount = value;
      }
      continue;
    }

    if (change.target === 'capacity') {
      const equipment = next.serviceCapacityPlan?.equipment;
      if (!equipment) throw new Error('Equipment capacity must be configured before running this scenario.');

      if (change.field === 'targetUtilisationPercent') {
        equipment.targetUtilisationPercent = assertRange(change.value, 'Target utilisation', 0, 100);
      } else if (change.field === 'resourceCount') {
        equipment.resourceCount = assertRange(change.value, 'Operating units', 0, 100000);
      } else if (change.field === 'availableDaysPerUnit') {
        equipment.availableDaysPerUnit = assertRange(change.value, 'Available days per unit', 0, 31);
      } else if (change.field === 'operatingHoursPerDay') {
        equipment.operatingHoursPerDay = assertRange(change.value, 'Operating hours per day', 0, 24);
      } else if (change.field === 'serviceUnitDurationHours') {
        equipment.serviceUnitDurationHours = assertRange(change.value, 'Service duration', 0.01, 24);
      } else if (change.field === 'capacityPerResource') {
        equipment.capacityPerResource = assertRange(change.value, 'Capacity per operating unit', 0, 100000);
      }
      continue;
    }

    if (!next.loanParameters) {
      throw new Error('Loan parameters must be configured before running this scenario.');
    }

    if (change.field === 'loanAmount') {
      next.loanParameters.loanAmount = assertRange(change.value, 'Loan amount', 0, 1000000000);
    } else if (change.field === 'annualInterestRate') {
      next.loanParameters.annualInterestRate = assertRange(change.value, 'Annual interest rate', 0, 100);
    } else if (change.field === 'termYears') {
      next.loanParameters.termYears = assertRange(change.value, 'Loan term', 1, 50);
    } else if (change.field === 'gracePeriodMonths') {
      next.loanParameters.gracePeriodMonths = assertRange(change.value, 'Grace period', 0, 120);
    }
  }

  return next;
}

export function runBusinessScenario(
  plan: StartupPlanDetails,
  intent: BusinessScenarioIntent
): BusinessScenarioResult {
  const currency = plan.displayCurrency || 'USD';
  const exchangeRate = plan.exchangeRate || 2.70;

  const baselineForecast = generateStartupFinancialForecast(plan, currency, exchangeRate);
  const baselineValidation = validateBusinessPlan(plan);

  const scenarioPlan = applyBusinessScenario(plan, intent.changes);
  const scenarioForecast = generateStartupFinancialForecast(scenarioPlan, currency, exchangeRate);
  const scenarioValidation = validateBusinessPlan(scenarioPlan);

  const beforeYear1 = findYear(baselineForecast, 1);
  const afterYear1 = findYear(scenarioForecast, 1);
  const beforeMonth1 = baselineForecast.monthlyYear1[0];
  const afterMonth1 = scenarioForecast.monthlyYear1[0];

  const metrics = [
    metric('month1.revenue', 'Month 1 Revenue', beforeMonth1?.revenue, afterMonth1?.revenue, 'currency'),
    metric('year1.revenue', 'Year 1 Revenue', beforeYear1?.revenue, afterYear1?.revenue, 'currency'),
    metric('year1.grossProfit', 'Year 1 Gross Profit', beforeYear1?.grossProfit, afterYear1?.grossProfit, 'currency'),
    metric('year1.grossMarginPercent', 'Gross Margin', beforeYear1?.grossMarginPercent, afterYear1?.grossMarginPercent, 'percent'),
    metric('year1.netProfit', 'Year 1 Net Profit', beforeYear1?.netProfit, afterYear1?.netProfit, 'currency'),
    metric('year1.netMarginPercent', 'Net Margin', beforeYear1?.netMarginPercent, afterYear1?.netMarginPercent, 'percent'),
    metric('year1.endingCashBalance', 'Year 1 Ending Cash', beforeYear1?.endingCashBalance, afterYear1?.endingCashBalance, 'currency'),
    metric(
      'breakEven.breakEvenRevenueMonthly',
      'Monthly Break-Even Revenue',
      baselineForecast.breakEven.breakEvenRevenueMonthly,
      scenarioForecast.breakEven.breakEvenRevenueMonthly,
      'currency'
    ),
    metric(
      'breakEven.breakEvenUnitsMonthly',
      'Break-Even Volume',
      baselineForecast.breakEven.breakEvenUnitsMonthly,
      scenarioForecast.breakEven.breakEvenUnitsMonthly,
      'number',
      scenarioForecast.breakEven.breakEvenMetricLabel
    ),
    metric(
      'loan.dscrYear1',
      'Year 1 DSCR',
      baselineForecast.loanSummary?.dscrYear1,
      scenarioForecast.loanSummary?.dscrYear1,
      'number',
      'x'
    ),
    metric(
      'loan.monthlyDebtService',
      'Monthly Debt Service',
      baselineForecast.loanSummary?.monthlyDebtService,
      scenarioForecast.loanSummary?.monthlyDebtService,
      'currency'
    )
  ].filter((item): item is BusinessScenarioMetric => Boolean(item));

  const beforeIds = new Set((baselineValidation.issues || []).map((issue) => issue.id));
  const newIssues = (scenarioValidation.issues || [])
    .filter((issue) => !beforeIds.has(issue.id))
    .map((issue) => ({
      type: issue.type,
      title: issue.title,
      message: issue.message
    }));

  return {
    title: intent.title,
    summary: intent.summary,
    currency,
    planUnchanged: true,
    changes: intent.changes.map((change) => {
      const before = getChangeBeforeValue(plan, change);
      return {
        ...change,
        targetLabel: before.label,
        before: before.value
      };
    }),
    metrics,
    validation: {
      beforeErrors: baselineValidation.issues.filter((issue) => issue.type === 'error').length,
      afterErrors: scenarioValidation.issues.filter((issue) => issue.type === 'error').length,
      beforeWarnings: baselineValidation.issues.filter((issue) => issue.type === 'warning').length,
      afterWarnings: scenarioValidation.issues.filter((issue) => issue.type === 'warning').length,
      newIssues
    }
  };
}
