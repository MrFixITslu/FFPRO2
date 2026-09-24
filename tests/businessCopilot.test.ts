import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBusinessCopilotContext } from '../src/services/businessCopilotContext.ts';
import { runBusinessScenario } from '../src/services/businessScenarioService.ts';
import { inferLocalBusinessScenarioIntent } from '../src/services/businessScenarioIntentService.ts';
import { answerDeterministicCopilotQuickAction } from '../src/services/businessCopilotDeterministicService.ts';
import {
  __businessCopilotTest,
  generateBusinessCopilotResponse
} from '../server/services/businessCopilotService.js';
import type { StartupPlanDetails } from '../src/types.ts';

test('business copilot context is built from deterministic forecast and validation outputs', () => {
  const plan: StartupPlanDetails = {
    businessModelType: 'services',
    operatingModel: 'mobile',
    displayCurrency: 'XCD',
    exchangeRate: 2.72,
    cogs: 0,
    markup: 0,
    monthlyVolume: 0,
    rent: 0,
    salaries: 0,
    marketing: 0,
    utilities: 0,
    otherExpenses: 0,
    growthRateYear3: 15,
    growthRateYear5: 35,
    serviceOfferings: [{
      id: 'svc-1',
      name: 'Full House Session',
      revenueModel: 'event',
      unitLabel: 'Sessions',
      rate: 360,
      expectedVolume: 36,
      monthlyGrowthRatePercent: 0,
      directCostPerUnitOrJob: 0
    }],
    costItems: [{
      id: 'manager',
      name: 'Manager',
      classification: 'operating',
      currency: 'XCD',
      monthlyExpenseAmount: 3000
    }],
    businessPlan: {
      companyName: 'Laser Tag Arena',
      executiveSummary: 'A mobile laser tag entertainment service.'
    }
  };

  const context = buildBusinessCopilotContext(
    plan,
    {
      page: 'startup-planning',
      workflowStep: 3,
      section: 'forecast'
    },
    { projectId: 'project-1' }
  );

  assert.equal(context.projectId, 'project-1');
  assert.equal(context.business.name, 'Laser Tag Arena');
  assert.equal(context.business.displayCurrency, 'XCD');
  assert.equal(context.services?.[0].unitLabel, 'Sessions');
  assert.equal(context.services?.[0].rate, 360);
  assert.equal(context.forecast?.month1?.revenue, 12960);
  assert.ok((context.forecast?.year1?.revenue || 0) > 0);
  assert.ok(context.forecast?.breakEven);
  assert.equal(context.narrative?.executiveSummary, 'A mobile laser tag entertainment service.');
});

test('deterministic scenario runner compares service price changes without mutating the saved plan', () => {
  const plan: StartupPlanDetails = {
    businessModelType: 'services',
    operatingModel: 'mobile',
    displayCurrency: 'XCD',
    exchangeRate: 2.72,
    cogs: 0,
    markup: 0,
    monthlyVolume: 0,
    rent: 0,
    salaries: 0,
    marketing: 0,
    utilities: 0,
    otherExpenses: 0,
    growthRateYear3: 0,
    growthRateYear5: 0,
    serviceOfferings: [{
      id: 'svc-session',
      name: 'Full House Session',
      revenueModel: 'event',
      unitLabel: 'Sessions',
      rate: 360,
      expectedVolume: 36,
      monthlyGrowthRatePercent: 0,
      directCostPerUnitOrJob: 0
    }],
    costItems: [{
      id: 'manager',
      name: 'Manager',
      classification: 'operating',
      currency: 'XCD',
      monthlyExpenseAmount: 3000
    }]
  };

  const result = runBusinessScenario(plan, {
    title: 'Raise session price',
    changes: [{
      target: 'service',
      targetId: 'svc-session',
      field: 'rate',
      value: 400
    }]
  });

  assert.equal(plan.serviceOfferings?.[0].rate, 360);
  assert.equal(result.planUnchanged, true);
  assert.equal(result.changes[0].before, 360);
  assert.equal(result.changes[0].value, 400);

  const year1Revenue = result.metrics.find((item) => item.key === 'year1.revenue');
  assert.equal(year1Revenue?.before, 155520);
  assert.equal(year1Revenue?.after, 172800);
  assert.equal(year1Revenue?.delta, 17280);
});

test('scenario runner applies loan changes only to the temporary clone', () => {
  const plan: StartupPlanDetails = {
    businessModelType: 'services',
    operatingModel: 'mobile',
    displayCurrency: 'XCD',
    exchangeRate: 2.72,
    cogs: 0,
    markup: 0,
    monthlyVolume: 0,
    rent: 0,
    salaries: 0,
    marketing: 0,
    utilities: 0,
    otherExpenses: 0,
    growthRateYear3: 0,
    growthRateYear5: 0,
    serviceOfferings: [{
      id: 'svc-session',
      name: 'Session',
      revenueModel: 'event',
      unitLabel: 'Sessions',
      rate: 500,
      expectedVolume: 30,
      monthlyGrowthRatePercent: 0
    }],
    loanParameters: {
      enabled: true,
      loanAmount: 125000,
      annualInterestRate: 7,
      termYears: 5,
      paymentFrequency: 'monthly'
    }
  };

  const result = runBusinessScenario(plan, {
    title: 'Lower loan request',
    changes: [{
      target: 'loan',
      field: 'loanAmount',
      value: 100000
    }]
  });

  assert.equal(plan.loanParameters?.loanAmount, 125000);
  const debtService = result.metrics.find((item) => item.key === 'loan.monthlyDebtService');
  assert.ok(debtService);
  assert.ok((debtService?.after || 0) < (debtService?.before || 0));
});

test('server scenario intent normalization rejects invented target IDs', () => {
  const context = __businessCopilotTest.sanitizeContext({
    location: { page: 'costing' },
    business: { displayCurrency: 'XCD', exchangeRate: 2.72 },
    services: [{
      id: 'svc-real',
      name: 'Quick Battle',
      revenueModel: 'per_participant',
      unitLabel: 'Participants',
      currency: 'XCD',
      rate: 30,
      expectedVolume: 25
    }]
  });

  const valid = __businessCopilotTest.normalizeScenarioIntent({
    title: 'Quick Battle price',
    changes: [{
      target: 'service',
      targetId: 'svc-real',
      field: 'rate',
      value: 35
    }]
  }, context);
  assert.equal(valid?.changes[0].targetId, 'svc-real');

  const invalid = __businessCopilotTest.normalizeScenarioIntent({
    title: 'Invented service',
    changes: [{
      target: 'service',
      targetId: 'svc-made-up',
      field: 'rate',
      value: 35
    }]
  }, context);
  assert.equal(invalid, undefined);
});

test('deterministic Copilot fallback can identify a simple named service what-if', () => {
  const context = __businessCopilotTest.sanitizeContext({
    location: { page: 'costing' },
    business: { displayCurrency: 'XCD', exchangeRate: 2.72 },
    services: [{
      id: 'svc-quick',
      name: 'Quick Battle',
      revenueModel: 'per_participant',
      unitLabel: 'Participants',
      currency: 'XCD',
      rate: 30,
      expectedVolume: 25
    }]
  });

  const response = __businessCopilotTest.deterministicFallback(
    'What if Quick Battle goes from EC$30 to EC$35?',
    context
  );

  assert.equal(response.mode, 'scenario');
  assert.equal(response.scenarioIntent?.changes[0].targetId, 'svc-quick');
  assert.equal(response.scenarioIntent?.changes[0].field, 'rate');
  assert.equal(response.scenarioIntent?.changes[0].value, 35);
});

test('supported named-service scenarios bypass external AI providers', async () => {
  const context = {
    location: { page: 'costing' },
    business: { displayCurrency: 'XCD', exchangeRate: 2.72 },
    services: [{
      id: 'svc-quick',
      name: 'Quick Battle',
      revenueModel: 'per_participant',
      unitLabel: 'Participants',
      currency: 'XCD',
      rate: 30,
      expectedVolume: 25
    }],
    validation: { errors: [], warnings: [], info: [] }
  };

  const response = await generateBusinessCopilotResponse({
    message: 'What if Quick Battle goes from EC$30 to EC$35?',
    context,
    history: []
  });

  assert.equal(response.provider, 'deterministic');
  assert.equal(response.mode, 'scenario');

  const change = response.scenarioIntent?.changes[0];
  assert.ok(change);
  assert.equal(change.target, 'service');
  assert.ok('targetId' in change);

  assert.equal(change.targetId, 'svc-quick');
  assert.equal(change.field, 'rate');
  assert.equal(change.value, 35);
});

test('local scenario parser handles the exact Quick Battle prompt without an API request', () => {
  const context = {
    location: { page: 'costing' },
    business: {
      displayCurrency: 'XCD' as const,
      exchangeRate: 2.72
    },
    services: [{
      id: 'svc-quick',
      name: 'Quick Battle',
      revenueModel: 'per_participant',
      unitLabel: 'Participants',
      currency: 'XCD' as const,
      rate: 30,
      expectedVolume: 25
    }]
  };

  const intent = inferLocalBusinessScenarioIntent(
    '“What if Quick Battle goes from EC$30 to EC$35?”',
    context
  );

  assert.ok(intent);
  const change = intent.changes[0];
  assert.equal(change.target, 'service');
  assert.ok('targetId' in change);
  assert.equal(change.targetId, 'svc-quick');
  assert.equal(change.field, 'rate');
  assert.equal(change.value, 35);
});

test('deterministic cost audit answers the actual double-counting question', () => {
  const response = answerDeterministicCopilotQuickAction(
    'Find any double-counted or misclassified costs.',
    {
      location: { page: 'costing' },
      business: {
        displayCurrency: 'XCD',
        exchangeRate: 2.72
      },
      services: [
        {
          id: 'quick',
          name: 'Quick Battle',
          revenueModel: 'per_participant',
          unitLabel: 'Participants',
          currency: 'XCD',
          rate: 30,
          expectedVolume: 25,
          directCostPerUnitOrJob: 30
        },
        {
          id: 'resort',
          name: 'Resort Guest Experience',
          revenueModel: 'per_participant',
          unitLabel: 'Participants',
          currency: 'USD',
          rate: 20,
          expectedVolume: 24,
          directCostPerUnitOrJob: 25
        }
      ],
      costs: [
        {
          id: 'operator',
          name: 'Event Operator',
          classification: 'direct',
          currency: 'XCD',
          amount: 10,
          directCostBasis: 'per_booking'
        },
        {
          id: 'vehicle',
          name: 'Vehicle Rental',
          classification: 'direct',
          currency: 'XCD',
          amount: 80,
          directCostBasis: 'per_booking'
        }
      ],
      validation: {
        errors: [
          {
            id: 'quick-margin',
            title: 'Service-Level Cost Eliminates Margin on "Quick Battle"',
            message: 'The service-level variable cost (EC$30.00) is greater than or equal to the billing rate (EC$30.00).'
          }
        ],
        warnings: [],
        info: []
      }
    }
  );

  assert.ok(response);
  assert.equal(response.mode, 'audit');
  assert.match(response.message, /double-counting risk/i);
  assert.match(response.message, /service-level Unit Cost/i);
  assert.ok(response.observations?.some((item) => /Quick Battle/.test(item.text)));
  assert.ok(response.calculations?.some((item) => /Vehicle Rental/.test(item.label)));
});

test('deterministic break-even answer explains the formula instead of repeating generic validation', () => {
  const response = answerDeterministicCopilotQuickAction(
    'Explain my break-even result',
    {
      location: { page: 'forecast' },
      business: {
        displayCurrency: 'XCD',
        exchangeRate: 2.72
      },
      forecast: {
        breakEven: {
          monthlyFixedCosts: 3000,
          averageContributionMarginPercent: 49.56,
          breakEvenRevenueMonthly: 6052.85,
          breakEvenUnitsMonthly: 14,
          breakEvenMetricLabel: 'Blended Bookings / Sessions',
          unitPrice: 450,
          unitVariableCost: 227,
          unitContributionMargin: 223,
          safetyMarginPercent: 54
        }
      },
      validation: {
        errors: [],
        warnings: [],
        info: []
      }
    }
  );

  assert.ok(response);
  assert.equal(response.mode, 'explain');
  assert.match(response.message, /EC\$6,052\.85/);
  assert.match(response.message, /EC\$3,000/);
  assert.ok(response.calculations?.some((item) => /3,000/.test(item.formula || '')));
  assert.ok(response.calculations?.some((item) => /Break-even volume/.test(item.label)));
});

test('deterministic Year 1 revenue answer breaks revenue down by service and growth', () => {
  const response = answerDeterministicCopilotQuickAction(
    'Explain my Year 1 revenue',
    {
      location: { page: 'forecast' },
      business: {
        displayCurrency: 'XCD',
        exchangeRate: 2.72
      },
      services: [
        {
          id: 'quick',
          name: 'Quick Battle',
          revenueModel: 'per_participant',
          unitLabel: 'Participants',
          currency: 'XCD',
          rate: 30,
          expectedVolume: 25,
          monthlyGrowthRatePercent: 0
        },
        {
          id: 'birthday',
          name: 'Birthday Strike',
          revenueModel: 'event',
          unitLabel: 'Sessions',
          currency: 'XCD',
          rate: 450,
          expectedVolume: 5,
          monthlyGrowthRatePercent: 2
        }
      ],
      forecast: {
        year1: {
          revenue: 40000
        }
      },
      validation: {
        errors: [],
        warnings: [],
        info: []
      }
    }
  );

  assert.ok(response);
  assert.equal(response.mode, 'explain');
  assert.ok(response.calculations?.some((item) => item.label === 'Quick Battle'));
  assert.ok(response.calculations?.some((item) => item.label === 'Birthday Strike'));
  assert.ok(response.observations?.some((item) => /compound monthly/i.test(item.text)));
});

test('deterministic plan audit returns validation issues without unrelated repeated boilerplate', () => {
  const response = answerDeterministicCopilotQuickAction(
    'Check this plan for inconsistencies',
    {
      location: { page: 'plan' },
      business: {
        displayCurrency: 'XCD',
        exchangeRate: 2.72
      },
      forecast: {
        year1: {
          revenue: 414564.96,
          netProfit: 175127.18,
          netMarginPercent: 42.2
        }
      },
      validation: {
        errors: [{
          id: 'pricing-error',
          title: 'Service-Level Cost Eliminates Margin on "Quick Battle"',
          message: 'The service-level cost equals the rate.'
        }],
        warnings: [{
          id: 'growth-warning',
          title: 'Monthly Growth Active',
          message: 'A service compounds monthly.'
        }],
        info: []
      }
    }
  );

  assert.ok(response);
  assert.equal(response.mode, 'audit');
  assert.match(response.message, /1 error/);
  assert.match(response.message, /1 warning/);
  assert.ok(response.observations?.some((item) => /Quick Battle/.test(item.text)));
  assert.ok(response.observations?.some((item) => /Monthly Growth Active/.test(item.text)));
});

test('server context sanitizer bounds narrative and normalizes unsafe shapes', () => {
  const longNarrative = 'x'.repeat(5000);
  const context = __businessCopilotTest.sanitizeContext({
    location: { page: 'forecast' },
    business: {
      displayCurrency: 'XCD',
      exchangeRate: 2.72
    },
    narrative: {
      executiveSummary: longNarrative
    },
    services: Array.from({ length: 100 }, (_, index) => ({
      id: `svc-${index}`,
      name: `Service ${index}`,
      rate: index,
      expectedVolume: 1,
      currency: 'XCD'
    }))
  });

  assert.equal(context.business.displayCurrency, 'XCD');
  assert.equal(context.services.length, 60);
  assert.ok((context.narrative?.executiveSummary || '').length <= 1800);
});

test('read-only response normalization suppresses model-proposed mutations', () => {
  const response = __businessCopilotTest.normalizeResponse({
    message: 'Your margin is positive.',
    mode: 'action',
    observations: [{ severity: 'info', text: 'No validation errors.' }],
    proposals: [{
      id: 'bad-proposal',
      title: 'Change price',
      actions: [{ type: 'update_service' }]
    }],
    suggestedPrompts: ['Explain break-even']
  }, 'ollama', 'test-model');

  assert.equal(response.mode, 'action');
  assert.deepEqual(response.proposals, []);
  assert.equal(response.provider, 'ollama');
  assert.equal(response.model, 'test-model');
});

test('deterministic copilot fallback uses forecast and validation facts only', () => {
  const context = __businessCopilotTest.sanitizeContext({
    location: { page: 'forecast' },
    business: {
      displayCurrency: 'XCD',
      exchangeRate: 2.72
    },
    forecast: {
      year1: {
        revenue: 158210,
        netProfit: 42000
      },
      breakEven: {
        breakEvenRevenueMonthly: 5100
      }
    },
    validation: {
      errors: [{
        id: 'pricing-error',
        title: 'Pricing mismatch',
        message: 'A service cost exceeds its rate.'
      }],
      warnings: [],
      info: []
    }
  });

  const response = __businessCopilotTest.deterministicFallback(
    'check my plan',
    context
  );

  assert.equal(response.provider, 'deterministic');
  assert.equal(response.mode, 'audit');
  assert.match(response.message, /EC\$158,210/);
  assert.match(response.message, /Pricing mismatch/);
  assert.equal(response.observations[0].severity, 'error');
});

test('scenarios omit undefined DSCR comparisons instead of treating no payments as zero coverage', () => {
  const plan = {
    businessModelType: 'services', displayCurrency: 'USD',
    loanParameters: { enabled: true, loanAmount: 12000, annualInterestRate: 7, termYears: 3, paymentFrequency: 'monthly', gracePeriodMonths: 12, gracePeriodType: 'full_defer' }
  } as StartupPlanDetails;
  const result = runBusinessScenario(plan, {
    changes: [{ target: 'loan', field: 'loanAmount', value: 10000 }],
    title: 'Reduce borrowing'
  });
  assert.ok(!result.metrics.some(metric => metric.key === 'loan.dscrYear1'));
});
