import {
  StartupPlanDetails,
  StartupCostItem,
  GoodsProduct,
  ServiceOffering,
  ServiceCapacityPlan,
  MonthlyForecastMonth,
  YearlyForecastSummary,
  BreakEvenResult,
  CostItemClassification,
  BusinessModelType,
  ServiceRevenueModel
} from '../types';

/**
 * Cents-safe currency rounding
 */
export function roundCurrency(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Cents-safe sum
 */
export function sumCurrency(...values: (number | undefined)[]): number {
  const sum = values.reduce<number>((acc, v) => acc + (v || 0), 0);
  return roundCurrency(sum);
}

/**
 * Check whether a project's startupDetails need business model classification
 */
export function needsBusinessModelClassification(sd?: StartupPlanDetails): boolean {
  return !sd || !sd.businessModelType;
}

/**
 * Compute straight-line annual & monthly depreciation for an equipment cost item
 */
export function calculateEquipmentDepreciation(item: StartupCostItem): {
  annualDepreciation: number;
  monthlyDepreciation: number;
  usefulLifeYears: number;
  depreciableBase: number;
} {
  const cost = item.purchaseCost ?? item.amount ?? 0;
  const residual = item.residualValue ?? 0;
  const usefulLife = Math.max(1, item.usefulLifeYears ?? 3);
  const depreciableBase = Math.max(0, cost - residual);
  const annualDepreciation = roundCurrency(depreciableBase / usefulLife);
  const monthlyDepreciation = roundCurrency(annualDepreciation / 12);

  return {
    annualDepreciation,
    monthlyDepreciation,
    usefulLifeYears: usefulLife,
    depreciableBase
  };
}

/**
 * Compute rental equipment revenue & capacity for a single rental equipment item (Decision 2)
 */
export function calculateEquipmentRentalRevenue(item: StartupCostItem): {
  unitsOwned: number;
  availableTimePerUnit: number;
  utilisationPercent: number;
  ratePerUnit: number;
  monthlyRentalDaysOrHours: number;
  monthlyRentalRevenue: number;
  timeUnit: 'days' | 'hours';
} {
  if (!item.isRentalRevenueGenerator) {
    return {
      unitsOwned: 0,
      availableTimePerUnit: 0,
      utilisationPercent: 0,
      ratePerUnit: 0,
      monthlyRentalDaysOrHours: 0,
      monthlyRentalRevenue: 0,
      timeUnit: 'days'
    };
  }

  const unitsOwned = Math.max(1, item.rentalUnitsOwned ?? item.quantity ?? 1);
  const availableTime = Math.max(1, item.rentalAvailableTimePerUnit ?? (item.rentalTimeUnit === 'hours' ? 160 : 30));
  const utilisation = Math.max(0, Math.min(100, item.rentalUtilisationPercent ?? 60));
  const rate = Math.max(0, item.rentalRatePerUnit ?? 0);
  const timeUnit = item.rentalTimeUnit || 'days';

  const totalPossibleUnits = unitsOwned * availableTime;
  const monthlyRentalDaysOrHours = roundCurrency(totalPossibleUnits * (utilisation / 100));
  const monthlyRentalRevenue = roundCurrency(monthlyRentalDaysOrHours * rate);

  return {
    unitsOwned,
    availableTimePerUnit: availableTime,
    utilisationPercent: utilisation,
    ratePerUnit: rate,
    monthlyRentalDaysOrHours,
    monthlyRentalRevenue,
    timeUnit
  };
}

/**
 * Generalised service capacity calculator for staff or equipment resources (Decision 2)
 */
export function calculateServiceCapacity(plan?: ServiceCapacityPlan): {
  totalCapacityUnits: number;
  effectiveCapacityUnits: number;
  monthlyRevenuePotential: number;
} {
  if (!plan) {
    return { totalCapacityUnits: 0, effectiveCapacityUnits: 0, monthlyRevenuePotential: 0 };
  }

  const count = Math.max(1, plan.resourceCount || 1);
  const timePerResource = Math.max(1, plan.availableTimePerResource || (plan.resourceType === 'staff' ? 160 : 30));
  const utilisation = Math.max(0, Math.min(100, plan.targetUtilisationPercent || 75));
  const rate = Math.max(0, plan.hourlyOrDailyRate || 0);

  const totalCapacityUnits = count * timePerResource;
  const effectiveCapacityUnits = roundCurrency(totalCapacityUnits * (utilisation / 100));
  const monthlyRevenuePotential = roundCurrency(effectiveCapacityUnits * rate);

  return {
    totalCapacityUnits,
    effectiveCapacityUnits,
    monthlyRevenuePotential
  };
}

/**
 * Extract unified list of cost items from startupDetails, merging legacy fields if needed
 */
export function extractUnifiedCostItems(sd?: StartupPlanDetails): StartupCostItem[] {
  if (!sd) return [];
  
  const explicitItems: StartupCostItem[] = sd.costItems ? [...sd.costItems] : [];

  // If there are explicit cost items, return them
  if (explicitItems.length > 0) {
    return explicitItems;
  }

  // Synthesize from legacy fields if costItems is empty
  const synthesized: StartupCostItem[] = [];

  // Legacy production items -> Stock / Raw materials
  if (sd.productionItems && sd.productionItems.length > 0) {
    sd.productionItems.forEach((pi) => {
      synthesized.push({
        id: pi.id || `legacy-prod-${Math.random()}`,
        name: pi.name || 'Raw Material',
        classification: 'stock',
        category: 'Materials',
        stockQuantity: pi.quantity || 1,
        stockUnitCost: pi.unitCost || pi.cost || 0,
        directCostPerUnitOrJob: pi.cost || 0,
        notes: 'Migrated from legacy production items'
      });
    });
  }

  // Legacy Operating Expenses -> Recurring Operating Expenses
  if (sd.rent) {
    synthesized.push({
      id: 'legacy-rent',
      name: 'Premises Rent & Lease',
      classification: 'operating',
      category: 'Rent',
      monthlyExpenseAmount: sd.rent
    });
  }
  if (sd.salaries) {
    synthesized.push({
      id: 'legacy-salaries',
      name: 'Staff Wages & Payroll',
      classification: 'operating',
      category: 'Salaries',
      monthlyExpenseAmount: sd.salaries
    });
  }
  if (sd.utilities) {
    synthesized.push({
      id: 'legacy-utilities',
      name: 'Utilities & Power',
      classification: 'operating',
      category: 'Utilities',
      monthlyExpenseAmount: sd.utilities
    });
  }
  if (sd.marketing) {
    synthesized.push({
      id: 'legacy-marketing',
      name: 'Marketing & Customer Acquisition',
      classification: 'operating',
      category: 'Marketing',
      monthlyExpenseAmount: sd.marketing
    });
  }
  if (sd.otherExpenses) {
    synthesized.push({
      id: 'legacy-other-op',
      name: 'Administrative & Other Overheads',
      classification: 'operating',
      category: 'Administrative',
      monthlyExpenseAmount: sd.otherExpenses
    });
  }

  if (sd.customExpenses && sd.customExpenses.length > 0) {
    sd.customExpenses.forEach((ce, idx) => {
      synthesized.push({
        id: `legacy-custom-${idx}`,
        name: ce.name || 'Custom Expense',
        classification: 'operating',
        category: ce.category || 'General',
        monthlyExpenseAmount: ce.amount || 0
      });
    });
  }

  return synthesized;
}

/**
 * 12-Month Year 1 Forecast Engine + 5-Year Projections (Decision 3)
 */
export function generateStartupFinancialForecast(sd?: StartupPlanDetails): {
  monthlyYear1: MonthlyForecastMonth[];
  yearlyProjections: YearlyForecastSummary[];
  breakEven: BreakEvenResult;
  totalsYear1: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number;
    depreciation: number;
    netProfit: number;
    cashInflow: number;
    cashOutflow: number;
    netCashFlow: number;
    endingCash: number;
    equipmentCapitalOutlay: number;
  };
} {
  const modelType: BusinessModelType = sd?.businessModelType || 'goods';
  const goodsType = sd?.goodsType || 'make';
  const costItems = extractUnifiedCostItems(sd);
  const startingCash = sd?.startingCash ?? 0;

  // 1. Group cost items by classification
  const equipmentItems = costItems.filter((i) => i.classification === 'equipment');
  const stockItems = costItems.filter((i) => i.classification === 'stock');
  const directCostItems = costItems.filter((i) => i.classification === 'direct');
  const recurringOpExItems = costItems.filter((i) => i.classification === 'operating');
  const setupCostItems = costItems.filter((i) => i.classification === 'setup');

  // Baseline Goods Products
  let goodsProducts: GoodsProduct[] = sd?.goodsProducts || [];
  if (goodsProducts.length === 0 && (modelType === 'goods' || modelType === 'both')) {
    const defaultPrice = sd?.cogs ? sd.cogs * (1 + (sd.markup || 50) / 100) : 25;
    goodsProducts = [
      {
        id: 'default-goods-1',
        name: goodsType === 'make' ? 'Core Manufactured Product' : 'Core Resale Merchandise',
        sellingPrice: roundCurrency(defaultPrice),
        monthlySalesVolume: sd?.monthlyVolume || 500,
        monthlyGrowthRatePercent: 2, // 2% MoM default
        annualGrowthRatePercent: sd?.growthRateYear3 || 15
      }
    ];
  }

  // Baseline Service Offerings
  let serviceOfferings: ServiceOffering[] = sd?.serviceOfferings || [];
  if (serviceOfferings.length === 0 && (modelType === 'services' || modelType === 'both')) {
    serviceOfferings = [
      {
        id: 'default-service-1',
        name: 'Core Service Offering',
        revenueModel: 'project',
        rate: 250,
        expectedVolume: 20,
        monthlyGrowthRatePercent: 2,
        annualGrowthRatePercent: sd?.growthRateYear3 || 15,
        directCostPerUnitOrJob: 35
      }
    ];
  }

  // Calculate monthly depreciation for equipment
  const equipmentDeprecations = equipmentItems.map((item) => {
    const dep = calculateEquipmentDepreciation(item);
    const purchaseMonth = Math.min(12, Math.max(1, item.purchaseMonth ?? 1));
    const purchaseCost = item.purchaseCost ?? item.amount ?? 0;
    return {
      itemId: item.id,
      purchaseMonth,
      purchaseCost,
      monthlyDepreciation: dep.monthlyDepreciation,
      annualDepreciation: dep.annualDepreciation,
      usefulLifeYears: dep.usefulLifeYears
    };
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyYear1: MonthlyForecastMonth[] = [];

  let runningCashBalance = startingCash;
  let runningInventoryUnits = stockItems.reduce((sum, s) => sum + (s.initialStockUnits ?? s.stockQuantity ?? 100), 0);
  let averageStockUnitCost = stockItems.length > 0
    ? stockItems.reduce((sum, s) => sum + (s.stockUnitCost ?? 10), 0) / stockItems.length
    : (sd?.cogs || 10);
  let runningInventoryValue = roundCurrency(runningInventoryUnits * averageStockUnitCost);

  let totalSalesUnitsYear1 = 0;
  let totalServiceHoursOrJobsYear1 = 0;

  for (let m = 1; m <= 12; m++) {
    const monthIndex = m - 1;
    const monthName = monthNames[monthIndex];

    // 1. Revenue Calculations
    let goodsRev = 0;
    let goodsUnits = 0;
    if (modelType === 'goods' || modelType === 'both') {
      goodsProducts.forEach((p) => {
        const growthMoM = (p.monthlyGrowthRatePercent ?? 0) / 100;
        const volume_m = Math.round(p.monthlySalesVolume * Math.pow(1 + growthMoM, monthIndex));
        goodsUnits += volume_m;
        goodsRev += roundCurrency(volume_m * p.sellingPrice);
      });
    }

    let servicesRev = 0;
    let serviceUnits = 0;
    if (modelType === 'services' || modelType === 'both') {
      serviceOfferings.forEach((s) => {
        const growthMoM = (s.monthlyGrowthRatePercent ?? 0) / 100;
        const volume_m = Math.round((s.expectedVolume || 10) * Math.pow(1 + growthMoM, monthIndex));
        serviceUnits += volume_m;
        servicesRev += roundCurrency(volume_m * s.rate);
      });
    }

    // Rental Revenue from Equipment (Decision 2)
    let rentalRev = 0;
    equipmentItems.forEach((eq) => {
      if (eq.isRentalRevenueGenerator && (eq.purchaseMonth ?? 1) <= m) {
        const rentCalc = calculateEquipmentRentalRevenue(eq);
        rentalRev += rentCalc.monthlyRentalRevenue;
      }
    });

    const totalRevenue = sumCurrency(goodsRev, servicesRev, rentalRev);
    totalSalesUnitsYear1 += goodsUnits;
    totalServiceHoursOrJobsYear1 += serviceUnits;

    // 2. COGS & Direct Cost Calculations
    // Direct cost items
    let directCostsTotal = 0;
    directCostItems.forEach((dc) => {
      const perUnit = dc.directCostPerUnitOrJob ?? dc.unitCost ?? 0;
      const applicableVolume = goodsUnits > 0 ? goodsUnits : (serviceUnits > 0 ? serviceUnits : 1);
      directCostsTotal += roundCurrency(perUnit * applicableVolume);
    });

    // Service offering direct costs
    serviceOfferings.forEach((s) => {
      if (s.directCostPerUnitOrJob) {
        const growthMoM = (s.monthlyGrowthRatePercent ?? 0) / 100;
        const volume_m = Math.round((s.expectedVolume || 10) * Math.pow(1 + growthMoM, monthIndex));
        directCostsTotal += roundCurrency(volume_m * s.directCostPerUnitOrJob);
      }
    });

    // Stock COGS & Inventory tracking
    let stockConsumedUnits = 0;
    if (goodsUnits > 0) {
      stockConsumedUnits = goodsUnits;
    }
    const stockCogs = roundCurrency(stockConsumedUnits * averageStockUnitCost);
    const totalCOGS = sumCurrency(stockCogs, directCostsTotal);
    const grossProfit = roundCurrency(totalRevenue - totalCOGS);
    const grossMarginPercent = totalRevenue > 0 ? roundCurrency((grossProfit / totalRevenue) * 100) : 0;

    // Stock Purchases for Cash Flow:
    let stockPurchasesCash = 0;
    if (m === 1) {
      // Initial inventory purchase
      stockPurchasesCash = stockItems.reduce(
        (sum, s) => sum + roundCurrency((s.initialStockUnits ?? s.stockQuantity ?? 100) * (s.stockUnitCost ?? 10)),
        0
      );
      if (stockPurchasesCash === 0 && (modelType === 'goods' || modelType === 'both')) {
        stockPurchasesCash = roundCurrency(goodsUnits * averageStockUnitCost * 1.5);
      }
    } else {
      // Monthly restock matching expected consumption
      stockPurchasesCash = roundCurrency(stockConsumedUnits * averageStockUnitCost);
    }

    // Update inventory balance
    const stockPurchasedUnits = averageStockUnitCost > 0 ? Math.round(stockPurchasesCash / averageStockUnitCost) : stockConsumedUnits;
    runningInventoryUnits = Math.max(0, runningInventoryUnits + stockPurchasedUnits - stockConsumedUnits);
    runningInventoryValue = roundCurrency(runningInventoryUnits * averageStockUnitCost);

    // 3. Operating Expenses (Recurring + One-Time)
    let monthlyRecurringOpEx = recurringOpExItems.reduce(
      (sum, item) => sum + (item.monthlyExpenseAmount ?? item.amount ?? 0),
      0
    );
    // Legacy fallback if recurringOpExItems was empty
    if (monthlyRecurringOpEx === 0 && sd) {
      monthlyRecurringOpEx = sumCurrency(sd.rent, sd.salaries, sd.utilities, sd.marketing, sd.otherExpenses);
    }

    // One-Time Setup Expenses in this month
    const thisMonthSetupExpenses = setupCostItems
      .filter((item) => (item.setupMonth ?? 1) === m)
      .reduce((sum, item) => sum + (item.setupExpenseAmount ?? item.amount ?? 0), 0);

    const totalOpEx = sumCurrency(monthlyRecurringOpEx, thisMonthSetupExpenses);

    // 4. Depreciation (P&L only, active for items purchased on or before this month)
    const activeDepreciation = equipmentDeprecations
      .filter((eq) => eq.purchaseMonth <= m)
      .reduce((sum, eq) => sum + eq.monthlyDepreciation, 0);

    const netProfit = roundCurrency(grossProfit - totalOpEx - activeDepreciation);
    const netMarginPercent = totalRevenue > 0 ? roundCurrency((netProfit / totalRevenue) * 100) : 0;

    // 5. Cash Flow Calculations
    // Full equipment purchase hits cash outflow ONLY in purchaseMonth
    const cashEquipmentPurchases = equipmentDeprecations
      .filter((eq) => eq.purchaseMonth === m)
      .reduce((sum, eq) => sum + eq.purchaseCost, 0);

    const cashInflow = totalRevenue;
    const cashOutflow = sumCurrency(
      cashEquipmentPurchases,
      stockPurchasesCash,
      directCostsTotal,
      monthlyRecurringOpEx,
      thisMonthSetupExpenses
    );
    const monthlyNetCashFlow = roundCurrency(cashInflow - cashOutflow);
    runningCashBalance = roundCurrency(runningCashBalance + monthlyNetCashFlow);

    monthlyYear1.push({
      month: m,
      monthName,
      revenue: totalRevenue,
      goodsRevenue: goodsRev,
      servicesRevenue: servicesRev,
      rentalRevenue: rentalRev,
      cogs: totalCOGS,
      grossProfit,
      grossMarginPercent,
      operatingExpenses: totalOpEx,
      recurringExpenses: monthlyRecurringOpEx,
      setupExpenses: thisMonthSetupExpenses,
      depreciation: activeDepreciation,
      netProfit,
      netMarginPercent,
      cashInflow,
      cashOutflow,
      cashPurchasesEquipment: cashEquipmentPurchases,
      cashPurchasesStock: stockPurchasesCash,
      cashDirectCosts: directCostsTotal,
      cashOperatingExpenses: totalOpEx,
      cashFlow: monthlyNetCashFlow,
      endingCashBalance: runningCashBalance,
      endingInventoryValue: runningInventoryValue,
      endingInventoryUnits: runningInventoryUnits,
      salesVolumeUnits: goodsUnits,
      billableHoursOrJobs: serviceUnits
    });
  }

  // Calculate Year 1 Totals
  const totalRevenueY1 = monthlyYear1.reduce((sum, m) => sum + m.revenue, 0);
  const totalCogsY1 = monthlyYear1.reduce((sum, m) => sum + m.cogs, 0);
  const totalGrossY1 = roundCurrency(totalRevenueY1 - totalCogsY1);
  const totalOpExY1 = monthlyYear1.reduce((sum, m) => sum + m.operatingExpenses, 0);
  const totalDeprecY1 = monthlyYear1.reduce((sum, m) => sum + m.depreciation, 0);
  const totalNetY1 = roundCurrency(totalGrossY1 - totalOpExY1 - totalDeprecY1);
  const totalCashInflowY1 = monthlyYear1.reduce((sum, m) => sum + m.cashInflow, 0);
  const totalCashOutflowY1 = monthlyYear1.reduce((sum, m) => sum + m.cashOutflow, 0);
  const totalNetCashY1 = roundCurrency(totalCashInflowY1 - totalCashOutflowY1);
  const equipmentCapitalOutlay = equipmentDeprecations.reduce((sum, eq) => sum + eq.purchaseCost, 0);

  // 6. Years 2-5 Projections (Decision 3)
  const yearlyProjections: YearlyForecastSummary[] = [
    {
      year: 1,
      revenue: roundCurrency(totalRevenueY1),
      cogs: roundCurrency(totalCogsY1),
      grossProfit: totalGrossY1,
      grossMarginPercent: totalRevenueY1 > 0 ? roundCurrency((totalGrossY1 / totalRevenueY1) * 100) : 0,
      operatingExpenses: roundCurrency(totalOpExY1),
      depreciation: roundCurrency(totalDeprecY1),
      netProfit: totalNetY1,
      netMarginPercent: totalRevenueY1 > 0 ? roundCurrency((totalNetY1 / totalRevenueY1) * 100) : 0,
      cashFlow: totalNetCashY1,
      endingCashBalance: monthlyYear1[11].endingCashBalance
    }
  ];

  let previousCashBalance = monthlyYear1[11].endingCashBalance;
  const growthY3Percent = sd?.growthRateYear3 ?? 15;
  const growthY5Percent = sd?.growthRateYear5 ?? 35;

  for (let year = 2; year <= 5; year++) {
    // Determine annual revenue growth rate
    let annualGrowth = growthY3Percent / 100;
    if (year >= 4) {
      annualGrowth = (growthY5Percent - growthY3Percent) / 2 / 100;
    }

    const prevYear = yearlyProjections[year - 2];
    const yearRevenue = roundCurrency(prevYear.revenue * (1 + annualGrowth));
    // Variable COGS scales with revenue
    const cogsRatio = totalRevenueY1 > 0 ? totalCogsY1 / totalRevenueY1 : 0.4;
    const yearCogs = roundCurrency(yearRevenue * cogsRatio);
    const yearGrossProfit = roundCurrency(yearRevenue - yearCogs);

    // In Year 2+, recurring operating expenses continue with modest 3% inflation, but one-time setup expenses DO NOT repeat
    const baseAnnualRecurringOpEx = (monthlyYear1[11].recurringExpenses) * 12;
    const yearOpEx = roundCurrency(baseAnnualRecurringOpEx * Math.pow(1.03, year - 1));

    // Full annual depreciation for equipment that is still within useful life
    const yearDepreciation = equipmentDeprecations
      .filter((eq) => year <= eq.usefulLifeYears)
      .reduce((sum, eq) => sum + eq.annualDepreciation, 0);

    const yearNetProfit = roundCurrency(yearGrossProfit - yearOpEx - yearDepreciation);
    const netMargin = yearRevenue > 0 ? roundCurrency((yearNetProfit / yearRevenue) * 100) : 0;

    // Cash flow in Year 2+: no new equipment cash outlay unless replacement; depreciation is non-cash
    const yearCashFlow = roundCurrency(yearRevenue - yearCogs - yearOpEx);
    previousCashBalance = roundCurrency(previousCashBalance + yearCashFlow);

    yearlyProjections.push({
      year,
      revenue: yearRevenue,
      cogs: yearCogs,
      grossProfit: yearGrossProfit,
      grossMarginPercent: yearRevenue > 0 ? roundCurrency((yearGrossProfit / yearRevenue) * 100) : 0,
      operatingExpenses: yearOpEx,
      depreciation: roundCurrency(yearDepreciation),
      netProfit: yearNetProfit,
      netMarginPercent: netMargin,
      cashFlow: yearCashFlow,
      endingCashBalance: previousCashBalance
    });
  }

  // 7. Model-Appropriate Break-Even Analysis (Decision 4)
  const averageMonthlyFixedCosts = roundCurrency(
    (totalOpExY1 - setupCostItems.reduce((sum, s) => sum + (s.setupExpenseAmount ?? s.amount ?? 0), 0)) / 12 +
    (totalDeprecY1 / 12)
  );

  const averageMonthlyRevenue = totalRevenueY1 / 12;
  const averageMonthlyCOGS = totalCogsY1 / 12;
  const contributionMarginRatio = averageMonthlyRevenue > 0
    ? (averageMonthlyRevenue - averageMonthlyCOGS) / averageMonthlyRevenue
    : 0.5;

  const breakEvenRevenueMonthly = contributionMarginRatio > 0
    ? roundCurrency(averageMonthlyFixedCosts / contributionMarginRatio)
    : 0;

  let metricLabel = 'units';
  let unitPrice = 0;
  let unitVariableCost = 0;
  let breakEvenUnitsMonthly = 0;

  if (modelType === 'goods') {
    metricLabel = goodsType === 'make' ? 'manufactured units' : 'merchandise units';
    const firstProduct = goodsProducts[0];
    unitPrice = firstProduct ? firstProduct.sellingPrice : 25;
    const cogsUnit = totalSalesUnitsYear1 > 0 ? totalCogsY1 / totalSalesUnitsYear1 : (sd?.cogs || 10);
    unitVariableCost = roundCurrency(cogsUnit);
    const unitContribution = Math.max(0.01, unitPrice - unitVariableCost);
    breakEvenUnitsMonthly = Math.ceil(averageMonthlyFixedCosts / unitContribution);
  } else if (modelType === 'services') {
    const firstService = serviceOfferings[0];
    const revModel = firstService?.revenueModel || 'project';
    if (revModel === 'hourly') {
      metricLabel = 'billable hours';
    } else if (revModel === 'retainer') {
      metricLabel = 'monthly retained clients';
    } else if (revModel === 'subscription') {
      metricLabel = 'active subscribers';
    } else if (revModel === 'rental') {
      metricLabel = 'rental days / units';
    } else {
      metricLabel = 'completed projects';
    }

    unitPrice = firstService ? firstService.rate : 200;
    unitVariableCost = firstService?.directCostPerUnitOrJob ?? 25;
    const unitContribution = Math.max(0.01, unitPrice - unitVariableCost);
    breakEvenUnitsMonthly = Math.ceil(averageMonthlyFixedCosts / unitContribution);
  } else {
    // Hybrid / Both
    metricLabel = 'combined client orders & units';
    unitPrice = averageMonthlyRevenue > 0 && (totalSalesUnitsYear1 + totalServiceHoursOrJobsYear1) > 0
      ? roundCurrency(totalRevenueY1 / (totalSalesUnitsYear1 + totalServiceHoursOrJobsYear1))
      : 50;
    unitVariableCost = (totalSalesUnitsYear1 + totalServiceHoursOrJobsYear1) > 0
      ? roundCurrency(totalCogsY1 / (totalSalesUnitsYear1 + totalServiceHoursOrJobsYear1))
      : 20;
    const unitContribution = Math.max(0.01, unitPrice - unitVariableCost);
    breakEvenUnitsMonthly = Math.ceil(averageMonthlyFixedCosts / unitContribution);
  }

  const unitContributionMargin = roundCurrency(unitPrice - unitVariableCost);
  const safetyMarginPercent = averageMonthlyRevenue > 0
    ? roundCurrency(((averageMonthlyRevenue - breakEvenRevenueMonthly) / averageMonthlyRevenue) * 100)
    : 0;

  const breakEven: BreakEvenResult = {
    monthlyFixedCosts: averageMonthlyFixedCosts,
    averageContributionMarginPercent: roundCurrency(contributionMarginRatio * 100),
    breakEvenRevenueMonthly,
    breakEvenUnitsMonthly,
    breakEvenMetricLabel: metricLabel,
    unitPrice,
    unitVariableCost,
    unitContributionMargin,
    safetyMarginPercent
  };

  return {
    monthlyYear1,
    yearlyProjections,
    breakEven,
    totalsYear1: {
      revenue: roundCurrency(totalRevenueY1),
      cogs: roundCurrency(totalCogsY1),
      grossProfit: totalGrossY1,
      operatingExpenses: roundCurrency(totalOpExY1),
      depreciation: roundCurrency(totalDeprecY1),
      netProfit: totalNetY1,
      cashInflow: roundCurrency(totalCashInflowY1),
      cashOutflow: roundCurrency(totalCashOutflowY1),
      netCashFlow: totalNetCashY1,
      endingCash: monthlyYear1[11].endingCashBalance,
      equipmentCapitalOutlay
    }
  };
}
