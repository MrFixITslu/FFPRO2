import type {
  BusinessCopilotContext,
  BusinessCopilotResponse
} from '../../shared/businessCopilotTypes';

function currencySymbol(context: BusinessCopilotContext) {
  return context.business.displayCurrency === 'XCD' ? 'EC$' : 'US$';
}

function money(value: number | undefined, context: BusinessCopilotContext) {
  const amount = Number(value || 0);
  return `${currencySymbol(context)}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function pct(value: number | undefined) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function convertToDisplay(
  value: number,
  from: 'USD' | 'XCD',
  context: BusinessCopilotContext
) {
  const to = context.business.displayCurrency;
  if (from === to) return value;
  const rate = context.business.exchangeRate || 2.70;
  return from === 'USD' && to === 'XCD'
    ? value * rate
    : value / rate;
}

function annualServiceRevenue(
  service: NonNullable<BusinessCopilotContext['services']>[number],
  context: BusinessCopilotContext
) {
  const rate = convertToDisplay(service.rate || 0, service.currency, context);
  const baseVolume = Math.max(0, service.expectedVolume || 0);
  const growth = Math.max(0, service.monthlyGrowthRatePercent || 0) / 100;

  let total = 0;
  for (let month = 0; month < 12; month += 1) {
    const volume = Math.round(baseVolume * Math.pow(1 + growth, month));
    total += Math.round(volume * rate * 100) / 100;
  }
  return Math.round(total * 100) / 100;
}

function responseBase(
  message: string,
  mode: 'explain' | 'audit',
  context: BusinessCopilotContext
): BusinessCopilotResponse {
  return {
    message,
    mode,
    observations: [],
    calculations: [],
    sources: [
      { type: 'plan', label: 'Current FFPRO plan inputs' },
      { type: 'forecast', label: 'FFPRO deterministic forecast' },
      { type: 'validation', label: 'FFPRO validation engine' }
    ],
    proposals: [],
    provider: 'deterministic'
  };
}

function explainBreakEven(context: BusinessCopilotContext): BusinessCopilotResponse | undefined {
  const be = context.forecast?.breakEven;
  if (!be) return undefined;

  const contributionRate = be.averageContributionMarginPercent / 100;
  const formula = contributionRate > 0
    ? `${money(be.monthlyFixedCosts, context)} ÷ ${pct(be.averageContributionMarginPercent)}`
    : 'Contribution margin must be positive';

  const response = responseBase(
    `Your monthly break-even revenue is ${money(be.breakEvenRevenueMonthly, context)}. FFPRO gets there by dividing monthly fixed costs of ${money(be.monthlyFixedCosts, context)} by the blended contribution margin of ${pct(be.averageContributionMarginPercent)}. At the current blended economics, that is about ${be.breakEvenUnitsMonthly.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${be.breakEvenMetricLabel.toLowerCase()} per month.`,
    'explain',
    context
  );

  response.calculations = [
    {
      label: 'Monthly fixed costs',
      value: money(be.monthlyFixedCosts, context)
    },
    {
      label: 'Blended contribution margin',
      value: pct(be.averageContributionMarginPercent)
    },
    {
      label: 'Monthly break-even revenue',
      formula,
      value: money(be.breakEvenRevenueMonthly, context)
    },
    {
      label: 'Blended unit economics',
      formula: `${money(be.unitPrice, context)} price − ${money(be.unitVariableCost, context)} variable cost`,
      value: `${money(be.unitContributionMargin, context)} contribution per ${be.breakEvenMetricLabel}`
    },
    {
      label: 'Break-even volume',
      value: `${be.breakEvenUnitsMonthly.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${be.breakEvenMetricLabel}`
    },
    {
      label: 'Safety margin',
      value: pct(be.safetyMarginPercent)
    }
  ];

  const errors = context.validation?.errors || [];
  if (errors.some((issue) => /service-level cost eliminates margin/i.test(issue.title))) {
    response.observations = [{
      severity: 'warning',
      text: 'Some service-level unit costs currently eliminate margin on individual offers. Those inputs can distort blended contribution margin and therefore the break-even result.'
    }];
  }

  response.suggestedPrompts = [
    'Find any double-counted or misclassified costs.',
    'Explain my Year 1 revenue',
    'What if Quick Battle goes from EC$30 to EC$35?'
  ];

  return response;
}

function explainYear1Revenue(context: BusinessCopilotContext): BusinessCopilotResponse | undefined {
  const year1 = context.forecast?.year1;
  if (!year1 || !Number.isFinite(Number(year1.revenue))) return undefined;

  const services = context.services || [];
  const contributions = services
    .map((service) => ({
      service,
      revenue: annualServiceRevenue(service, context)
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const serviceTotal = contributions.reduce((sum, item) => sum + item.revenue, 0);
  const difference = Math.round(((year1.revenue || 0) - serviceTotal) * 100) / 100;

  const response = responseBase(
    `Year 1 revenue is ${money(year1.revenue, context)}. The current service mix contributes approximately ${money(serviceTotal, context)} based on each offering's rate, starting monthly volume, and active monthly growth assumption.`,
    'explain',
    context
  );

  response.calculations = contributions.slice(0, 12).map(({ service, revenue }) => ({
    label: service.name,
    formula: `${money(convertToDisplay(service.rate || 0, service.currency, context), context)} × starting volume ${service.expectedVolume.toLocaleString()}${(service.monthlyGrowthRatePercent || 0) > 0 ? ` with ${pct(service.monthlyGrowthRatePercent)} monthly growth` : ''}`,
    value: money(revenue, context)
  }));

  if (Math.abs(difference) > 1) {
    response.observations = [{
      severity: 'info',
      text: `${money(difference, context)} of Year 1 revenue comes from forecast components outside the listed service-offering calculation, such as other configured revenue engines or rounding/model effects.`
    }];
  }

  const growthServices = services.filter((service) => (service.monthlyGrowthRatePercent || 0) > 0);
  if (growthServices.length > 0) {
    response.observations = [
      ...(response.observations || []),
      {
        severity: 'warning',
        text: `${growthServices.length} service offering${growthServices.length === 1 ? '' : 's'} currently compound monthly during Year 1. That is why Year 1 revenue can be materially higher than 12 × the starting monthly run rate.`
      }
    ];
  }

  response.suggestedPrompts = [
    'Which services have monthly growth enabled?',
    'Find any double-counted or misclassified costs.',
    'Explain my break-even result'
  ];

  return response;
}

function auditCosts(context: BusinessCopilotContext): BusinessCopilotResponse {
  const services = context.services || [];
  const costs = context.costs || [];
  const sharedDirectCosts = costs.filter((cost) => cost.classification === 'direct');
  const serviceCosts = services.filter((service) => (service.directCostPerUnitOrJob || 0) > 0);

  const marginErrors = (context.validation?.errors || []).filter((issue) =>
    /service-level cost eliminates margin/i.test(issue.title)
  );

  const likelyDuplicates = serviceCosts.filter((service) => {
    if (sharedDirectCosts.length === 0) return false;
    return true;
  });

  const response = responseBase(
    marginErrors.length > 0
      ? `I found ${marginErrors.length} service-level cost problem${marginErrors.length === 1 ? '' : 's'} that need review. The strongest double-counting risk is that service-level Unit Cost values are active while shared direct costs also exist in the cost ledger. If those Unit Cost values are not separate per-participant consumables, they should not be charged again at the service level.`
      : likelyDuplicates.length > 0
        ? `I found ${likelyDuplicates.length} service offering${likelyDuplicates.length === 1 ? '' : 's'} with service-level Unit Cost values while shared direct costs also exist in the ledger. Review them for duplication.`
        : 'FFPRO does not currently show an obvious service-level/direct-ledger duplication from the supplied cost structure.',
    'audit',
    context
  );

  response.observations = [
    ...marginErrors.map((issue) => ({
      severity: 'error' as const,
      text: `${issue.title}: ${issue.message}`
    })),
    ...likelyDuplicates
      .filter((service) => !marginErrors.some((issue) => issue.title.includes(service.name)))
      .map((service) => ({
        severity: 'warning' as const,
        text: `${service.name} has a service-level Unit Cost of ${money(convertToDisplay(service.directCostPerUnitOrJob || 0, service.currency, context), context)} while shared direct-cost ledger items are also active. Confirm that this is a distinct per-unit cost rather than duplicated staff/transport/setup cost.`
      }))
  ];

  response.calculations = [
    ...serviceCosts.map((service) => ({
      label: `${service.name} service-level Unit Cost`,
      formula: `Rate ${money(convertToDisplay(service.rate || 0, service.currency, context), context)}`,
      value: money(convertToDisplay(service.directCostPerUnitOrJob || 0, service.currency, context), context)
    })),
    ...sharedDirectCosts.slice(0, 10).map((cost) => ({
      label: `${cost.name} — shared direct cost`,
      formula: cost.directCostBasis === 'per_revenue_unit'
        ? 'Scales per revenue unit / participant'
        : 'Scales per booking / session / job',
      value: money(cost.amount, context)
    }))
  ];

  if (serviceCosts.length > 0 && sharedDirectCosts.length > 0) {
    response.observations.push({
      severity: 'info',
      text: 'Use service-level Unit Cost only for costs unique to that offering and incurred for each billed unit. Keep shared event staff, vehicle, setup/teardown, and similar booking costs in the direct-cost ledger.'
    });
  }

  response.suggestedPrompts = [
    'Explain my break-even result',
    'Check this plan for inconsistencies',
    'Explain my Year 1 revenue'
  ];

  return response;
}

function auditPlan(context: BusinessCopilotContext): BusinessCopilotResponse {
  const errors = context.validation?.errors || [];
  const warnings = context.validation?.warnings || [];
  const info = context.validation?.info || [];
  const year1 = context.forecast?.year1;

  const response = responseBase(
    errors.length || warnings.length
      ? `FFPRO currently reports ${errors.length} error${errors.length === 1 ? '' : 's'} and ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. Fix the errors first because they can materially distort pricing, margin, break-even, or lender-facing outputs.`
      : 'FFPRO does not currently report any validation errors or warnings in the supplied plan context.',
    'audit',
    context
  );

  response.observations = [
    ...errors.map((issue) => ({
      severity: 'error' as const,
      text: `${issue.title}: ${issue.message}`
    })),
    ...warnings.map((issue) => ({
      severity: 'warning' as const,
      text: `${issue.title}: ${issue.message}`
    })),
    ...info.slice(0, 5).map((issue) => ({
      severity: 'info' as const,
      text: `${issue.title}: ${issue.message}`
    }))
  ];

  if (year1) {
    response.calculations = [
      {
        label: 'Year 1 revenue',
        value: money(year1.revenue, context)
      },
      {
        label: 'Year 1 net profit',
        value: money(year1.netProfit, context)
      },
      {
        label: 'Year 1 net margin',
        value: pct(year1.netMarginPercent)
      }
    ];
  }

  response.suggestedPrompts = [
    'Find any double-counted or misclassified costs.',
    'Explain my Year 1 revenue',
    'Explain my break-even result'
  ];

  return response;
}

export function answerDeterministicCopilotQuickAction(
  message: string,
  context: BusinessCopilotContext
): BusinessCopilotResponse | undefined {
  const text = message.trim();

  if (/double[- ]?count|misclassif|duplicate cost|cost classification/i.test(text)) {
    return auditCosts(context);
  }

  if (/break[- ]?even/i.test(text) && /(explain|why|how|result)/i.test(text)) {
    return explainBreakEven(context);
  }

  if (/(year\s*1|first year).*(revenue)|revenue.*(year\s*1|first year)/i.test(text) &&
      /(explain|why|how|breakdown)/i.test(text)) {
    return explainYear1Revenue(context);
  }

  if (/check.*(plan|inconsisten)|inconsisten|audit.*plan/i.test(text)) {
    return auditPlan(context);
  }

  return undefined;
}
