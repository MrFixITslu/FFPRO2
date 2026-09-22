import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBusinessCopilotContext } from '../src/services/businessCopilotContext.ts';
import { runBusinessScenario } from '../src/services/businessScenarioService.ts';
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
  assert.equal(response.scenarioIntent?.changes[0].targetId, 'svc-quick');
  assert.equal(response.scenarioIntent?.changes[0].field, 'rate');
  assert.equal(response.scenarioIntent?.changes[0].value, 35);
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
