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
  ServiceRevenueModel,
  ImportDutyCategory,
  ImportDutyCalculation,
  CurrencyCode,
  LoanParameters,
  AmortizationScheduleRow,
  LoanAmortizationSummary,
  PaymentFrequency
} from '../types';
import {
  DEFAULT_USD_TO_XCD_RATE,
  convertCurrency,
  normalizeCostItemToCurrency,
  normalizeGoodsProductToCurrency,
  normalizeServiceOfferingToCurrency
} from './currencyService';

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

export interface DutyPresetRates {
  label: string;
  shortLabel: string;
  description: string;
  dutyRatePercent: number;
  cscRatePercent: number;
  hcslRatePercent: number;
  envRatePercent: number;
  vatRatePercent: number;
  effectiveRatePercent: number;
}

export const SAINT_LUCIA_DUTY_PRESETS: Record<ImportDutyCategory, DutyPresetRates> = {
  electronics: {
    label: 'Electronics, AV, Simulators & Gaming Units',
    shortLabel: 'Electronics (20% Duty + Levies + VAT)',
    description: 'Commercial gaming units, simulators, displays, audio systems, entertainment hardware (20% Duty + 6% CSC + 2.5% HCSL + 1.5% ENV + 12.5% VAT = ~46.25% effective)',
    dutyRatePercent: 20,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 46.25
  },
  computers_it: {
    label: 'Computers, Laptops & IT Hardware (0% Duty Exemption)',
    shortLabel: 'Computers / IT (0% Duty + Levies + VAT)',
    description: 'Laptops, tablets, desktop workstations, networking & server equipment (0% CARICOM duty exemption + 6% CSC + 2.5% HCSL + 1.5% ENV + 12.5% VAT = ~23.75% effective)',
    dutyRatePercent: 0,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 23.75
  },
  machinery_tools: {
    label: 'Commercial Machinery, Tools & Solar Equipment',
    shortLabel: 'Machinery & Tools (5% Duty + Levies + VAT)',
    description: 'Commercial manufacturing plant, power tools, solar panels & energy systems (5% capital equipment duty + 6% CSC + 2.5% HCSL + 1.5% ENV + 12.5% VAT = ~29.38% effective)',
    dutyRatePercent: 5,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 29.38
  },
  furniture_fixtures: {
    label: 'Commercial Furniture, Fixtures & Fittings',
    shortLabel: 'Furniture & Fixtures (20% Duty + Levies + VAT)',
    description: 'Commercial desks, salon/gaming chairs, booths, display shelves, lighting (20% Duty + 6% CSC + 2.5% HCSL + 1.5% ENV + 12.5% VAT = ~46.25% effective)',
    dutyRatePercent: 20,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 46.25
  },
  apparel_textiles: {
    label: 'Apparel, Uniforms & Commercial Textiles',
    shortLabel: 'Uniforms & Textiles (20% Duty + Levies + VAT)',
    description: 'Branded staff uniforms, commercial linen, protective clothing (20% Duty + 6% CSC + 2.5% HCSL + 0% ENV + 12.5% VAT = ~44.56% effective)',
    dutyRatePercent: 20,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 0,
    vatRatePercent: 12.5,
    effectiveRatePercent: 44.56
  },
  vehicles_heavy: {
    label: 'Commercial Vehicles, Vans & Heavy Equipment',
    shortLabel: 'Vehicles & Heavy Gear (30% Duty + Levies + VAT)',
    description: 'Transport vans, utility trailers, heavy service equipment (30% Duty + 6% CSC + 2.5% HCSL + 1.5% ENV + 12.5% VAT = ~57.50% effective)',
    dutyRatePercent: 30,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 57.50
  },
  raw_materials_food: {
    label: 'Raw Materials & Commercial Packaging',
    shortLabel: 'Raw Materials (10% Duty + Levies + VAT)',
    description: 'Bulk raw ingredients, food-grade packaging supplies, consumable stock (10% Duty + 6% CSC + 2.5% HCSL + 1.5% ENV + 12.5% VAT = ~35.00% effective)',
    dutyRatePercent: 10,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 35.00
  },
  general_commercial: {
    label: 'General Commercial Imported Goods',
    shortLabel: 'General Goods (20% Duty + Levies + VAT)',
    description: 'Standard commercial imports (20% Duty + 6% CSC + 2.5% HCSL + 1.5% ENV + 12.5% VAT = ~46.25% effective)',
    dutyRatePercent: 20,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 46.25
  },
  custom: {
    label: 'Custom User-Defined Tariff Rates',
    shortLabel: 'Custom Tariff Rates',
    description: 'Manually adjust Duty, Customs Service Charge, Health & Security Levy, Environmental Levy, and VAT percentages',
    dutyRatePercent: 20,
    cscRatePercent: 6,
    hcslRatePercent: 2.5,
    envRatePercent: 1.5,
    vatRatePercent: 12.5,
    effectiveRatePercent: 46.25
  }
};

/**
 * Calculate complete Saint Lucia / International landed import costs, duties, taxes and port fees
 */
export function calculateLandedImportCost(params: {
  fobCost: number;
  shippingFreight?: number;
  insuranceCost?: number;
  category?: ImportDutyCategory;
  country?: 'saint_lucia' | 'caricom' | 'custom';
  invoiceCurrency?: CurrencyCode; // Supplier invoice currency ('USD' or 'XCD', default 'USD')
  exchangeRate?: number; // Saint Lucia customs conversion rate (default 2.70 XCD/USD)
  customDutyRate?: number;
  customCscRate?: number;
  customHcslRate?: number;
  customEnvRate?: number;
  customVatRate?: number;
  portAndBrokerageFee?: number; // Port handling & brokerage entry fee (in EC$)
  unitsCount?: number;
}): ImportDutyCalculation {
  const category = params.category || 'electronics';
  const preset = SAINT_LUCIA_DUTY_PRESETS[category] || SAINT_LUCIA_DUTY_PRESETS.electronics;
  const invoiceCurrency = params.invoiceCurrency || 'USD';
  const rate = params.exchangeRate && params.exchangeRate > 0 ? params.exchangeRate : 2.70;
  const units = Math.max(1, params.unitsCount || 1);

  const rawFob = Math.max(0, params.fobCost || 0);
  const rawFreight = Math.max(0, params.shippingFreight || 0);
  const rawInsurance = params.insuranceCost !== undefined && params.insuranceCost > 0
    ? params.insuranceCost
    : (rawFob > 0 ? roundCurrency(rawFob * 0.01) : 0);

  // If supplier quotes in USD, convert to Saint Lucia statutory customs CIF in EC$
  let fobCostUSD: number;
  let shippingFreightUSD: number;
  let insuranceCostUSD: number;
  let cifValueUSD: number;

  let fobCostXCD: number;
  let shippingFreightXCD: number;
  let insuranceCostXCD: number;
  let cifValueXCD: number;

  if (invoiceCurrency === 'USD') {
    fobCostUSD = rawFob;
    shippingFreightUSD = rawFreight;
    insuranceCostUSD = rawInsurance;
    cifValueUSD = roundCurrency(fobCostUSD + shippingFreightUSD + insuranceCostUSD);

    fobCostXCD = roundCurrency(fobCostUSD * rate);
    shippingFreightXCD = roundCurrency(shippingFreightUSD * rate);
    insuranceCostXCD = roundCurrency(insuranceCostUSD * rate);
    cifValueXCD = roundCurrency(cifValueUSD * rate);
  } else {
    fobCostXCD = rawFob;
    shippingFreightXCD = rawFreight;
    insuranceCostXCD = rawInsurance;
    cifValueXCD = roundCurrency(fobCostXCD + shippingFreightXCD + insuranceCostXCD);

    fobCostUSD = roundCurrency(fobCostXCD / rate);
    shippingFreightUSD = roundCurrency(shippingFreightXCD / rate);
    insuranceCostUSD = roundCurrency(insuranceCostXCD / rate);
    cifValueUSD = roundCurrency(cifValueXCD / rate);
  }

  // Statutory ASYCUDA Customs Duties assessed on CIF Value in EC$
  const cifValue = cifValueXCD;

  const dutyRatePercent = params.customDutyRate !== undefined ? params.customDutyRate : preset.dutyRatePercent;
  const cscRatePercent = params.customCscRate !== undefined ? params.customCscRate : preset.cscRatePercent;
  const hcslRatePercent = params.customHcslRate !== undefined ? params.customHcslRate : preset.hcslRatePercent;
  const envRatePercent = params.customEnvRate !== undefined ? params.customEnvRate : preset.envRatePercent;
  const vatRatePercent = params.customVatRate !== undefined ? params.customVatRate : preset.vatRatePercent;

  const dutyAmount = roundCurrency(cifValue * (dutyRatePercent / 100));
  const cscAmount = roundCurrency(cifValue * (cscRatePercent / 100));
  const hcslAmount = roundCurrency(cifValue * (hcslRatePercent / 100));
  const envAmount = roundCurrency(cifValue * (envRatePercent / 100));

  const landedBeforeVat = roundCurrency(cifValue + dutyAmount + cscAmount + hcslAmount + envAmount);
  const vatAmount = roundCurrency(landedBeforeVat * (vatRatePercent / 100));
  const totalDutiesAndTaxes = roundCurrency(dutyAmount + cscAmount + hcslAmount + envAmount + vatAmount);

  // Local Saint Lucia port clearance & brokerage in EC$
  const portAndBrokerageFee = Math.max(0, params.portAndBrokerageFee || 0);

  // Total Landed Capital Cost in EC$ (XCD)
  const totalLandedCost = roundCurrency(cifValue + totalDutiesAndTaxes + portAndBrokerageFee);
  const costPerUnitLanded = roundCurrency(totalLandedCost / units);

  // Cross-currency USD representations
  const totalLandedCostUSD = roundCurrency(totalLandedCost / rate);
  const costPerUnitLandedUSD = roundCurrency(totalLandedCostUSD / units);

  return {
    isImported: true,
    country: params.country || 'saint_lucia',
    category,
    currency: 'XCD', // Output is officially presented in EC$
    invoiceCurrency,
    exchangeRate: rate,
    fobCost: fobCostXCD,
    shippingFreight: shippingFreightXCD,
    insuranceCost: insuranceCostXCD,
    cifValue: cifValueXCD,
    fobCostUSD,
    cifValueUSD,
    dutyRatePercent,
    dutyAmount,
    cscRatePercent,
    cscAmount,
    hcslRatePercent,
    hcslAmount,
    envRatePercent,
    envAmount,
    landedBeforeVat,
    vatRatePercent,
    vatAmount,
    totalDutiesAndTaxes,
    portAndBrokerageFee,
    totalLandedCost,
    costPerUnitLanded,
    totalLandedCostXCD: totalLandedCost,
    costPerUnitLandedXCD: costPerUnitLanded,
    totalLandedCostUSD,
    costPerUnitLandedUSD
  };
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

export interface ServiceCapacityCalculationResult {
  staff: {
    enabled: boolean;
    resourceCount: number;
    availableHoursPerStaff: number;
    targetUtilisationPercent: number;
    hourlyRate: number;
    totalHours: number;
    effectiveHours: number;
    monthlyRevenue: number;
  };
  equipment: {
    enabled: boolean;
    resourceCount: number;
    availableDaysPerUnit: number;
    targetUtilisationPercent: number;
    dailyRate: number;
    totalDays: number;
    effectiveDays: number;
    monthlyRevenue: number;
  };
  totalMonthlyRevenuePotential: number;
  // Legacy fields for backward compatibility
  totalCapacityUnits: number;
  effectiveCapacityUnits: number;
  monthlyRevenuePotential: number;
}

/**
 * Generalised service capacity calculator for independent staff and equipment resources (Decision 2)
 */
export function calculateServiceCapacity(plan?: ServiceCapacityPlan): ServiceCapacityCalculationResult {
  const defaultStaff = {
    enabled: plan?.staff?.enabled ?? (plan?.resourceType === 'staff' || !plan?.resourceType || plan?.resourceType === 'both'),
    resourceCount: plan?.staff?.resourceCount ?? (plan?.resourceType === 'staff' ? (plan.resourceCount || 2) : 2),
    availableHoursPerStaff: plan?.staff?.availableHoursPerStaff ?? (plan?.resourceType === 'staff' ? (plan.availableTimePerResource || 160) : 160),
    targetUtilisationPercent: plan?.staff?.targetUtilisationPercent ?? (plan?.resourceType === 'staff' ? (plan.targetUtilisationPercent ?? 75) : 75),
    hourlyRate: plan?.staff?.hourlyRate ?? (plan?.resourceType === 'staff' ? (plan.hourlyOrDailyRate || 75) : 75)
  };

  const defaultEquipment = {
    enabled: plan?.equipment?.enabled ?? (plan?.resourceType === 'equipment' || plan?.resourceType === 'both'),
    resourceCount: plan?.equipment?.resourceCount ?? (plan?.resourceType === 'equipment' ? (plan.resourceCount || 12) : 12),
    availableDaysPerUnit: plan?.equipment?.availableDaysPerUnit ?? (plan?.resourceType === 'equipment' ? (plan.availableTimePerResource || 25) : 25),
    targetUtilisationPercent: plan?.equipment?.targetUtilisationPercent ?? (plan?.resourceType === 'equipment' ? (plan.targetUtilisationPercent ?? 50) : 50),
    dailyRate: plan?.equipment?.dailyRate ?? (plan?.resourceType === 'equipment' ? (plan.hourlyOrDailyRate || 500) : 500)
  };

  // Calculate Staff Capacity
  const staffTotalHours = defaultStaff.resourceCount * defaultStaff.availableHoursPerStaff;
  const staffEffectiveHours = roundCurrency(staffTotalHours * (defaultStaff.targetUtilisationPercent / 100));
  const staffMonthlyRevenue = defaultStaff.enabled ? roundCurrency(staffEffectiveHours * defaultStaff.hourlyRate) : 0;

  // Calculate Equipment Capacity
  const equipTotalDays = defaultEquipment.resourceCount * defaultEquipment.availableDaysPerUnit;
  const equipEffectiveDays = roundCurrency(equipTotalDays * (defaultEquipment.targetUtilisationPercent / 100));
  const equipMonthlyRevenue = defaultEquipment.enabled ? roundCurrency(equipEffectiveDays * defaultEquipment.dailyRate) : 0;

  const totalMonthlyRevenue = roundCurrency(staffMonthlyRevenue + equipMonthlyRevenue);

  return {
    staff: {
      ...defaultStaff,
      totalHours: staffTotalHours,
      effectiveHours: staffEffectiveHours,
      monthlyRevenue: staffMonthlyRevenue
    },
    equipment: {
      ...defaultEquipment,
      totalDays: equipTotalDays,
      effectiveDays: equipEffectiveDays,
      monthlyRevenue: equipMonthlyRevenue
    },
    totalMonthlyRevenuePotential: totalMonthlyRevenue,
    // Legacy mapping
    totalCapacityUnits: (defaultStaff.enabled ? staffTotalHours : 0) + (defaultEquipment.enabled ? equipTotalDays : 0),
    effectiveCapacityUnits: (defaultStaff.enabled ? staffEffectiveHours : 0) + (defaultEquipment.enabled ? equipEffectiveDays : 0),
    monthlyRevenuePotential: totalMonthlyRevenue
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
 * Calculates a complete 5-year/N-year Loan Amortization Schedule and Bank Debt Metrics
 */
export function calculateLoanAmortizationSchedule(
  params?: LoanParameters | null,
  targetCurrency: CurrencyCode = 'USD',
  exchangeRate: number = DEFAULT_USD_TO_XCD_RATE,
  year1Ebitda: number = 0
): LoanAmortizationSummary | null {
  if (!params || !params.enabled || !params.loanAmount || params.loanAmount <= 0) {
    return null;
  }

  const rawAmount = params.loanAmount || 0;
  const rawNegFee = params.negotiationFee || 0;
  const rawInsFee = params.insuranceFee || 0;

  const loanAmount = roundCurrency(rawAmount);
  const negotiationFee = roundCurrency(rawNegFee);
  const insuranceFee = roundCurrency(rawInsFee);
  const totalFees = roundCurrency(negotiationFee + insuranceFee);

  const includeFeesInLoan = params.includeFeesInLoan ?? false;
  const effectiveLoanAmount = includeFeesInLoan ? roundCurrency(loanAmount + totalFees) : loanAmount;

  const annualInterestRate = params.annualInterestRate ?? 7.0; // e.g. 7%
  const termYears = Math.max(1, params.termYears ?? 5);
  const paymentFrequency: PaymentFrequency = params.paymentFrequency || 'monthly';

  let paymentsPerYear = 12;
  if (paymentFrequency === 'fortnightly') paymentsPerYear = 26;
  if (paymentFrequency === 'weekly') paymentsPerYear = 52;

  const totalPeriods = termYears * paymentsPerYear;
  const periodInterestRate = (annualInterestRate / 100) / paymentsPerYear;

  const graceMonths = params.gracePeriodMonths || 0;
  const gracePeriods = Math.round(graceMonths * (paymentsPerYear / 12));
  const activeRepaymentPeriods = Math.max(1, totalPeriods - gracePeriods);

  // Periodic payment calculation (PMT formula)
  let periodicPayment = 0;
  if (periodInterestRate > 0) {
    const factor = Math.pow(1 + periodInterestRate, activeRepaymentPeriods);
    periodicPayment = roundCurrency(effectiveLoanAmount * (periodInterestRate * factor) / (factor - 1));
  } else {
    periodicPayment = roundCurrency(effectiveLoanAmount / activeRepaymentPeriods);
  }

  const schedule: AmortizationScheduleRow[] = [];
  let currentBalance = effectiveLoanAmount;
  let cumulativeInterest = 0;

  const startDateObj = params.startDate ? new Date(params.startDate) : new Date();

  for (let p = 1; p <= totalPeriods; p++) {
    const periodDate = new Date(startDateObj);
    if (paymentFrequency === 'monthly') {
      periodDate.setMonth(periodDate.getMonth() + (p - 1));
    } else if (paymentFrequency === 'fortnightly') {
      periodDate.setDate(periodDate.getDate() + (p - 1) * 14);
    } else {
      periodDate.setDate(periodDate.getDate() + (p - 1) * 7);
    }
    const dateStr = periodDate.toISOString().split('T')[0];

    const beginningBalance = currentBalance;
    const interestPaid = roundCurrency(beginningBalance * periodInterestRate);

    let paymentAmount = 0;
    let principalPaid = 0;

    if (p <= gracePeriods) {
      paymentAmount = interestPaid;
      principalPaid = 0;
    } else {
      paymentAmount = periodicPayment;
      principalPaid = roundCurrency(paymentAmount - interestPaid);

      if (principalPaid > beginningBalance || p === totalPeriods) {
        principalPaid = beginningBalance;
        paymentAmount = roundCurrency(principalPaid + interestPaid);
      }
    }

    const endingBalance = Math.max(0, roundCurrency(beginningBalance - principalPaid));
    cumulativeInterest = roundCurrency(cumulativeInterest + interestPaid);
    currentBalance = endingBalance;

    schedule.push({
      period: p,
      paymentDate: dateStr,
      beginningBalance,
      paymentAmount,
      interestPaid,
      principalPaid,
      endingBalance,
      cumulativeInterest
    });
  }

  const totalRepaymentAmount = roundCurrency(schedule.reduce((sum, row) => sum + row.paymentAmount, 0) + (includeFeesInLoan ? 0 : totalFees));
  const totalInterestPaid = roundCurrency(schedule.reduce((sum, row) => sum + row.interestPaid, 0));

  const year1Rows = schedule.slice(0, paymentsPerYear);
  const annualDebtService = roundCurrency(year1Rows.reduce((sum, row) => sum + row.paymentAmount, 0));
  const monthlyDebtService = roundCurrency(annualDebtService / 12);

  const dscrYear1 = annualDebtService > 0 ? roundCurrency(year1Ebitda / annualDebtService) : 99;
  let dscrStatus: 'strong' | 'adequate' | 'tight' | 'insufficient' = 'strong';
  if (dscrYear1 < 1.0) dscrStatus = 'insufficient';
  else if (dscrYear1 < 1.25) dscrStatus = 'tight';
  else if (dscrYear1 < 1.5) dscrStatus = 'adequate';

  return {
    loanAmount,
    totalFees,
    effectiveLoanAmount,
    periodicPayment,
    totalPayments: totalPeriods,
    totalRepaymentAmount,
    totalInterestPaid,
    monthlyDebtService,
    annualDebtService,
    dscrYear1,
    dscrStatus,
    schedule
  };
}

/**
 * 12-Month Year 1 Forecast Engine + 5-Year Projections (Decision 3)
 */
export function generateStartupFinancialForecast(
  sd?: StartupPlanDetails,
  targetCurrency?: CurrencyCode,
  targetExchangeRate?: number
): {
  currency: CurrencyCode;
  exchangeRate: number;
  monthlyYear1: MonthlyForecastMonth[];
  yearlyProjections: YearlyForecastSummary[];
  breakEven: BreakEvenResult;
  loanSummary?: LoanAmortizationSummary | null;
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
    totalInterestExpense?: number;
    totalPrincipalRepaid?: number;
    totalDebtService?: number;
  };
} {
  const activeCurrency: CurrencyCode = targetCurrency || sd?.displayCurrency || 'USD';
  const activeRate: number = targetExchangeRate || sd?.exchangeRate || DEFAULT_USD_TO_XCD_RATE;

  const modelType: BusinessModelType = sd?.businessModelType || 'goods';
  const goodsType = sd?.goodsType || 'make';
  
  // Extract and normalize all cost items into active display currency
  const rawCostItems = extractUnifiedCostItems(sd);
  const costItems = rawCostItems.map((item) =>
    normalizeCostItemToCurrency(item, activeCurrency, activeRate)
  );

  const startingCash = sd?.startingCash !== undefined
    ? convertCurrency(sd.startingCash, 'USD', activeCurrency, activeRate)
    : 0;

  // 1. Group cost items by classification
  const equipmentItems = costItems.filter((i) => i.classification === 'equipment');
  const stockItems = costItems.filter((i) => i.classification === 'stock');
  const directCostItems = costItems.filter((i) => i.classification === 'direct');
  const recurringOpExItems = costItems.filter((i) => i.classification === 'operating');
  const setupCostItems = costItems.filter((i) => i.classification === 'setup');

  // Baseline Goods Products (normalized)
  let goodsProducts: GoodsProduct[] = (sd?.goodsProducts || []).map((p) =>
    normalizeGoodsProductToCurrency(p, activeCurrency, activeRate)
  );
  if (goodsProducts.length === 0 && (modelType === 'goods' || modelType === 'both')) {
    const rawPrice = sd?.cogs ? sd.cogs * (1 + (sd.markup || 50) / 100) : 25;
    const defaultPrice = convertCurrency(rawPrice, 'USD', activeCurrency, activeRate);
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

  // Baseline Service Offerings (normalized)
  let serviceOfferings: ServiceOffering[] = (sd?.serviceOfferings || []).map((s) =>
    normalizeServiceOfferingToCurrency(s, activeCurrency, activeRate)
  );
  if (serviceOfferings.length === 0 && (modelType === 'services' || modelType === 'both')) {
    serviceOfferings = [
      {
        id: 'default-service-1',
        name: 'Core Service Offering',
        revenueModel: 'project',
        rate: convertCurrency(250, 'USD', activeCurrency, activeRate),
        expectedVolume: 20,
        monthlyGrowthRatePercent: 2,
        annualGrowthRatePercent: sd?.growthRateYear3 || 15,
        directCostPerUnitOrJob: convertCurrency(35, 'USD', activeCurrency, activeRate)
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

  // Calculate Loan Amortization Summary if enabled
  const loanSummary = calculateLoanAmortizationSchedule(sd?.loanParameters, activeCurrency, activeRate);

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
      const customTotal = (sd.customExpenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
      monthlyRecurringOpEx = sumCurrency(sd.rent, sd.salaries, sd.utilities, sd.marketing, sd.otherExpenses, customTotal);
    }

    // One-Time Setup Expenses in this month
    const thisMonthSetupExpenses = setupCostItems
      .filter((item) => (item.setupMonth ?? 1) === m)
      .reduce((sum, item) => sum + (item.setupExpenseAmount ?? item.amount ?? 0), 0);

    const totalOpEx = sumCurrency(monthlyRecurringOpEx, thisMonthSetupExpenses);

    // 4. Depreciation & Loan Interest
    const activeDepreciation = equipmentDeprecations
      .filter((eq) => eq.purchaseMonth <= m)
      .reduce((sum, eq) => sum + eq.monthlyDepreciation, 0);

    let mInterest = 0;
    let mPrincipal = 0;
    if (loanSummary && loanSummary.schedule.length > 0) {
      const pPerYear = loanSummary.schedule.length / (sd?.loanParameters?.termYears || 5);
      const pPerMonth = pPerYear / 12;
      const startP = Math.floor((m - 1) * pPerMonth);
      const endP = Math.floor(m * pPerMonth);
      const mRows = loanSummary.schedule.slice(startP, endP);
      mInterest = roundCurrency(mRows.reduce((sum, r) => sum + r.interestPaid, 0));
      mPrincipal = roundCurrency(mRows.reduce((sum, r) => sum + r.principalPaid, 0));
    }

    const netProfit = roundCurrency(grossProfit - totalOpEx - activeDepreciation - mInterest);
    const netMarginPercent = totalRevenue > 0 ? roundCurrency((netProfit / totalRevenue) * 100) : 0;

    // 5. Cash Flow Calculations
    const cashEquipmentPurchases = equipmentDeprecations
      .filter((eq) => eq.purchaseMonth === m)
      .reduce((sum, eq) => sum + eq.purchaseCost, 0);

    let loanUpfrontFeeCash = 0;
    if (m === 1 && loanSummary && !sd?.loanParameters?.includeFeesInLoan) {
      loanUpfrontFeeCash = loanSummary.totalFees;
    }

    const cashInflow = totalRevenue + (m === 1 && loanSummary ? loanSummary.effectiveLoanAmount : 0);
    const cashOutflow = sumCurrency(
      cashEquipmentPurchases,
      stockPurchasesCash,
      directCostsTotal,
      monthlyRecurringOpEx,
      thisMonthSetupExpenses,
      mInterest,
      mPrincipal,
      loanUpfrontFeeCash
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
      billableHoursOrJobs: serviceUnits,
      loanInterestExpense: mInterest,
      loanPrincipalRepayment: mPrincipal,
      totalDebtService: roundCurrency(mInterest + mPrincipal)
    });
  }

  // Calculate Year 1 Totals
  const totalRevenueY1 = monthlyYear1.reduce((sum, m) => sum + m.revenue, 0);
  const totalCogsY1 = monthlyYear1.reduce((sum, m) => sum + m.cogs, 0);
  const totalGrossY1 = roundCurrency(totalRevenueY1 - totalCogsY1);
  const totalOpExY1 = monthlyYear1.reduce((sum, m) => sum + m.operatingExpenses, 0);
  const totalDeprecY1 = monthlyYear1.reduce((sum, m) => sum + m.depreciation, 0);
  const totalInterestY1 = monthlyYear1.reduce((sum, m) => sum + (m.loanInterestExpense || 0), 0);
  const totalPrincipalY1 = monthlyYear1.reduce((sum, m) => sum + (m.loanPrincipalRepayment || 0), 0);
  const totalDebtServiceY1 = roundCurrency(totalInterestY1 + totalPrincipalY1);
  const totalNetY1 = roundCurrency(totalGrossY1 - totalOpExY1 - totalDeprecY1 - totalInterestY1);
  const totalCashInflowY1 = monthlyYear1.reduce((sum, m) => sum + m.cashInflow, 0);
  const totalCashOutflowY1 = monthlyYear1.reduce((sum, m) => sum + m.cashOutflow, 0);
  const totalNetCashY1 = roundCurrency(totalCashInflowY1 - totalCashOutflowY1);
  const equipmentCapitalOutlay = equipmentDeprecations.reduce((sum, eq) => sum + eq.purchaseCost, 0);

  // Recalculate DSCR with Year 1 Net Operating Income (EBITDA = Gross Profit - OpEx)
  const year1Ebitda = roundCurrency(totalGrossY1 - totalOpExY1);
  if (loanSummary && totalDebtServiceY1 > 0) {
    loanSummary.dscrYear1 = roundCurrency(year1Ebitda / totalDebtServiceY1);
    if (loanSummary.dscrYear1 < 1.0) loanSummary.dscrStatus = 'insufficient';
    else if (loanSummary.dscrYear1 < 1.25) loanSummary.dscrStatus = 'tight';
    else if (loanSummary.dscrYear1 < 1.5) loanSummary.dscrStatus = 'adequate';
    else loanSummary.dscrStatus = 'strong';
  }

  // 6. Years 2-5 Projections
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
      endingCashBalance: monthlyYear1[11].endingCashBalance,
      loanInterestExpense: totalInterestY1,
      loanPrincipalRepayment: totalPrincipalY1,
      totalDebtService: totalDebtServiceY1
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

    let yearInterest = 0;
    let yearPrincipal = 0;
    if (loanSummary && loanSummary.schedule.length > 0) {
      const pPerYear = Math.round(loanSummary.schedule.length / (sd?.loanParameters?.termYears || 5));
      const startP = (year - 1) * pPerYear;
      const endP = Math.min(loanSummary.schedule.length, year * pPerYear);
      const yRows = loanSummary.schedule.slice(startP, endP);
      yearInterest = roundCurrency(yRows.reduce((sum, r) => sum + r.interestPaid, 0));
      yearPrincipal = roundCurrency(yRows.reduce((sum, r) => sum + r.principalPaid, 0));
    }

    const yearNetProfit = roundCurrency(yearGrossProfit - yearOpEx - yearDepreciation - yearInterest);
    const netMargin = yearRevenue > 0 ? roundCurrency((yearNetProfit / yearRevenue) * 100) : 0;

    // Cash flow in Year 2+: no new equipment cash outlay unless replacement; depreciation is non-cash
    const yearCashFlow = roundCurrency(yearRevenue - yearCogs - yearOpEx - yearInterest - yearPrincipal);
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
      endingCashBalance: previousCashBalance,
      loanInterestExpense: yearInterest,
      loanPrincipalRepayment: yearPrincipal,
      totalDebtService: roundCurrency(yearInterest + yearPrincipal)
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
    currency: activeCurrency,
    exchangeRate: activeRate,
    monthlyYear1,
    yearlyProjections,
    breakEven,
    loanSummary,
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
      equipmentCapitalOutlay,
      totalInterestExpense: totalInterestY1,
      totalPrincipalRepaid: totalPrincipalY1,
      totalDebtService: totalDebtServiceY1
    }
  };
}
