import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBusinessCopilotContext } from '../src/services/businessCopilotContext.ts';
import { __businessCopilotTest } from '../server/services/businessCopilotService.js';
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
