import { CurrencyCode, StartupCostItem, GoodsProduct, ServiceOffering, ImportDutyCalculation } from '../types';
import { roundCurrency } from './startupFinancialsService';

export type { CurrencyCode };

/**
 * Standard Official Pegged Exchange Rate
 * 1 USD = 2.70 XCD (Eastern Caribbean Dollar)
 * 1 XCD ≈ 0.37037 USD
 */
export const DEFAULT_USD_TO_XCD_RATE = 2.70;
export const DEFAULT_EXCHANGE_RATE = DEFAULT_USD_TO_XCD_RATE;
export const DEFAULT_BASE_CURRENCY: CurrencyCode = 'XCD';


/**
 * Convert an amount from one currency to another using the specified rate
 */
export function convertCurrency(
  amount: number | undefined | null,
  from: CurrencyCode = 'USD',
  to: CurrencyCode = 'USD',
  rate: number = DEFAULT_USD_TO_XCD_RATE
): number {
  if (amount === undefined || amount === null || isNaN(amount)) return 0;
  if (from === to) return amount;
  
  const validRate = rate > 0 ? rate : DEFAULT_USD_TO_XCD_RATE;

  if (from === 'USD' && to === 'XCD') {
    return roundCurrency(amount * validRate);
  }

  if (from === 'XCD' && to === 'USD') {
    return roundCurrency(amount / validRate);
  }

  return amount;
}

/**
 * Get the standard symbol or prefix for a currency
 */
export function getCurrencySymbol(currency: CurrencyCode = 'USD'): string {
  return currency === 'XCD' ? 'EC$' : 'US$';
}

/**
 * Get human-readable name of currency
 */
export function getCurrencyName(currency: CurrencyCode = 'USD'): string {
  return currency === 'XCD' ? 'Eastern Caribbean Dollar' : 'US Dollar';
}

/**
 * Format an amount with its currency symbol and proper number formatting
 */
export function formatCurrencyAmount(
  amount: number | undefined | null,
  currency: CurrencyCode = 'USD',
  options?: {
    decimals?: number;
    showCode?: boolean;
    compact?: boolean;
  }
): string {
  const val = amount ?? 0;
  const decimals = options?.decimals !== undefined ? options?.decimals : 2;
  const symbol = getCurrencySymbol(currency);

  const formattedNum = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(val);

  if (options?.showCode) {
    return `${symbol} ${formattedNum} ${currency}`;
  }

  return `${symbol} ${formattedNum}`;
}

/**
 * Format dual currency helper: displays the native price and its converted counter-part
 */
export function getDualCurrencyDisplay(
  amount: number | undefined | null,
  nativeCurrency: CurrencyCode = 'USD',
  displayCurrency: CurrencyCode = 'USD',
  rate: number = DEFAULT_USD_TO_XCD_RATE
): {
  primaryText: string;
  secondaryText: string | null;
  convertedAmount: number;
  isConverted: boolean;
} {
  const val = amount ?? 0;
  const isConverted = nativeCurrency !== displayCurrency;
  const convertedAmount = convertCurrency(val, nativeCurrency, displayCurrency, rate);

  const primaryText = formatCurrencyAmount(convertedAmount, displayCurrency);
  const secondaryText = isConverted
    ? `Orig: ${formatCurrencyAmount(val, nativeCurrency)}`
    : null;

  return {
    primaryText,
    secondaryText,
    convertedAmount,
    isConverted
  };
}

/**
 * Normalize an item's monetary values into the target display currency
 */
export function normalizeCostItemToCurrency(
  item: StartupCostItem,
  targetCurrency: CurrencyCode = 'USD',
  rate: number = DEFAULT_USD_TO_XCD_RATE
): StartupCostItem {
  const itemCurrency: CurrencyCode = item.currency || 'USD';
  if (itemCurrency === targetCurrency) {
    return { ...item };
  }

  const convert = (val: number | undefined) =>
    val !== undefined ? convertCurrency(val, itemCurrency, targetCurrency, rate) : undefined;

  // Convert imported details if present
  let normalizedImportDetails: ImportDutyCalculation | undefined = undefined;
  if (item.importDetails) {
    const impCur = item.importDetails.currency || itemCurrency;
    const convertImp = (val: number | undefined) =>
      val !== undefined ? convertCurrency(val, impCur, targetCurrency, rate) : undefined;

    normalizedImportDetails = {
      ...item.importDetails,
      currency: targetCurrency,
      fobCost: convertImp(item.importDetails.fobCost),
      shippingFreight: convertImp(item.importDetails.shippingFreight),
      insuranceCost: convertImp(item.importDetails.insuranceCost),
      cifValue: convertImp(item.importDetails.cifValue),
      dutyAmount: convertImp(item.importDetails.dutyAmount),
      cscAmount: convertImp(item.importDetails.cscAmount),
      hcslAmount: convertImp(item.importDetails.hcslAmount),
      envAmount: convertImp(item.importDetails.envAmount),
      landedBeforeVat: convertImp(item.importDetails.landedBeforeVat),
      vatAmount: convertImp(item.importDetails.vatAmount),
      totalDutiesAndTaxes: convertImp(item.importDetails.totalDutiesAndTaxes),
      portAndBrokerageFee: convertImp(item.importDetails.portAndBrokerageFee),
      totalLandedCost: convertImp(item.importDetails.totalLandedCost),
      costPerUnitLanded: convertImp(item.importDetails.costPerUnitLanded)
    };
  }

  return {
    ...item,
    purchaseCost: convert(item.purchaseCost),
    residualValue: convert(item.residualValue),
    amount: convert(item.amount),
    unitCost: convert(item.unitCost),
    stockUnitCost: convert(item.stockUnitCost),
    directCostPerUnitOrJob: convert(item.directCostPerUnitOrJob),
    monthlyExpenseAmount: convert(item.monthlyExpenseAmount),
    setupExpenseAmount: convert(item.setupExpenseAmount),
    rentalRatePerUnit: convert(item.rentalRatePerUnit),
    importDetails: normalizedImportDetails
  };
}

/**
 * Normalize GoodsProduct to target currency
 */
export function normalizeGoodsProductToCurrency(
  prod: GoodsProduct,
  targetCurrency: CurrencyCode = 'USD',
  rate: number = DEFAULT_USD_TO_XCD_RATE
): GoodsProduct {
  const itemCurrency: CurrencyCode = prod.currency || 'USD';
  if (itemCurrency === targetCurrency) return { ...prod };

  return {
    ...prod,
    sellingPrice: convertCurrency(prod.sellingPrice, itemCurrency, targetCurrency, rate),
    unitCost: prod.unitCost !== undefined ? convertCurrency(prod.unitCost, itemCurrency, targetCurrency, rate) : undefined,
    costItems: prod.costItems?.map((ci) => normalizeCostItemToCurrency(ci, targetCurrency, rate))
  };
}

/**
 * Normalize ServiceOffering to target currency
 */
export function normalizeServiceOfferingToCurrency(
  service: ServiceOffering,
  targetCurrency: CurrencyCode = 'USD',
  rate: number = DEFAULT_USD_TO_XCD_RATE
): ServiceOffering {
  const itemCurrency: CurrencyCode = service.currency || 'USD';
  if (itemCurrency === targetCurrency) return { ...service };

  return {
    ...service,
    rate: convertCurrency(service.rate, itemCurrency, targetCurrency, rate),
    directCostPerUnitOrJob:
      service.directCostPerUnitOrJob !== undefined
        ? convertCurrency(service.directCostPerUnitOrJob, itemCurrency, targetCurrency, rate)
        : undefined,
    costItems: service.costItems?.map((ci) => normalizeCostItemToCurrency(ci, targetCurrency, rate))
  };
}

/**
 * Get the normalized monetary value for a cost item in the target currency,
 * respecting import details (which store exact Landed EC$ and Landed US$)
 * to prevent double-conversion or currency corruption.
 */
export function normalizeCostItemAmount(
  item: StartupCostItem,
  targetCurrency: CurrencyCode = 'XCD',
  rate: number = DEFAULT_USD_TO_XCD_RATE
): number {
  if (!item) return 0;

  // If item has importDetails with pre-calculated dual landed values
  if (item.importDetails?.isImported) {
    if (targetCurrency === 'XCD') {
      const landedXCD = item.importDetails.totalLandedCostXCD ?? item.importDetails.totalLandedCost;
      if (landedXCD !== undefined && landedXCD > 0) {
        return roundCurrency(landedXCD);
      }
    } else if (targetCurrency === 'USD') {
      const landedUSD = item.importDetails.totalLandedCostUSD;
      if (landedUSD !== undefined && landedUSD > 0) {
        return roundCurrency(landedUSD);
      }
      const rawXCD = item.importDetails.totalLandedCostXCD ?? item.importDetails.totalLandedCost;
      if (rawXCD !== undefined && rawXCD > 0) {
        return roundCurrency(rawXCD / (rate > 0 ? rate : DEFAULT_USD_TO_XCD_RATE));
      }
    }
  }

  // Get raw value based on classification
  let rawVal = 0;
  if (item.classification === 'equipment') {
    rawVal = item.purchaseCost ?? item.amount ?? 0;
  } else if (item.classification === 'stock') {
    const qty = item.stockQuantity ?? item.initialStockUnits ?? 1;
    const unitC = item.stockUnitCost ?? item.unitCost ?? 0;
    rawVal = qty * unitC;
  } else if (item.classification === 'direct') {
    rawVal = item.directCostPerUnitOrJob ?? item.unitCost ?? item.amount ?? 0;
  } else if (item.classification === 'operating') {
    rawVal = item.monthlyExpenseAmount ?? item.amount ?? 0;
  } else if (item.classification === 'setup') {
    rawVal = item.setupExpenseAmount ?? item.amount ?? 0;
  } else {
    rawVal = item.amount ?? 0;
  }

  const itemCurrency: CurrencyCode = item.currency || 'XCD';
  return convertCurrency(rawVal, itemCurrency, targetCurrency, rate);
}
