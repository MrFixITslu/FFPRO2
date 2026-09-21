import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundCurrency,
  sumCurrency,
  calculateEquipmentDepreciation,
  calculateEquipmentRentalRevenue,
  calculateServiceCapacity,
  calculateLoanAmortizationSchedule,
  generateStartupFinancialForecast,
  needsBusinessModelClassification
} from '../src/services/startupFinancialsService.ts';
import { computeStartupCalculations } from '../src/services/businessPlanExportService.ts';
import { normalizeCostItemAmount, DEFAULT_BASE_CURRENCY } from '../src/services/currencyService.ts';
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

