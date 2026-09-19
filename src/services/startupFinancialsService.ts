/**
 * startupFinancialsService.ts
 * ---------------------------------------------------------------------------
 * Reusable, business-model-aware financial calculations for the Startup /
 * Business Plan feature. This module is the single source of truth for
 * Goods vs Services vs Hybrid financial logic — no component should
 * re-implement these formulas inline.
 *
 * Design notes:
 * - All currency aggregation happens in integer cents internally, then is
 *   converted back to a rounded-to-cents number on the way out. This avoids
 *   the compounding floating-point drift you get from repeated
 *   `parseFloat(x.toFixed(2))` round-trips on chained calculations.
 * - Every function is pure (no side effects, no AI calls) — deterministic
 *   application code performs the calculations, per the requirement that
 *   AI may only ever *suggest* categorisations, never silently compute or
 *   alter figures.
 * - Every function accepts data conforming to the additive types added to
 *   StartupPlanDetails in types.ts, all of which are optional so existing
 *   projects continue to load unmodified until explicitly classified.
 * ---------------------------------------------------------------------------
 */

import {
  GoodsProduct,
  GoodsInventorySnapshot,
  ServiceOffering,
  ServiceCapacityPlan,
  ServiceDirectCosts,
  ClassifiedExpenseItem,
  StartupBusinessModelType
} from '../types';

// ---------------------------------------------------------------------------
// Currency-safe rounding helpers
// ---------------------------------------------------------------------------

/** Convert a currency amount (dollars) to integer cents, rounding half-up. */
const toCents = (amount: number): number => Math.round((amount || 0) * 100);

/** Convert integer cents back to a currency amount (dollars), 2dp. */
const fromCents = (cents: number): number => Math.round(cents) / 100;

/** Round a currency amount to the nearest cent without a cents round-trip. */
export const roundCurrency = (amount: number): number => fromCents(toCents(amount));

/** Sum an array of dollar amounts using integer-cents arithmetic. */
const sumCurrency = (amounts: Array<number | undefined>): number =>
  fromCents(amounts.reduce((sum: number, a) => sum + toCents(a || 0), 0));

const pct = (value: number | undefined): number => (value || 0) / 100;

// ---------------------------------------------------------------------------
// GOODS — unit cost, COGS, gross profit
// ---------------------------------------------------------------------------

export interface GoodsUnitCostBreakdown {
  productId: string;
  sourcing: 'manufactured' | 'resale';
  rawMaterialsCost: number;
  directLabourCost: number;
  overheadCost: number;
  purchaseCost: number;
  freightImportCost: number;
  dutiesTaxesCost: number;
  packagingCost: number;
  distributionCost: number;
  returnsAllowanceCost: number;
  wasteAdjustedCost: number;
  unitCost: number;
  sellingPrice: number;
  grossProfitPerUnit: number;
  grossMarginPercent: number;
}

/**
 * Calculates the fully-loaded unit cost for a single product, following the
 * manufacturing formula (raw materials + direct labour + overhead + packaging
 * + other direct production costs) or the resale formula (purchase cost +
 * freight/import + costs required to bring inventory to saleable condition),
 * per the product's own `sourcing` value.
 */
export function calculateGoodsUnitCost(product: GoodsProduct): GoodsUnitCostBreakdown {
  const packagingCost = product.packagingCostPerUnit || 0;
  const distributionCost = product.distributionCostPerUnit || 0;
  const dutiesTaxesCost = 0; // duties are typically levied on landed cost — see below
  const returnsAllowanceCost = 0; // applied as a % of selling price, not unit cost — see gross profit calc

  let rawMaterialsCost = 0;
  let directLabourCost = 0;
  let overheadCost = 0;
  let purchaseCost = 0;
  let freightImportCost = 0;
  let preWasteCost: number;

  if (product.sourcing === 'manufactured') {
    rawMaterialsCost = sumCurrency(
      (product.rawMaterials || []).map((m) => (m.quantityPerUnit || 0) * (m.costPerUnit || 0))
    );
    directLabourCost = product.directProductionLabourPerUnit || 0;
    overheadCost = product.productionOverheadPerUnit || 0;
    preWasteCost = sumCurrency([rawMaterialsCost, directLabourCost, overheadCost, packagingCost]);
  } else {
    purchaseCost = product.purchaseCostPerUnit || 0;
    freightImportCost = product.freightImportCostPerUnit ?? product.importShippingCostPerUnit ?? 0;
    preWasteCost = sumCurrency([purchaseCost, freightImportCost, packagingCost]);
  }

  // Duties/taxes applied on landed cost (purchase+freight, or materials+labour+overhead)
  const dutiesCost = roundCurrency(preWasteCost * pct(product.dutiesTaxesPercent));

  // Waste/scrap inflates the effective per-unit cost (only meaningful for manufacturing,
  // but harmless — defaults to 0 — for resale products).
  const wastePct = pct(product.wasteScrapPercent);
  const wasteAdjustedCost =
    wastePct > 0 && wastePct < 1
      ? roundCurrency((preWasteCost + dutiesCost) / (1 - wastePct))
      : roundCurrency(preWasteCost + dutiesCost);

  const unitCost = sumCurrency([wasteAdjustedCost, distributionCost]);
  const sellingPrice = product.sellingPrice || 0;

  // Returns/warranty allowance reduces effective realised revenue per unit.
  const returnsAllowancePct = pct(product.returnsWarrantyAllowancePercent);
  const effectiveSellingPrice = roundCurrency(sellingPrice * (1 - returnsAllowancePct));

  const grossProfitPerUnit = roundCurrency(effectiveSellingPrice - unitCost);
  const grossMarginPercent = sellingPrice > 0 ? roundCurrency((grossProfitPerUnit / sellingPrice) * 100) : 0;

  return {
    productId: product.id,
    sourcing: product.sourcing,
    rawMaterialsCost,
    directLabourCost,
    overheadCost,
    purchaseCost,
    freightImportCost,
    dutiesTaxesCost: dutiesCost,
    packagingCost,
    distributionCost,
    returnsAllowanceCost: roundCurrency(sellingPrice * returnsAllowancePct),
    wasteAdjustedCost,
    unitCost,
    sellingPrice,
    grossProfitPerUnit,
    grossMarginPercent
  };
}

export interface GoodsMonthlyResult {
  products: Array<GoodsUnitCostBreakdown & { monthlyUnits: number; monthlyRevenue: number; monthlyCOGS: number; monthlyGrossProfit: number }>;
  monthlyRevenue: number;
  monthlyCOGS: number;
  monthlyGrossProfit: number;
  grossMarginPercent: number;
}

/**
 * Aggregates per-product unit economics into a monthly Goods result.
 * COGS here is a per-unit-cost x units-sold approximation suitable for
 * monthly forecasting; `calculateGoodsCOGSFromInventory` below implements
 * the formal Beginning + Purchases − Ending inventory formula for periods
 * where actual inventory snapshots are available (e.g. month-end close).
 */
export function calculateGoodsMonthlyResult(products: GoodsProduct[]): GoodsMonthlyResult {
  const lines = products.map((p) => {
    const breakdown = calculateGoodsUnitCost(p);
    const monthlyUnits = p.expectedMonthlyUnits || 0;
    const monthlyRevenue = roundCurrency(breakdown.sellingPrice * monthlyUnits);
    const monthlyCOGS = roundCurrency(breakdown.unitCost * monthlyUnits);
    const monthlyGrossProfit = roundCurrency(monthlyRevenue - monthlyCOGS);
    return { ...breakdown, monthlyUnits, monthlyRevenue, monthlyCOGS, monthlyGrossProfit };
  });

  const monthlyRevenue = sumCurrency(lines.map((l) => l.monthlyRevenue));
  const monthlyCOGS = sumCurrency(lines.map((l) => l.monthlyCOGS));
  const monthlyGrossProfit = roundCurrency(monthlyRevenue - monthlyCOGS);
  const grossMarginPercent = monthlyRevenue > 0 ? roundCurrency((monthlyGrossProfit / monthlyRevenue) * 100) : 0;

  return { products: lines, monthlyRevenue, monthlyCOGS, monthlyGrossProfit, grossMarginPercent };
}

/** Formal inventory-based COGS: Beginning Inventory + Purchases/Production − Ending Inventory. */
export function calculateGoodsCOGSFromInventory(inv: GoodsInventorySnapshot): number {
  return roundCurrency(
    (inv.beginningInventoryValue || 0) +
      (inv.purchasesOrProductionCostThisPeriod || 0) -
      (inv.endingInventoryValue || 0)
  );
}

// ---------------------------------------------------------------------------
// SERVICES — revenue by model, capacity, direct cost, gross profit
// ---------------------------------------------------------------------------

export interface ServiceCapacityResult {
  billableCapacityHoursPerMonth: number;
  maxCapacityRevenuePerMonth: number;
  isOverCapacity: boolean;
  billableHoursDemanded: number;
}

/**
 * Available Billable Capacity = Staff x Available Hours x Utilisation %.
 * Also flags when the offerings' combined billable-hour demand would exceed
 * available capacity, per the capacity-constraint validation requirement.
 */
export function calculateServiceCapacity(
  capacity: ServiceCapacityPlan | undefined,
  offerings: ServiceOffering[]
): ServiceCapacityResult {
  const staff = capacity?.staffCount || 0;
  const hoursPerWeek = capacity?.availableHoursPerStaffPerWeek || 0;
  const utilisation = pct(capacity?.utilisationPercent ?? 70);
  const monthlyAvailableHours = hoursPerWeek * 4.33; // avg weeks/month

  const billableCapacityHoursPerMonth = roundCurrency(staff * monthlyAvailableHours * utilisation);

  const billableHoursDemanded = sumCurrency(
    offerings
      .filter((o) => o.revenueModels.includes('hourly'))
      .map((o) => o.expectedBillableHoursPerMonth || 0)
  );

  const avgHourlyRate =
    offerings.find((o) => o.revenueModels.includes('hourly'))?.hourlyRate || 0;
  const maxCapacityRevenuePerMonth = roundCurrency(billableCapacityHoursPerMonth * avgHourlyRate);

  return {
    billableCapacityHoursPerMonth,
    maxCapacityRevenuePerMonth,
    isOverCapacity: billableHoursDemanded > billableCapacityHoursPerMonth && billableCapacityHoursPerMonth > 0,
    billableHoursDemanded
  };
}

export interface ServiceOfferingRevenueLine {
  offeringId: string;
  name: string;
  monthlyRevenue: number;
  byModel: Partial<Record<ServiceOffering['revenueModels'][number], number>>;
}

/** Computes monthly revenue for one offering, summed across every revenue model it uses. */
export function calculateServiceOfferingRevenue(offering: ServiceOffering): ServiceOfferingRevenueLine {
  const byModel: ServiceOfferingRevenueLine['byModel'] = {};

  if (offering.revenueModels.includes('hourly')) {
    byModel.hourly = roundCurrency((offering.hourlyRate || 0) * (offering.expectedBillableHoursPerMonth || 0));
  }
  if (offering.revenueModels.includes('fixed_project')) {
    byModel.fixed_project = roundCurrency((offering.averageProjectFee || 0) * (offering.expectedProjectsPerMonth || 0));
  }
  if (offering.revenueModels.includes('package')) {
    byModel.package = roundCurrency((offering.packagePrice || 0) * (offering.expectedPackagesPerMonth || 0));
  }
  if (offering.revenueModels.includes('retainer')) {
    byModel.retainer = roundCurrency((offering.monthlyRetainerFee || 0) * (offering.expectedRetainerClients || 0));
  }
  if (offering.revenueModels.includes('subscription')) {
    byModel.subscription = roundCurrency((offering.subscriptionPrice || 0) * (offering.expectedSubscribers || 0));
  }
  if (offering.revenueModels.includes('per_transaction')) {
    byModel.per_transaction = roundCurrency(
      (offering.averageRevenuePerTransaction || 0) * (offering.expectedTransactionsPerMonth || 0)
    );
  }

  const monthlyRevenue = sumCurrency(Object.values(byModel));
  return { offeringId: offering.id, name: offering.name, monthlyRevenue, byModel };
}

export function calculateDirectServiceCost(costs: ServiceDirectCosts | undefined, revenue: number): number {
  if (!costs) return 0;
  const paymentProcessingCost = roundCurrency(revenue * pct(costs.paymentProcessingPercent));
  return sumCurrency([
    costs.directEmployeeLabour,
    costs.contractorSubcontractorCosts,
    costs.travel,
    costs.projectSpecificMaterials,
    costs.serviceDeliverySoftware,
    paymentProcessingCost,
    costs.otherDirectCosts
  ]);
}

export interface ServicesMonthlyResult {
  offerings: ServiceOfferingRevenueLine[];
  monthlyRevenue: number;
  monthlyDirectCost: number;
  monthlyGrossProfit: number;
  grossMarginPercent: number;
  capacity: ServiceCapacityResult;
}

export function calculateServicesMonthlyResult(
  offerings: ServiceOffering[],
  directCosts: ServiceDirectCosts | undefined,
  capacityPlan: ServiceCapacityPlan | undefined
): ServicesMonthlyResult {
  const revenueLines = offerings.map(calculateServiceOfferingRevenue);
  const monthlyRevenue = sumCurrency(revenueLines.map((l) => l.monthlyRevenue));
  const monthlyDirectCost = calculateDirectServiceCost(directCosts, monthlyRevenue);
  const monthlyGrossProfit = roundCurrency(monthlyRevenue - monthlyDirectCost);
  const grossMarginPercent = monthlyRevenue > 0 ? roundCurrency((monthlyGrossProfit / monthlyRevenue) * 100) : 0;
  const capacity = calculateServiceCapacity(capacityPlan, offerings);

  return { offerings: revenueLines, monthlyRevenue, monthlyDirectCost, monthlyGrossProfit, grossMarginPercent, capacity };
}

// ---------------------------------------------------------------------------
// HYBRID — combine Goods + Services without conflating the two engines
// ---------------------------------------------------------------------------

export interface HybridMonthlyResult {
  goods: GoodsMonthlyResult;
  services: ServicesMonthlyResult;
  combinedRevenue: number;
  combinedCostOfSales: number; // COGS + Direct Service Cost, kept distinct in the breakdown above
  combinedGrossProfit: number;
  combinedGrossMarginPercent: number;
}

export function calculateHybridMonthlyResult(
  products: GoodsProduct[],
  offerings: ServiceOffering[],
  directCosts: ServiceDirectCosts | undefined,
  capacityPlan: ServiceCapacityPlan | undefined
): HybridMonthlyResult {
  const goods = calculateGoodsMonthlyResult(products);
  const services = calculateServicesMonthlyResult(offerings, directCosts, capacityPlan);

  const combinedRevenue = sumCurrency([goods.monthlyRevenue, services.monthlyRevenue]);
  const combinedCostOfSales = sumCurrency([goods.monthlyCOGS, services.monthlyDirectCost]);
  const combinedGrossProfit = roundCurrency(combinedRevenue - combinedCostOfSales);
  const combinedGrossMarginPercent = combinedRevenue > 0 ? roundCurrency((combinedGrossProfit / combinedRevenue) * 100) : 0;

  return { goods, services, combinedRevenue, combinedCostOfSales, combinedGrossProfit, combinedGrossMarginPercent };
}

// ---------------------------------------------------------------------------
// EXPENSE CLASSIFICATION — one-time / recurring / periodic
// ---------------------------------------------------------------------------

export function sumExpensesByClassification(expenses: ClassifiedExpenseItem[]): {
  oneTime: number;
  recurringMonthly: number;
  periodic: number;
} {
  const oneTime = sumCurrency(expenses.filter((e) => e.classification === 'one_time').map((e) => e.amount));
  const recurringMonthly = sumCurrency(expenses.filter((e) => e.classification === 'recurring').map((e) => e.amount));
  const periodic = sumCurrency(expenses.filter((e) => e.classification === 'periodic').map((e) => e.amount));
  return { oneTime, recurringMonthly, periodic };
}

// ---------------------------------------------------------------------------
// BREAK-EVEN — model-appropriate driver, never "units" for a service company
// ---------------------------------------------------------------------------

export interface BreakEvenResult {
  driverLabel: string;
  driverValuePerMonth: number;
  isAchievable: boolean;
  note?: string;
}

/**
 * Multi-product break-even using weighted contribution margin (sales-mix
 * aware): Break-even Total Units = Fixed Costs / Weighted Avg Contribution
 * Margin per Unit, then apportioned across products by their unit mix.
 */
export function calculateGoodsBreakEven(products: GoodsProduct[], monthlyFixedCosts: number): BreakEvenResult {
  const lines = calculateGoodsMonthlyResult(products);
  const totalUnits = lines.products.reduce((s, p) => s + p.monthlyUnits, 0);
  if (totalUnits <= 0) {
    return { driverLabel: 'Units per month', driverValuePerMonth: 0, isAchievable: false, note: 'No sales volume assumptions entered yet.' };
  }

  const weightedContributionPerUnit =
    lines.products.reduce((s, p) => s + p.grossProfitPerUnit * p.monthlyUnits, 0) / totalUnits;

  if (weightedContributionPerUnit <= 0) {
    return {
      driverLabel: 'Units per month',
      driverValuePerMonth: 0,
      isAchievable: false,
      note: 'Weighted contribution margin is zero or negative — break-even is not reachable at current pricing/cost assumptions.'
    };
  }

  const breakEvenUnits = Math.ceil(monthlyFixedCosts / weightedContributionPerUnit);
  return { driverLabel: 'Units per month', driverValuePerMonth: breakEvenUnits, isAchievable: true };
}

/**
 * Service break-even uses whichever driver the offering's dominant revenue
 * model implies — billable hours, projects, retainer clients, subscribers,
 * or transactions — never a generic "units" figure.
 */
export function calculateServicesBreakEven(
  offering: ServiceOffering,
  directCosts: ServiceDirectCosts | undefined,
  monthlyFixedCosts: number
): BreakEvenResult {
  const model = offering.revenueModels[0];
  const revenueLine = calculateServiceOfferingRevenue(offering);
  const directCost = calculateDirectServiceCost(directCosts, revenueLine.monthlyRevenue);
  const contributionMarginRatio =
    revenueLine.monthlyRevenue > 0 ? (revenueLine.monthlyRevenue - directCost) / revenueLine.monthlyRevenue : 0;

  if (contributionMarginRatio <= 0) {
    return { driverLabel: 'N/A', driverValuePerMonth: 0, isAchievable: false, note: 'Direct costs consume all revenue at current assumptions — contribution margin is zero or negative.' };
  }

  switch (model) {
    case 'hourly': {
      const contributionPerHour = (offering.hourlyRate || 0) * contributionMarginRatio;
      const hours = contributionPerHour > 0 ? Math.ceil(monthlyFixedCosts / contributionPerHour) : 0;
      return { driverLabel: 'Billable hours per month', driverValuePerMonth: hours, isAchievable: contributionPerHour > 0 };
    }
    case 'fixed_project': {
      const contributionPerProject = (offering.averageProjectFee || 0) * contributionMarginRatio;
      const projects = contributionPerProject > 0 ? Math.ceil(monthlyFixedCosts / contributionPerProject) : 0;
      return { driverLabel: 'Projects per month', driverValuePerMonth: projects, isAchievable: contributionPerProject > 0 };
    }
    case 'package': {
      const contributionPerPackage = (offering.packagePrice || 0) * contributionMarginRatio;
      const packages = contributionPerPackage > 0 ? Math.ceil(monthlyFixedCosts / contributionPerPackage) : 0;
      return { driverLabel: 'Packages sold per month', driverValuePerMonth: packages, isAchievable: contributionPerPackage > 0 };
    }
    case 'retainer': {
      const contributionPerClient = (offering.monthlyRetainerFee || 0) * contributionMarginRatio;
      const clients = contributionPerClient > 0 ? Math.ceil(monthlyFixedCosts / contributionPerClient) : 0;
      return { driverLabel: 'Retainer clients required', driverValuePerMonth: clients, isAchievable: contributionPerClient > 0 };
    }
    case 'subscription': {
      const contributionPerSub = (offering.subscriptionPrice || 0) * contributionMarginRatio;
      const subs = contributionPerSub > 0 ? Math.ceil(monthlyFixedCosts / contributionPerSub) : 0;
      return { driverLabel: 'Active subscribers required', driverValuePerMonth: subs, isAchievable: contributionPerSub > 0 };
    }
    case 'per_transaction': {
      const contributionPerTxn = (offering.averageRevenuePerTransaction || 0) * contributionMarginRatio;
      const txns = contributionPerTxn > 0 ? Math.ceil(monthlyFixedCosts / contributionPerTxn) : 0;
      return { driverLabel: 'Transactions per month', driverValuePerMonth: txns, isAchievable: contributionPerTxn > 0 };
    }
    default:
      return { driverLabel: 'N/A', driverValuePerMonth: 0, isAchievable: false, note: 'Select a revenue model to calculate break-even.' };
  }
}

// ---------------------------------------------------------------------------
// STARTUP CAPITAL — one-time costs + a working-capital estimate
// ---------------------------------------------------------------------------

export interface StartupCapitalResult {
  oneTimeStartupCosts: number;
  initialInventoryValue: number;
  /**
   * First-order working-capital estimate: one month of combined cost of
   * sales + operating expenses, held as a cash buffer. This is a
   * deliberately conservative placeholder for the full cumulative-cash-
   * deficit simulation described in the spec (which requires a real
   * month-by-month cash flow model — see the Phase 2 roadmap) rather than
   * an arbitrary flat percentage.
   */
  workingCapitalReserve: number;
  totalStartupCapitalRequired: number;
}

export function calculateStartupCapital(
  expenses: ClassifiedExpenseItem[],
  initialInventoryValue: number,
  monthlyCostOfSalesPlusOpEx: number
): StartupCapitalResult {
  const { oneTime } = sumExpensesByClassification(expenses);
  const workingCapitalReserve = roundCurrency(monthlyCostOfSalesPlusOpEx);
  const totalStartupCapitalRequired = sumCurrency([oneTime, initialInventoryValue, workingCapitalReserve]);

  return {
    oneTimeStartupCosts: oneTime,
    initialInventoryValue: roundCurrency(initialInventoryValue),
    workingCapitalReserve,
    totalStartupCapitalRequired
  };
}

// ---------------------------------------------------------------------------
// Migration helper for existing projects
// ---------------------------------------------------------------------------

/** True when a project's startup details have not yet been classified. */
export function needsBusinessModelClassification(businessModelType?: StartupBusinessModelType): boolean {
  return !businessModelType;
}
