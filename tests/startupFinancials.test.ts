import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundCurrency,
  sumCurrency,
  calculateEquipmentDepreciation,
  calculateEquipmentRentalRevenue,
  calculateServiceCapacity,
  calculateLoanAmortizationSchedule,
  calculateMonthlyOperatingExpenses,
  generateStartupFinancialForecast,
  needsBusinessModelClassification
} from '../src/services/startupFinancialsService.ts';
import { computeStartupCalculations } from '../src/services/businessPlanExportService.ts';
import { normalizeCostItemAmount, DEFAULT_BASE_CURRENCY } from '../src/services/currencyService.ts';
import { buildBusinessPlanPresentation } from '../src/services/businessPlanPresentationService.ts';
import { validateBusinessPlan } from '../src/services/businessPlanValidationService.ts';
import { formatBusinessPlanMarkdownToHtml } from '../src/utils/businessPlanRichText.ts';
import { StartupCostItem, StartupPlanDetails } from '../src/types.ts';

test('cents-safe rounding and summation prevents floating point loss', () => {
  assert.equal(roundCurrency(0.1 + 0.2), 0.3);
  assert.equal(roundCurrency(10.005), 10.01);
  assert.equal(sumCurrency(12.333, 45.666, 0.001), 58.0);
});

test('straight-line equipment depreciation spreads across useful life and calculates monthly depreciation', () => {
  const item: StartupCostItem = {
    id: 'eq-1',
    name: 'Commercial Oven',
    classification: 'equipment',
    purchaseCost: 12000,
    residualValue: 0,
    usefulLifeYears: 5,
    purchaseMonth: 1
  };
  const dep = calculateEquipmentDepreciation(item);
  assert.equal(dep.annualDepreciation, 2400);
  assert.equal(dep.monthlyDepreciation, 200);
  assert.equal(dep.usefulLifeYears, 5);
});

test('straight-line depreciation accounts for salvage / residual value', () => {
  const item: StartupCostItem = {
    id: 'eq-2',
    name: 'Delivery Van',
    classification: 'equipment',
    purchaseCost: 25000,
    residualValue: 5000,
    usefulLifeYears: 4,
    purchaseMonth: 1
  };
  const dep = calculateEquipmentDepreciation(item);
  assert.equal(dep.depreciableBase, 20000);
  assert.equal(dep.annualDepreciation, 5000);
  assert.equal(dep.monthlyDepreciation, 416.67);
});

test('rental equipment calculation computes utilization, monthly units and rental revenue', () => {
  const rentalItem: StartupCostItem = {
    id: 'eq-rental-1',
    name: 'Heavy Excavator',
    classification: 'equipment',
    purchaseCost: 60000,
    usefulLifeYears: 5,
    purchaseMonth: 1,
    isRentalRevenueGenerator: true,
    rentalUnitsOwned: 2,
    rentalAvailableTimePerUnit: 25, // 25 days/month
    rentalUtilisationPercent: 80, // 80% utilization
    rentalRatePerUnit: 500, // $500/day
    rentalTimeUnit: 'days'
  };
  const result = calculateEquipmentRentalRevenue(rentalItem);
  // Total possible units = 2 * 25 = 50 days
  // Utilized days = 50 * 0.8 = 40 days
  // Revenue = 40 * 500 = $20,000 / month
  assert.equal(result.monthlyRentalDaysOrHours, 40);
  assert.equal(result.monthlyRentalRevenue, 20000);
});

test('generalised service capacity handles both staff and equipment resources', () => {
  const staffPlan = calculateServiceCapacity({
    resourceType: 'staff',
    resourceCount: 3,
    availableTimePerResource: 160,
    targetUtilisationPercent: 75,
    hourlyOrDailyRate: 50
  });
  // 3 staff * 160 hrs = 480 hrs * 0.75 = 360 billable hrs
  // Revenue = 360 * 50 = $18,000
  assert.equal(staffPlan.totalCapacityUnits, 480);
  assert.equal(staffPlan.effectiveCapacityUnits, 360);
  assert.equal(staffPlan.monthlyRevenuePotential, 18000);
});

test('12-month Year 1 forecast engine isolates equipment cash hit to purchase month while spreading depreciation', () => {
  const plan: StartupPlanDetails = {
    cogs: 10,
    markup: 50,
    monthlyVolume: 100,
    rent: 1000,
    salaries: 2000,
    marketing: 300,
    utilities: 200,
    otherExpenses: 100,
    growthRateYear3: 15,
    growthRateYear5: 35,
    businessModelType: 'goods',
    goodsType: 'make',
    startingCash: 50000,
    costItems: [
      {
        id: 'eq-lathe',
        name: 'Industrial Lathe',
        classification: 'equipment',
        purchaseCost: 12000,
        residualValue: 0,
        usefulLifeYears: 5,
        purchaseMonth: 1 // purchased in Month 1
      },
      {
        id: 'op-rent',
        name: 'Factory Rent',
        classification: 'operating',
        monthlyExpenseAmount: 1500
      }
    ],
    goodsProducts: [
      {
        id: 'prod-1',
        name: 'Precision Widget',
        sellingPrice: 50,
        monthlySalesVolume: 200,
        monthlyGrowthRatePercent: 0 // flat for straightforward math
      }
    ]
  };

  const forecast = generateStartupFinancialForecast(plan);
  const m1 = forecast.monthlyYear1[0];
  const m2 = forecast.monthlyYear1[1];

  // Month 1 cash outflow includes full $12,000 equipment purchase
  assert.equal(m1.cashPurchasesEquipment, 12000);
  // Month 2 cash outflow does NOT include equipment purchase
  assert.equal(m2.cashPurchasesEquipment, 0);

  // Depreciation in P&L is $200 in both Month 1 and Month 2 ($12,000 / 5 yrs / 12 mos = $200/mo)
  assert.equal(m1.depreciation, 200);
  assert.equal(m2.depreciation, 200);

  // Depreciation is NOT subtracted from Cash Flow directly, but full purchase is in Month 1
  assert.ok(m1.cashFlow < m2.cashFlow);
});

test('calculateLoanAmortizationSchedule correctly calculates PMT, schedule, and DSCR', () => {
  const result = calculateLoanAmortizationSchedule(
    {
      enabled: true,
      loanAmount: 100000,
      annualInterestRate: 7.0,
      termYears: 5,
      paymentFrequency: 'monthly',
      negotiationFee: 675,
      includeFeesInLoan: false,
      gracePeriodMonths: 0
    },
    'USD',
    2.70,
    30000 // $30k Year 1 EBITDA
  );

  assert.ok(result);
  assert.equal(result.loanAmount, 100000);
  assert.equal(result.totalFees, 675);
  assert.equal(result.effectiveLoanAmount, 100000);
  // PMT for $100k @ 7% APR for 5 years = ~$1,980.12/mo
  assert.ok(result.periodicPayment > 1950 && result.periodicPayment < 2010);
  assert.equal(result.totalPayments, 60);
  assert.equal(result.schedule.length, 60);
  
  // Ending balance of final row should be 0
  assert.equal(result.schedule[59].endingBalance, 0);

  // Annual debt service ~$23,761.44
  assert.ok(result.annualDebtService > 23000 && result.annualDebtService < 24000);
  // DSCR = 30000 / 23761 = ~1.26 (adequate)
  assert.ok(result.dscrYear1 >= 1.25);
  assert.equal(result.dscrStatus, 'adequate');
});

test('computeStartupCalculations separates service business direct costs from fixed operating expenses', () => {
  const servicePlan: StartupPlanDetails = {
    cogs: 0,
    markup: 0,
    monthlyVolume: 20,
    growthRateYear3: 10,
    growthRateYear5: 25,
    businessModelType: 'services',
    operatingModel: 'mobile',
    displayCurrency: 'XCD',
    exchangeRate: 2.70,
    rent: 1500,
    salaries: 3000,
    marketing: 500,
    utilities: 300,
    otherExpenses: 200,
    serviceOfferings: [
      {
        id: 'svc-1',
        name: 'Mobile Laser Tag Party (10 players)',
        revenueModel: 'project',
        rate: 550, // EC$550 per booking
        expectedVolume: 20, // 20 parties/month = EC$11,000
        directCostPerUnitOrJob: 50 // EC$50 per party in direct consumables
      }
    ],
    costItems: [
      {
        id: 'eq-lasers',
        name: 'Laser Tag Phasers (16 units)',
        classification: 'equipment',
        purchaseCost: 25000, // EC$25,000 landed
        usefulLifeYears: 5
      }
    ]
  };

  const calc = computeStartupCalculations(servicePlan);
  assert.equal(calc.isServiceBusiness, true);
  assert.equal(calc.monthlyRevenue, 11000);
  // Direct variable cost = 20 * $50 = $1,000
  assert.equal(calc.monthlyCOGS, 1000);
  // Gross profit / contribution margin = $11,000 - $1,000 = $10,000
  assert.equal(calc.monthlyGrossProfit, 10000);
  // Fixed OpEx = 1500 + 3000 + 500 + 300 + 200 = $5,500
  assert.equal(calc.monthlyOpExpenses, 5500);
  // Net operating profit (EBITDA) = $10,000 - $5,500 = $4,500
  assert.equal(calc.monthlyNetOperatingProfit, 4500);
  // Year 1 Revenue = $132,000
  assert.equal(calc.y1Rev, 132000);
  // Year 1 Net = $54,000
  assert.equal(calc.y1Net, 54000);
});

test('normalizeCostItemAmount accurately computes landed duties and avoids double-converting currency', () => {
  const itemWithLandedDuty: StartupCostItem = {
    id: 'eq-import-1',
    name: 'Tactical Gaming Helmets',
    classification: 'equipment',
    currency: 'USD',
    purchaseCost: 2000, // $2,000 USD FOB
    importDetails: {
      isImported: true,
      category: 'general_commercial',
      cifValueUSD: 2300, // $2,300 USD CIF
      totalLandedCostXCD: 9089.60, // Exact ASYCUDA calculated EC$ landed cost
      totalLandedCostUSD: 3366.52
    }
  };

  // When requesting base currency XCD:
  const xcdAmount = normalizeCostItemAmount(itemWithLandedDuty, 'XCD', 2.70);
  assert.equal(xcdAmount, 9089.60);

  // When requesting display currency USD:
  const usdAmount = normalizeCostItemAmount(itemWithLandedDuty, 'USD', 2.70);
  assert.equal(usdAmount, 3366.52);
});

test('existing plan without businessModelType flags needsBusinessModelClassification', () => {
  assert.equal(needsBusinessModelClassification(undefined), true);
  assert.equal(needsBusinessModelClassification({ cogs: 10 } as any), true);
  assert.equal(needsBusinessModelClassification({ businessModelType: 'goods' } as any), false);
});

test('buildBusinessPlanPresentation correctly models service offerings, fees and loan disclosures', () => {
  const servicePlan: StartupPlanDetails = {
    businessModelType: 'services',
    cogs: 0,
    markup: 0,
    monthlyVolume: 10,
    growthRateYear3: 15,
    growthRateYear5: 20,
    displayCurrency: 'XCD',
    exchangeRate: 2.70,
    rent: 1500,
    salaries: 3000,
    marketing: 500,
    utilities: 300,
    otherExpenses: 200,
    serviceOfferings: [
      {
        id: 'svc-1',
        name: 'VIP Private Party',
        revenueModel: 'event',
        rate: 800,
        expectedVolume: 10,
        directCostPerUnitOrJob: 100
      }
    ],
    loanParameters: {
      enabled: true,
      loanAmount: 50000,
      annualInterestRate: 8.5,
      termYears: 5,
      paymentFrequency: 'monthly',
      negotiationFeePercent: 1.5,
      insuranceFeePercent: 0.5,
      includeFeesInLoan: true
    }
  };

  const calc = computeStartupCalculations(servicePlan);
  const presentation = buildBusinessPlanPresentation(servicePlan, calc);

  assert.equal(presentation.isServiceBusiness, true);
  assert.equal(presentation.currencyCode, 'XCD');
  assert.equal(presentation.currencySymbol, 'EC$');
  assert.equal(presentation.revenueStreams.length, 1);
  assert.equal(presentation.revenueStreams[0].name, 'VIP Private Party');
  assert.equal(presentation.revenueStreams[0].unitLabel, 'Events');
  assert.equal(presentation.revenueStreams[0].monthlyRevenue, 8000);
  assert.equal(presentation.revenueStreams[0].contributionMargin, 700);
  assert.equal(presentation.revenueStreams[0].contributionMarginPercent, 88);

  assert.ok(presentation.loan);
  assert.equal(presentation.loan.principal, 50000);
  // Total fees = 1.5% + 0.5% = 2.0% = $1,000 -> opening balance = $51,000
  assert.equal(presentation.loan.openingBalance, 51000);
  assert.equal(presentation.loan.totalFees, 1000);
  assert.ok(presentation.loan.dscrYear1 > 0);
  assert.equal(presentation.loan.dscrStatus, 'adequate');
});

test('validateBusinessPlan assesses narrative completeness, loan viability and returns proper status', () => {
  const incompletePlan: StartupPlanDetails = {
    businessModelType: 'goods',
    cogs: 10,
    markup: 50,
    monthlyVolume: 100,
    rent: 0,
    salaries: 0,
    marketing: 0,
    utilities: 0,
    otherExpenses: 0,
    growthRateYear3: 10,
    growthRateYear5: 15
  };

  const incompleteStatus = validateBusinessPlan(incompletePlan);
  assert.ok(incompleteStatus.completionPercent < 30);
  assert.equal(incompleteStatus.status, 'draft');

  const completeBusinessPlanSections: Record<string, string> = {
    companyName: 'Island Laser Sports',
    preparedBy: 'Managing Director',
    fundingAgencyOrBank: 'Saint Lucia Development Bank',
    executiveSummary: 'Island Laser Sports is a premier entertainment hub projecting EC$120,000 in annual revenue.',
    businessDescription: 'High quality tactical recreation.',
    businessObjectives: 'Attain 30% local market share in 24 months.',
    problemOpportunity: 'Growing demand for experiential entertainment in Saint Lucia.',
    targetMarket: 'Youth, corporate groups, and tourists.',
    customerProfile: 'Tech-savvy teens and active adults.',
    marketAnalysis: 'Tourism entertainment sector growing at 8% annually.',
    competitorAnalysis: 'Limited direct competition in laser tag sector.',
    competitiveAdvantage: 'Exclusive outdoor and indoor arenas with wireless phasers.',
    productsServices: 'Laser tag combat simulation experiences.',
    businessModel: 'Direct-to-consumer bookings and corporate retreats.',
    revenueModel: 'Per-game admissions and private event packages.',
    marketingSalesStrategy: 'Social media, hotel partnerships, and event sponsorships.',
    operationsPlan: 'Operating 6 days a week with certified safety instructors.',
    equipmentTechRequirements: '32 laser phasers, mesh network nodes, and scoring displays.',
    suppliers: 'Direct manufacturer partnerships for gear maintenance.',
    managementStaffing: 'Experienced entertainment manager and 4 part-time coordinators.',
    startupRequirements: 'EC$100,000 initial capital for facility fit-out and hardware.',
    financialRequirements: 'EC$50,000 equity injection and EC$50,000 debt facility.',
    salesRevenueProjectionsNotes: 'Projecting EC$120,000 in Year 1 revenue with 50 private party bookings monthly.',
    operatingCostsNotes: 'Fixed overhead capped at EC$3,600 monthly.',
    fundingRequirements: 'Seeking EC$50,000 capital expenditure loan.',
    useOfFunds: 'Procurement of laser tag fleet and mobile obstacle course.',
    implementationPlan: 'Setup and launch within 60 days of funding approval.',
    milestonesNotes: 'Break-even projected at Month 3.',
    risksMitigation: 'Comprehensive liability insurance and equipment warranties.',
    conclusion: 'Island Laser Sports represents an exceptional commercial opportunity.'
  };

  const completePlan: StartupPlanDetails = {
    businessModelType: 'services',
    operatingModel: 'mobile',
    cogs: 0,
    markup: 0,
    monthlyVolume: 50,
    growthRateYear3: 15,
    growthRateYear5: 20,
    displayCurrency: 'XCD',
    serviceOfferings: [
      {
        id: 'svc-1',
        name: 'Standard Package',
        revenueModel: 'package',
        rate: 200,
        expectedVolume: 50,
        directCostPerUnitOrJob: 30
      }
    ],
    rent: 1000,
    salaries: 2000,
    marketing: 200,
    utilities: 300,
    otherExpenses: 100,
    businessPlan: completeBusinessPlanSections as any
  };

  const completeStatus = validateBusinessPlan(completePlan);
  assert.ok(completeStatus.completionPercent >= 90);
  assert.equal(completeStatus.status, 'bank_ready');
});

test('calculateMonthlyOperatingExpenses enforces single source-of-truth precedence and prevents double counting', () => {
  // Scenario 1: Plan with explicit operating costItems (Ledger takes precedence over legacy fields)
  const planWithLedger: StartupPlanDetails = {
    cogs: 0,
    markup: 0,
    monthlyVolume: 0,
    growthRateYear3: 0,
    growthRateYear5: 0,
    rent: 2000,
    salaries: 5000,
    marketing: 1000,
    utilities: 500,
    otherExpenses: 300,
    costItems: [
      {
        id: 'cost-op-rent',
        name: 'Facility Lease',
        classification: 'operating',
        monthlyExpenseAmount: 2000
      },
      {
        id: 'cost-op-salaries',
        name: 'Staff Payroll',
        classification: 'operating',
        monthlyExpenseAmount: 5000
      },
      {
        id: 'cost-op-mktg',
        name: 'Digital Advertising',
        classification: 'operating',
        monthlyExpenseAmount: 1000
      }
    ]
  };

  const opexLedger = calculateMonthlyOperatingExpenses(planWithLedger);
  // Total should be 2000 + 5000 + 1000 = 8000, NOT double-counted with legacy fields!
  assert.equal(opexLedger.monthlyTotal, 8000);
  assert.equal(opexLedger.annualTotal, 96000);
  assert.equal(opexLedger.operatingExpensesBreakdown.length, 3);

  // Scenario 2: Legacy plan without costItems (Fallback to legacy fields)
  const legacyPlan: StartupPlanDetails = {
    cogs: 0,
    markup: 0,
    monthlyVolume: 0,
    growthRateYear3: 0,
    growthRateYear5: 0,
    rent: 1500,
    salaries: 3000,
    marketing: 500,
    utilities: 300,
    otherExpenses: 200
  };

  const opexLegacy = calculateMonthlyOperatingExpenses(legacyPlan);
  assert.equal(opexLegacy.monthlyTotal, 5500);
  assert.equal(opexLegacy.annualTotal, 66000);
  assert.equal(opexLegacy.operatingExpensesBreakdown.length, 5);
});

test('buildBusinessPlanPresentation computes accurate EBITDA, EBIT, EBT, and Net Profit values', () => {
  const plan: StartupPlanDetails = {
    businessModelType: 'services',
    cogs: 0,
    markup: 0,
    monthlyVolume: 100,
    growthRateYear3: 0,
    growthRateYear5: 0,
    rent: 2000,
    salaries: 3000,
    marketing: 0,
    utilities: 0,
    otherExpenses: 0,
    serviceOfferings: [
      {
        id: 'svc-1',
        name: 'Arena Session',
        revenueModel: 'per_participant',
        unitLabel: 'Participants',
        rate: 50,
        expectedVolume: 100, // Monthly rev = 5,000; Annual = 60,000
        directCostPerUnitOrJob: 10 // Monthly direct = 1,000; Annual = 12,000
      }
    ],
    costItems: [
      {
        id: 'eq-1',
        name: 'Arena Gear',
        classification: 'equipment',
        purchaseCost: 12000, // Depreciation = 12,000 / 5 = 2,400/yr (200/mo)
        usefulLifeYears: 5
      }
    ],
    loanParameters: {
      enabled: true,
      loanAmount: 20000,
      annualInterestRate: 10.0,
      termYears: 5,
      paymentFrequency: 'monthly',
      negotiationFee: 0,
      includeFeesInLoan: false
    }
  };

  const calcs = computeStartupCalculations(plan);
  const presentation = buildBusinessPlanPresentation(plan, calcs);

  // Year 1 Revenue = $60,000
  assert.equal(presentation.year1.revenue, 60000);
  // Year 1 Direct Costs = $12,000
  assert.equal(presentation.year1.cogs, 12000);
  // Gross Profit = $48,000
  assert.equal(presentation.year1.grossProfit, 48000);
  // Fixed OpEx = ($2000 + $3000) * 12 = $60,000
  assert.equal(presentation.year1.operatingExpenses, 60000);
  // EBITDA = $48,000 - $60,000 = -$12,000
  assert.equal(presentation.year1.ebitda, -12000);
  // Depreciation = $2,400
  assert.equal(presentation.year1.depreciation, 2400);
  // EBIT = EBITDA - Depreciation = -$12,000 - $2,400 = -$14,400
  assert.equal(presentation.year1.ebit, -14400);
});

test('calculateLoanAmortizationSchedule supports grace period deferral and fee capitalization', () => {
  const resultWithGrace = calculateLoanAmortizationSchedule(
    {
      enabled: true,
      loanAmount: 100000,
      annualInterestRate: 6.0,
      termYears: 5,
      paymentFrequency: 'monthly',
      negotiationFee: 1000,
      insuranceFee: 500,
      includeFeesInLoan: true, // Capitalized -> Effective loan = 101,500
      gracePeriodMonths: 6,
      gracePeriodType: 'full_defer'
    },
    'USD',
    1.0,
    25000
  );

  assert.equal(resultWithGrace.loanAmount, 100000);
  assert.equal(resultWithGrace.totalFees, 1500);
  assert.equal(resultWithGrace.effectiveLoanAmount, 101500);
  assert.equal(resultWithGrace.schedule.length, 60);

  // First 6 payments should have 0 principal repayment in full_defer grace period
  for (let i = 0; i < 6; i++) {
    assert.equal(resultWithGrace.schedule[i].principalPaid, 0);
  }
});

test('formatBusinessPlanMarkdownToHtml safely parses bold, italics, lists and headings', () => {
  const markdown = `
### Market Highlights
* Point 1 with **strong evidence**
* Point 2 with *growth potential*

This is a regular narrative paragraph.
  `;

  const html = formatBusinessPlanMarkdownToHtml(markdown);
  assert.ok(html.includes('Market Highlights'));
  assert.ok(html.includes('<li>Point 1 with <strong>strong evidence</strong></li>'));
  assert.ok(html.includes('<em>growth potential</em>'));
  assert.ok(html.includes('<p class="text-stone-700 text-xs leading-relaxed mb-2">This is a regular narrative paragraph.</p>'));
});

