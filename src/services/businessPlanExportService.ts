import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Packer,
  WidthType,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  BorderStyle,
  ShadingType
} from 'docx';
import { BudgetEvent, StartupPlanDetails, BusinessPlanSections } from '../types';
import {
  calculateMonthlyOperatingExpenses,
  generateStartupFinancialForecast,
  getServiceOfferingUnitLabel
} from './startupFinancialsService';

export interface BusinessPlanCalculations {
  costOfGoodsSoldUnit: number;
  sellingPrice: number;
  markupPercent: number;
  monthlyUnits: number;
  grossMarginPercent: number;
  monthlyRevenue: number;
  monthlyCOGS: number;
  monthlyGrossProfit: number;
  monthlyOpExpenses: number;
  monthlyNetOperatingProfit: number;
  y1Rev: number;
  y3Rev: number;
  y5Rev: number;
  y1COGS: number;
  y3COGS: number;
  y5COGS: number;
  y1Gross: number;
  y3Gross: number;
  y5Gross: number;
  y1OpEx: number;
  y3OpEx: number;
  y5OpEx: number;
  y1Net: number;
  y3Net: number;
  y5Net: number;
  netMarginPercent: number;
  materialsCostPerUnit: number;
  laborCostPerUnit: number;
  allocatedOverheadPerUnit: number;
  calculatedProfitPerUnit: number;
  preTaxSellingPrice: number;
  finalSuggestedPrice: number;
  contingencyPercent: number;
  includeVat: boolean;
  includeLevy: boolean;
  vatCost: number;
  levyCost: number;

  // Service Business & Advanced Model additions
  isServiceBusiness?: boolean;
  businessModelType?: 'goods' | 'services' | 'both';
  operatingModel?: 'mobile' | 'fixed' | 'hybrid';
  directCostPerUnit?: number;
  unitContributionMargin?: number;
  contributionMarginPercent?: number;
  breakEvenRevenueMonthly?: number;
  breakEvenUnitsMonthly?: number;
  breakEvenMetricLabel?: string;
  revenueUnitLabel?: string;
  ebitdaYear1?: number;
  ebitYear1?: number;
  depreciationYear1?: number;
  interestYear1?: number;
  currencySymbol?: string;
}

export const computeStartupCalculations = (sd?: StartupPlanDetails): BusinessPlanCalculations => {
  const isServices = sd?.businessModelType === 'services' || sd?.businessModelType === 'both' || Boolean(sd?.serviceOfferings && sd.serviceOfferings.length > 0);

  // Authoritative single-source operating expenses
  const opexData = calculateMonthlyOperatingExpenses(sd);
  const monthlyOpExpenses = opexData.totalMonthlyOperatingExpenses;

  // Check for equipment depreciation in Year 1
  const costItems = sd?.costItems || [];
  const equipmentItems = costItems.filter((i) => i.classification === 'equipment');
  const totalAnnualDepreciation = equipmentItems.reduce((sum, eq) => {
    const cost = eq.purchaseCost ?? eq.amount ?? 0;
    const res = eq.residualValue ?? 0;
    const life = Math.max(1, eq.usefulLifeYears ?? 3);
    return sum + ((cost - res) / life);
  }, 0);

  // Service and hybrid plans use the authoritative forecast engine so currency conversion,
  // month-over-month growth, financing, and annual targets remain consistent across the app and exports.
  if (isServices) {
    const activeCurrency = sd?.displayCurrency || 'USD';
    const activeRate = sd?.exchangeRate || 2.70;
    const forecast = generateStartupFinancialForecast(sd, activeCurrency, activeRate);
    const month1 = forecast.monthlyYear1[0];
    const y1 = forecast.yearlyProjections.find((p) => p.year === 1) || forecast.yearlyProjections[0];
    const y3 = forecast.yearlyProjections.find((p) => p.year === 3) || y1;
    const y5 = forecast.yearlyProjections.find((p) => p.year === 5) || y1;

    const serviceOfferings = sd?.serviceOfferings || [];
    const businessModelType = sd?.businessModelType || 'services';
    const useBlendedBookingBasis = businessModelType === 'services' && serviceOfferings.length > 1;
    const monthlyUnits = businessModelType === 'both'
      ? (month1?.salesVolumeUnits || 0) + (month1?.serviceBookingEquivalents || month1?.billableHoursOrJobs || 0)
      : (
          useBlendedBookingBasis
            ? (month1?.serviceBookingEquivalents || 0)
            : (month1?.billableHoursOrJobs || 0)
        );

    const monthlyRevenue = month1?.revenue || 0;
    const monthlyCOGS = month1?.cogs || 0;
    const monthlyGrossProfit = month1?.grossProfit || 0;
    const avgSellingPrice = monthlyUnits > 0 ? parseFloat((monthlyRevenue / monthlyUnits).toFixed(2)) : 0;
    const avgDirectCost = monthlyUnits > 0 ? parseFloat((monthlyCOGS / monthlyUnits).toFixed(2)) : 0;
    const unitContribMargin = parseFloat((avgSellingPrice - avgDirectCost).toFixed(2));
    const grossMarginPercent = monthlyRevenue > 0
      ? Math.round((monthlyGrossProfit / monthlyRevenue) * 100)
      : 0;
    const contribMarginPercent = grossMarginPercent;

    const unitLabels = Array.from(new Set(serviceOfferings.map((s) => getServiceOfferingUnitLabel(s))));
    const unitLabel = businessModelType === 'both'
      ? 'Combined Product & Service Units'
      : (
          useBlendedBookingBasis
            ? 'Blended Bookings / Sessions'
            : (unitLabels.length === 1 ? unitLabels[0] : 'Service Units')
        );

    const monthlyNetOperatingProfit = monthlyGrossProfit - monthlyOpExpenses;
    const netMarginPercent = monthlyRevenue > 0
      ? Math.round((monthlyNetOperatingProfit / monthlyRevenue) * 100)
      : 0;

    const y1Ebitda = y1 ? y1.grossProfit - y1.operatingExpenses : 0;
    const y3Ebitda = y3 ? y3.grossProfit - y3.operatingExpenses : 0;
    const y5Ebitda = y5 ? y5.grossProfit - y5.operatingExpenses : 0;

    return {
      costOfGoodsSoldUnit: avgDirectCost,
      sellingPrice: avgSellingPrice,
      markupPercent: avgDirectCost > 0
        ? parseFloat((((avgSellingPrice - avgDirectCost) / avgDirectCost) * 100).toFixed(1))
        : 0,
      monthlyUnits,
      grossMarginPercent,
      netMarginPercent,
      monthlyRevenue,
      monthlyCOGS,
      monthlyGrossProfit,
      monthlyOpExpenses,
      monthlyNetOperatingProfit,
      y1Rev: y1?.revenue || 0,
      y3Rev: y3?.revenue || 0,
      y5Rev: y5?.revenue || 0,
      y1COGS: y1?.cogs || 0,
      y3COGS: y3?.cogs || 0,
      y5COGS: y5?.cogs || 0,
      y1Gross: y1?.grossProfit || 0,
      y3Gross: y3?.grossProfit || 0,
      y5Gross: y5?.grossProfit || 0,
      y1OpEx: y1?.operatingExpenses || 0,
      y3OpEx: y3?.operatingExpenses || 0,
      y5OpEx: y5?.operatingExpenses || 0,
      // These legacy "*Net" fields historically represent operating profit / EBITDA.
      y1Net: y1Ebitda,
      y3Net: y3Ebitda,
      y5Net: y5Ebitda,
      materialsCostPerUnit: avgDirectCost,
      laborCostPerUnit: 0,
      allocatedOverheadPerUnit: 0,
      calculatedProfitPerUnit: unitContribMargin,
      preTaxSellingPrice: avgSellingPrice,
      finalSuggestedPrice: avgSellingPrice,
      contingencyPercent: 0,
      includeVat: !!sd?.includeVat,
      includeLevy: !!sd?.includeLevy,
      vatCost: 0,
      levyCost: 0,

      isServiceBusiness: true,
      businessModelType,
      operatingModel: sd?.operatingModel || 'mobile',
      directCostPerUnit: avgDirectCost,
      unitContributionMargin: unitContribMargin,
      contributionMarginPercent: contribMarginPercent,
      breakEvenRevenueMonthly: forecast.breakEven.breakEvenRevenueMonthly,
      breakEvenUnitsMonthly: forecast.breakEven.breakEvenUnitsMonthly,
      breakEvenMetricLabel: forecast.breakEven.breakEvenMetricLabel || unitLabel,
      revenueUnitLabel: unitLabel,
      ebitdaYear1: y1Ebitda,
      ebitYear1: y1Ebitda - (y1?.depreciation || 0),
      depreciationYear1: y1?.depreciation || totalAnnualDepreciation,
      interestYear1: y1?.loanInterestExpense || 0,
      currencySymbol: activeCurrency === 'USD' ? 'US$' : 'EC$'
    };
  }

  // Standard Goods Business Calculation
  const productionItems = sd?.productionItems || [];
  const derivedUnits = sd?.derivedUnits !== undefined ? sd.derivedUnits : 1;
  const hourlyRate = sd?.hourlyRate !== undefined ? sd.hourlyRate : 20;
  const laborHours = sd?.laborHours !== undefined ? sd.laborHours : 5;
  const desiredProfitType = sd?.desiredProfitType || 'percentage';
  const desiredProfitValue = sd?.desiredProfitValue !== undefined ? sd.desiredProfitValue : 50;
  const includeVat = !!sd?.includeVat;
  const includeLevy = !!sd?.includeLevy;
  const contingencyPercent = sd?.contingencyPercent !== undefined ? sd.contingencyPercent : 5;
  const allocateOverhead = !!sd?.allocateOverhead;

  const totalMaterialsCost = productionItems.reduce((sum, item) => sum + (item.cost || 0), 0);
  const materialsCostPerUnit = derivedUnits > 0 ? totalMaterialsCost / derivedUnits : 0;
  const contingencyCostPerUnit = materialsCostPerUnit * (contingencyPercent / 100);
  const finalMaterialsCostPerUnit = materialsCostPerUnit + contingencyCostPerUnit;

  const totalLaborCost = hourlyRate * laborHours;
  const laborCostPerUnit = derivedUnits > 0 ? totalLaborCost / derivedUnits : 0;

  const monthlyVolumeUnits = sd?.monthlyVolume || 1;
  const allocatedOverheadPerUnit = (allocateOverhead && monthlyVolumeUnits > 0) ? (monthlyOpExpenses / monthlyVolumeUnits) : 0;

  // Direct unit cost (materials + labor)
  const directCogsUnit = parseFloat((finalMaterialsCostPerUnit + laborCostPerUnit).toFixed(2));
  // Pricing baseline unit cost (includes allocated overhead for full absorption pricing when requested)
  const pricingCogsUnit = parseFloat((finalMaterialsCostPerUnit + laborCostPerUnit + allocatedOverheadPerUnit).toFixed(2));

  let calculatedProfitPerUnit = 0;
  if (desiredProfitType === 'percentage') {
    calculatedProfitPerUnit = pricingCogsUnit * (desiredProfitValue / 100);
  } else {
    calculatedProfitPerUnit = desiredProfitValue;
  }
  calculatedProfitPerUnit = parseFloat(calculatedProfitPerUnit.toFixed(2));

  const preTaxSellingPrice = parseFloat((pricingCogsUnit + calculatedProfitPerUnit).toFixed(2));
  const levyCost = includeLevy ? parseFloat((preTaxSellingPrice * 0.025).toFixed(2)) : 0;
  const vatCost = includeVat ? parseFloat((preTaxSellingPrice * 0.125).toFixed(2)) : 0;
  const finalSuggestedPrice = parseFloat((preTaxSellingPrice + levyCost + vatCost).toFixed(2));

  const hasDynamicCosting = productionItems.length > 0 || laborHours > 0 || allocateOverhead;
  const unitCostForPricing = hasDynamicCosting ? pricingCogsUnit : (sd?.cogs || 10);
  const markupPercent = hasDynamicCosting 
    ? (desiredProfitType === 'percentage' ? desiredProfitValue : parseFloat(((calculatedProfitPerUnit / (pricingCogsUnit || 1)) * 100).toFixed(1)))
    : (sd?.markup || 50);

  const sellingPrice = hasDynamicCosting ? finalSuggestedPrice : parseFloat((unitCostForPricing * (1 + markupPercent / 100)).toFixed(2));
  
  // In the P&L statement, COGS reflects direct variable production costs only.
  // Operating overhead is deducted separately in OpEx to prevent double-counting.
  const costOfGoodsSoldUnit = hasDynamicCosting ? directCogsUnit : (sd?.cogs || 10);
  const monthlyCOGS = costOfGoodsSoldUnit * monthlyVolumeUnits;
  const monthlyRevenue = sellingPrice * monthlyVolumeUnits;
  const monthlyGrossProfit = monthlyRevenue - monthlyCOGS;
  const monthlyUnits = monthlyVolumeUnits;
  
  const monthlyNetOperatingProfit = monthlyGrossProfit - monthlyOpExpenses;
  const grossMarginPercent = monthlyRevenue > 0 ? Math.round((monthlyGrossProfit / monthlyRevenue) * 100) : 0;
  const netMarginPercent = monthlyRevenue > 0 ? Math.round((monthlyNetOperatingProfit / monthlyRevenue) * 100) : 0;

  const g3 = 1 + (sd?.growthRateYear3 || 15) / 100;
  const g5 = 1 + (sd?.growthRateYear5 || 35) / 100;

  const y1Rev = monthlyRevenue * 12;
  const y1COGS = monthlyCOGS * 12;
  const y1Gross = y1Rev - y1COGS;
  const y1OpEx = monthlyOpExpenses * 12;
  const y1Net = y1Gross - y1OpEx;

  const y3Rev = y1Rev * g3;
  const y3COGS = y1COGS * g3;
  const y3Gross = y3Rev - y3COGS;
  const y3OpEx = y1OpEx * 1.08;
  const y3Net = y3Gross - y3OpEx;

  const y5Rev = y1Rev * g5;
  const y5COGS = y1COGS * g5;
  const y5Gross = y5Rev - y5COGS;
  const y5OpEx = y1OpEx * 1.15;
  const y5Net = y5Gross - y5OpEx;

  return {
    costOfGoodsSoldUnit,
    sellingPrice,
    markupPercent,
    monthlyUnits,
    grossMarginPercent,
    netMarginPercent,
    monthlyRevenue,
    monthlyCOGS,
    monthlyGrossProfit,
    monthlyOpExpenses,
    monthlyNetOperatingProfit,
    y1Rev,
    y3Rev,
    y5Rev,
    y1COGS,
    y3COGS,
    y5COGS,
    y1Gross,
    y3Gross,
    y5Gross,
    y1OpEx,
    y3OpEx,
    y5OpEx,
    y1Net,
    y3Net,
    y5Net,
    materialsCostPerUnit: finalMaterialsCostPerUnit,
    laborCostPerUnit,
    allocatedOverheadPerUnit,
    calculatedProfitPerUnit,
    preTaxSellingPrice,
    finalSuggestedPrice,
    contingencyPercent,
    includeVat,
    includeLevy,
    vatCost,
    levyCost,

    isServiceBusiness: false,
    businessModelType: sd?.businessModelType || 'goods',
    operatingModel: sd?.operatingModel,
    directCostPerUnit: costOfGoodsSoldUnit,
    unitContributionMargin: sellingPrice - costOfGoodsSoldUnit,
    contributionMarginPercent: grossMarginPercent,
    breakEvenRevenueMonthly: grossMarginPercent > 0 ? Math.round(monthlyOpExpenses / (grossMarginPercent / 100)) : 0,
    breakEvenUnitsMonthly: (sellingPrice - costOfGoodsSoldUnit) > 0 ? Math.ceil(monthlyOpExpenses / (sellingPrice - costOfGoodsSoldUnit)) : 0,
    breakEvenMetricLabel: 'Units',
    revenueUnitLabel: 'Units',
    ebitdaYear1: y1Net,
    ebitYear1: y1Net - totalAnnualDepreciation,
    depreciationYear1: totalAnnualDepreciation,
    currencySymbol: sd?.displayCurrency === 'USD' ? 'US$' : 'EC$'
  };
};

// Styling Constants (Corporate Funding Palette)
const COLOR_PRIMARY = '0F2942';    // Deep Corporate Navy
const COLOR_SECONDARY = '0D9488';  // Executive Deep Teal
const COLOR_ACCENT = '2563EB';     // Royal Blue Accent
const COLOR_DARK = '1E293B';       // Slate Dark
const COLOR_MUTED = '64748B';      // Slate Muted
const COLOR_BG_HEADER = 'F1F5F9';  // Light Slate Table Header
const COLOR_BG_ZEBRA = 'F8FAFC';   // Clean Alternating Row Tint
const COLOR_BORDER = 'CBD5E1';     // Slate 300
const COLOR_CALLOUT_BG = 'F0FDFA'; // Pale Teal Tint

function createSectionHeading(title: string, sectionNumber?: string): Paragraph {
  const displayText = sectionNumber ? `${sectionNumber}. ${title.toUpperCase()}` : title.toUpperCase();
  return new Paragraph({
    text: displayText,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 140 },
    border: {
      bottom: {
        color: COLOR_SECONDARY,
        space: 6,
        style: BorderStyle.SINGLE,
        size: 16
      }
    }
  });
}

function createSubHeading(title: string): Paragraph {
  return new Paragraph({
    text: title,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 }
  });
}

function createParagraph(text: string, options?: { italic?: boolean; bold?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }): Paragraph {
  return new Paragraph({
    alignment: options?.align || AlignmentType.LEFT,
    spacing: { after: 140, line: 280 },
    children: [
      new TextRun({
        text,
        italics: options?.italic,
        bold: options?.bold,
        color: options?.color || '222222',
        size: 22 // 11pt
      })
    ]
  });
}

function createTableCell(
  content: string | Paragraph[],
  isHeader = false,
  widthPercent?: number,
  align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
  options?: { isZebra?: boolean; isHighlight?: boolean; isDoubleBottom?: boolean }
): TableCell {
  const children = typeof content === 'string'
    ? [new Paragraph({
        alignment: align,
        children: [new TextRun({
          text: content,
          bold: isHeader || options?.isHighlight,
          size: 20, // 10pt
          color: isHeader ? COLOR_PRIMARY : (options?.isHighlight ? COLOR_SECONDARY : '333333')
        })]
      })]
    : content;

  let fill: string | undefined = undefined;
  if (isHeader) fill = COLOR_BG_HEADER;
  else if (options?.isHighlight) fill = COLOR_CALLOUT_BG;
  else if (options?.isZebra) fill = COLOR_BG_ZEBRA;

  return new TableCell({
    width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 130, bottom: 130, left: 150, right: 150 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      bottom: { 
        style: options?.isDoubleBottom ? BorderStyle.DOUBLE : BorderStyle.SINGLE, 
        size: options?.isDoubleBottom ? 12 : 4, 
        color: options?.isDoubleBottom ? COLOR_PRIMARY : COLOR_BORDER 
      },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
    },
    children
  });
}

/**
 * Generate a complete, funding-ready DOCX business plan
 */
export async function generateBusinessPlanDocx(
  project: BudgetEvent,
  calc: BusinessPlanCalculations
): Promise<Blob> {
  const sd: StartupPlanDetails = project.startupDetails || {
    cogs: 0,
    markup: 50,
    monthlyVolume: 100,
    rent: 0,
    salaries: 0,
    marketing: 0,
    utilities: 0,
    otherExpenses: 0,
    growthRateYear3: 50,
    growthRateYear5: 100
  };

  const bp: BusinessPlanSections = sd.businessPlan || {};
  const companyName = bp.companyName || project.name;
  const planTitle = bp.businessPlanTitle || `${project.name} - Comprehensive Business Plan`;
  const preparedBy = bp.preparedBy || 'Project Executive';
  const prepDate = bp.preparedDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const targetAgency = bp.fundingAgencyOrBank || 'Commercial Lending & Development Agency';
  const activeCurrency = sd.displayCurrency || 'USD';
  const activeRate = sd.exchangeRate || 2.70;
  const currencySymbol = calc.currencySymbol || (activeCurrency === 'XCD' ? 'EC$' : 'US$');
  const isServicePlan = Boolean(calc.isServiceBusiness);
  const isHybridPlan = sd.businessModelType === 'both';
  const financialForecast = generateStartupFinancialForecast(sd, activeCurrency, activeRate);
  const projectionFor = (yearNumber: number) =>
    financialForecast.yearlyProjections.find((p) => p.year === yearNumber) ?? financialForecast.yearlyProjections[0]!;
  const statementFor = (yearNumber: number) => {
    const projection = projectionFor(yearNumber);
    const ebitda = projection.grossProfit - projection.operatingExpenses;
    const depreciation = projection.depreciation || 0;
    const ebit = ebitda - depreciation;
    const interest = projection.loanInterestExpense || 0;
    const profitBeforeTax = ebit - interest;
    return { ...projection, ebitda, depreciation, ebit, interest, profitBeforeTax };
  };
  const y1Statement = statementFor(1);
  const y3Statement = statementFor(3);
  const y5Statement = statementFor(5);
  const year1Volume = financialForecast.monthlyYear1.reduce((sum, month) => {
    if (sd.businessModelType === 'both') return sum + month.salesVolumeUnits + month.billableHoursOrJobs;
    return sum + (isServicePlan ? month.billableHoursOrJobs : month.salesVolumeUnits);
  }, 0);
  const serviceUnitLabel = calc.revenueUnitLabel || 'Service Units';
  const volumeLabel = sd.businessModelType === 'both'
    ? 'Combined Product & Service Units'
    : (isServicePlan ? serviceUnitLabel : 'Units Sold');
  const money = (value: number) => `${currencySymbol}${Math.round(value).toLocaleString()}`;
  const money2 = (value: number) => `${currencySymbol}${value.toFixed(2)}`;

  const docChildren: (Paragraph | Table)[] = [];

  // =========================================================================
  // COVER PAGE
  // =========================================================================
  docChildren.push(
    new Paragraph({ spacing: { before: 800 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: companyName.toUpperCase(),
          bold: true,
          size: 40, // 20pt
          color: COLOR_PRIMARY
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: 'COMMERCIAL BUSINESS PLAN & FUNDING PROPOSAL',
          bold: true,
          size: 28, // 14pt
          color: COLOR_SECONDARY
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY }
      }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 100 },
      children: [
        new TextRun({ text: 'Target Funding Institution: ', bold: true, size: 22 }),
        new TextRun({ text: targetAgency, size: 22 })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: 'Prepared By: ', bold: true, size: 22 }),
        new TextRun({ text: preparedBy, size: 22 })
      ]
    }),
    ...(bp.contactEmail || bp.contactPhone ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({ text: 'Contact: ', bold: true, size: 20 }),
          new TextRun({ text: [bp.contactEmail, bp.contactPhone].filter(Boolean).join(' | '), size: 20, color: COLOR_MUTED })
        ]
      })
    ] : []),
    ...(bp.businessAddress ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({ text: 'Business Location: ', bold: true, size: 20 }),
          new TextRun({ text: bp.businessAddress, size: 20, color: COLOR_MUTED })
        ]
      })
    ] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({ text: 'Date of Submission: ', bold: true, size: 20 }),
        new TextRun({ text: prepDate, size: 20 })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
      children: [
        new TextRun({
          text: 'STRICTLY CONFIDENTIAL',
          bold: true,
          size: 18,
          color: 'DC2626' // Rose red
        }),
        new TextRun({
          text: '\nThis document contains proprietary information submitted solely for investment evaluation and funding review. Duplication or unauthorized circulation is strictly prohibited.',
          italics: true,
          size: 16,
          color: COLOR_MUTED
        })
      ]
    }),
    // End of Cover Page -> Page Break
    new Paragraph({ pageBreakBefore: true })
  );

  // Helper to add structured section with paragraphs
  let sectionIndex = 1;
  const addSection = (title: string, content?: string) => {
    if (!content || !content.trim()) return false;
    docChildren.push(createSectionHeading(title, String(sectionIndex++)));
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    if (paragraphs.length > 0) {
      paragraphs.forEach(p => {
        docChildren.push(createParagraph(p.trim()));
      });
    } else {
      docChildren.push(createParagraph(content.trim()));
    }
    return true;
  };

  // 1. Executive Summary
  addSection('Executive Summary', bp.executiveSummary || '');

  // Executive KPI Summary Cards
  docChildren.push(
    createSubHeading('Executive Financial Highlights & Target Metrics'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell([
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isServicePlan ? (sd.businessModelType === 'both' ? 'BLENDED REVENUE / UNIT' : 'SERVICE RATE / AVG VALUE') : 'RETAIL SALE PRICE', size: 16, color: COLOR_MUTED, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: money2(calc.finalSuggestedPrice), size: 28, bold: true, color: COLOR_PRIMARY })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isServicePlan ? `${calc.contributionMarginPercent ?? calc.grossMarginPercent}% Contribution Margin` : `${calc.markupPercent}% Target Markup`, size: 16, color: COLOR_SECONDARY })] })
            ], false, 25, AlignmentType.CENTER, { isHighlight: true }),
            createTableCell([
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isHybridPlan ? 'BLENDED DIRECT COST / UNIT' : (isServicePlan ? 'DIRECT COST / SERVICE UNIT' : 'UNIT COGS'), size: 16, color: COLOR_MUTED, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: money2(calc.costOfGoodsSoldUnit), size: 28, bold: true, color: COLOR_PRIMARY })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${calc.grossMarginPercent}% ${isServicePlan ? 'Contribution' : 'Gross'} Margin`, size: 16, color: COLOR_MUTED })] })
            ], false, 25, AlignmentType.CENTER),
            createTableCell([
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'YEAR 1 REVENUE', size: 16, color: COLOR_MUTED, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: money(y1Statement.revenue), size: 28, bold: true, color: COLOR_PRIMARY })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${year1Volume.toLocaleString()} ${volumeLabel}/Yr`, size: 16, color: COLOR_MUTED })] })
            ], false, 25, AlignmentType.CENTER),
            createTableCell([
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'YEAR 1 EBITDA', size: 16, color: COLOR_MUTED, bold: true })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: money(y1Statement.ebitda), size: 28, bold: true, color: COLOR_SECONDARY })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${y1Statement.revenue > 0 ? Math.round((y1Statement.ebitda / y1Statement.revenue) * 100) : 0}% EBITDA Margin`, size: 16, color: COLOR_SECONDARY, bold: true })] })
            ], false, 25, AlignmentType.CENTER, { isHighlight: true })
          ]
        })
      ]
    }),
    new Paragraph({ spacing: { after: 200 } })
  );

  // 2. Business Description
  addSection('Business Description', bp.businessDescription);

  // 3. Business Objectives
  addSection('Business Objectives', bp.businessObjectives);

  // 4. Problem & Market Opportunity
  addSection('Problem & Market Opportunity', bp.problemOpportunity);

  // 5. Products & Services
  addSection('Products & Services', bp.productsServices);

  // 6. Target Market
  addSection('Target Market', bp.targetMarket);

  // 7. Customer Profile
  addSection('Customer Profile', bp.customerProfile);

  // 8. Market Analysis
  addSection('Market Analysis', bp.marketAnalysis);

  // 9. Competitor Analysis
  addSection('Competitor Analysis', bp.competitorAnalysis);

  // 10. Competitive Advantage
  addSection('Competitive Advantage', bp.competitiveAdvantage);

  // 11. Business Model
  addSection('Business Model', bp.businessModel);

  // 12. Revenue Model
  addSection('Revenue Model', bp.revenueModel);

  // 13. Marketing & Sales Strategy
  addSection('Marketing & Sales Strategy', bp.marketingSalesStrategy);

  // 14. Operations Plan
  addSection('Operations Plan', bp.operationsPlan);

  // 15. Equipment & Technology Requirements
  addSection('Equipment & Technology Requirements', bp.equipmentTechRequirements);

  // 16. Suppliers & Procurement
  addSection('Suppliers & Procurement', bp.suppliers);

  // 17. Management & Staffing
  addSection('Management & Staffing', bp.managementStaffing);

  // 18. Startup Requirements
  addSection('Startup Requirements & Initial Capitalization', bp.startupRequirements);

  // =========================================================================
  // FINANCIAL SECTION: Pricing / Unit Economics
  // =========================================================================
  docChildren.push(
    createSectionHeading(
      isHybridPlan ? 'Hybrid Revenue & Unit Economics' : (isServicePlan ? 'Service Pricing & Unit Economics' : 'Product Costing & Unit Pricing'),
      String(sectionIndex++)
    ),
    createParagraph(isHybridPlan
      ? 'The following unit economics summarize the combined product-and-service revenue model, blended direct costs, contribution margin, and break-even basis from the configured assumptions.'
      : (isServicePlan
        ? 'The following unit economics summarize the configured service rate, direct variable cost, contribution margin, and break-even basis using the service-unit label selected for the business.'
        : 'The following pricing model summarizes direct product cost, labor allocation, overhead allocation, and calculated selling price from the configured assumptions.'))
  );

  const productionItems = sd.productionItems || [];
  if ((!isServicePlan || isHybridPlan) && productionItems.length > 0) {
    docChildren.push(createSubHeading('Direct Materials & Supplier Quoted Inputs'));
    const itemRows: TableRow[] = [
      new TableRow({
        children: [
          createTableCell('Item / Component', true, 30),
          createTableCell('Supplier / Specification', true, 30),
          createTableCell('Qty', true, 10, AlignmentType.RIGHT),
          createTableCell('Unit Cost', true, 15, AlignmentType.RIGHT),
          createTableCell('Total Cost', true, 15, AlignmentType.RIGHT)
        ]
      })
    ];

    productionItems.forEach((item) => {
      itemRows.push(new TableRow({
        children: [
          createTableCell(item.name || 'Component'),
          createTableCell(item.description || item.supplier || '-'),
          createTableCell(String(item.quantity || 1), false, undefined, AlignmentType.RIGHT),
          createTableCell(money2(item.unitCost || item.cost || 0), false, undefined, AlignmentType.RIGHT),
          createTableCell(money2(item.cost || 0), false, undefined, AlignmentType.RIGHT)
        ]
      }));
    });

    const totalBatchCost = productionItems.reduce((sum, item) => sum + (item.cost || 0), 0);
    itemRows.push(new TableRow({
      children: [
        createTableCell('Total Material Inputs (Batch Yield)', true, 80),
        createTableCell(money2(totalBatchCost), true, 20, AlignmentType.RIGHT)
      ]
    }));
    docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: itemRows }));
    docChildren.push(new Paragraph({ spacing: { after: 180 } }));
  }

  const unitBreakdownRows: TableRow[] = isServicePlan ? [
    new TableRow({
      children: [
        createTableCell(isHybridPlan ? 'Hybrid Unit Economics' : 'Service Unit Economics', true, 60),
        createTableCell('Value', true, 40, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell(isHybridPlan ? 'Combined Activity Unit Label' : 'Service Unit Label'),
        createTableCell(serviceUnitLabel, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell(isHybridPlan ? 'Average Revenue per Combined Unit' : 'Average Revenue / Rate per Service Unit'),
        createTableCell(money2(calc.finalSuggestedPrice), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell(isHybridPlan ? 'Blended Direct Cost per Combined Unit' : 'Direct Variable Cost per Service Unit'),
        createTableCell(money2(calc.costOfGoodsSoldUnit), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Contribution Margin', true),
        createTableCell(money2(calc.unitContributionMargin ?? (calc.finalSuggestedPrice - calc.costOfGoodsSoldUnit)), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Contribution Margin %'),
        createTableCell(`${calc.contributionMarginPercent ?? calc.grossMarginPercent}%`, true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Monthly Break-Even Volume'),
        createTableCell(`${calc.breakEvenUnitsMonthly || 0} ${calc.breakEvenMetricLabel || serviceUnitLabel}`, true, undefined, AlignmentType.RIGHT)
      ]
    })
  ] : [
    new TableRow({
      children: [
        createTableCell('Unit Pricing Parameter', true, 60),
        createTableCell('Value / Unit Impact', true, 40, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Raw Material Cost per Unit'),
        createTableCell(money2(calc.materialsCostPerUnit), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    ...(calc.contingencyPercent > 0 ? [new TableRow({
      children: [
        createTableCell(`Material Contingency Buffer (${calc.contingencyPercent}%)`),
        createTableCell(`+${money2((calc.materialsCostPerUnit * calc.contingencyPercent) / 100)}`, false, undefined, AlignmentType.RIGHT)
      ]
    })] : []),
    new TableRow({
      children: [
        createTableCell('Direct Labor Cost per Unit'),
        createTableCell(`+${money2(calc.laborCostPerUnit)}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    ...(calc.allocatedOverheadPerUnit > 0 ? [new TableRow({
      children: [
        createTableCell('Allocated Fixed Monthly Overhead per Unit'),
        createTableCell(`+${money2(calc.allocatedOverheadPerUnit)}`, false, undefined, AlignmentType.RIGHT)
      ]
    })] : []),
    new TableRow({
      children: [
        createTableCell('Calculated Cost of Goods Sold (COGS)', true),
        createTableCell(money2(calc.costOfGoodsSoldUnit), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell(`Target Unit Profit Markup (${calc.markupPercent}%)`),
        createTableCell(`+${money2(calc.calculatedProfitPerUnit)}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Determined Pre-Tax Retail Price', true),
        createTableCell(money2(calc.preTaxSellingPrice), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    ...(calc.includeLevy ? [new TableRow({
      children: [
        createTableCell('Health & Security Levy (2.5%)'),
        createTableCell(`+${money2(calc.levyCost)}`, false, undefined, AlignmentType.RIGHT)
      ]
    })] : []),
    ...(calc.includeVat ? [new TableRow({
      children: [
        createTableCell('Value Added Tax (VAT 12.5%)'),
        createTableCell(`+${money2(calc.vatCost)}`, false, undefined, AlignmentType.RIGHT)
      ]
    })] : []),
    new TableRow({
      children: [
        createTableCell('FINAL INVOICE / SALE PRICE', true),
        createTableCell(money2(calc.finalSuggestedPrice), true, undefined, AlignmentType.RIGHT)
      ]
    })
  ];

  docChildren.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: unitBreakdownRows
  }), new Paragraph({ spacing: { after: 240 } }));

  // =========================================================================
  // FINANCIAL SECTION: Operating Expenses & P&L Statement
  // =========================================================================
  docChildren.push(
    createSectionHeading('Monthly Operating Expenses & Projections', String(sectionIndex++)),
    createParagraph('The following schedule outlines recurring operating commitments used by the financial forecast:')
  );

  const opexResult = calculateMonthlyOperatingExpenses(sd);
  const monthlyTotalOpEx = opexResult.totalMonthlyOperatingExpenses;
  const opexRows: TableRow[] = [
    new TableRow({
      children: [
        createTableCell('Operating Expense Category', true, 60),
        createTableCell('Monthly Allocation', true, 20, AlignmentType.RIGHT),
        createTableCell('Annualized Budget', true, 20, AlignmentType.RIGHT)
      ]
    }),
    ...opexResult.operatingExpensesBreakdown.map((item) => new TableRow({
      children: [
        createTableCell(item.name),
        createTableCell(money(item.amount), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(item.amount * 12), false, undefined, AlignmentType.RIGHT)
      ]
    })),
    new TableRow({
      children: [
        createTableCell('TOTAL RECURRING OPERATING OVERHEAD', true),
        createTableCell(money(monthlyTotalOpEx), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(monthlyTotalOpEx * 12), true, undefined, AlignmentType.RIGHT)
      ]
    })
  ];

  docChildren.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: opexRows
  }), new Paragraph({ spacing: { after: 240 } }));

  docChildren.push(
    createSubHeading('Multi-Year Profit & Loss Projections'),
    createParagraph('Projections are generated from the configured revenue, direct-cost, operating-expense, growth, depreciation, and financing assumptions:')
  );

  const pnlRows: TableRow[] = [
    new TableRow({
      children: [
        createTableCell('Profit & Loss Statement Line', true, 40),
        createTableCell('Year 1', true, 20, AlignmentType.RIGHT),
        createTableCell('Year 3', true, 20, AlignmentType.RIGHT),
        createTableCell('Year 5', true, 20, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Gross Operating Revenue', true),
        createTableCell(money(y1Statement.revenue), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.revenue), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.revenue), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell(isHybridPlan ? 'Direct Product & Service Costs' : (isServicePlan ? 'Direct Variable Service Costs' : 'Cost of Goods Sold (COGS)')),
        createTableCell(money(y1Statement.cogs), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.cogs), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.cogs), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell(isServicePlan ? 'Gross Profit / Contribution Margin' : 'Gross Profit', true),
        createTableCell(money(y1Statement.grossProfit), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.grossProfit), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.grossProfit), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Operating Expenses (OpEx)'),
        createTableCell(money(y1Statement.operatingExpenses), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.operatingExpenses), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.operatingExpenses), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Operating Profit (EBITDA)', true),
        createTableCell(money(y1Statement.ebitda), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.ebitda), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.ebitda), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Depreciation'),
        createTableCell(money(y1Statement.depreciation), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.depreciation), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.depreciation), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Operating Profit After Depreciation (EBIT)', true),
        createTableCell(money(y1Statement.ebit), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.ebit), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.ebit), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Loan Interest Expense'),
        createTableCell(money(y1Statement.interest), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.interest), false, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.interest), false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Profit Before Tax (EBT)', true),
        createTableCell(money(y1Statement.profitBeforeTax), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.profitBeforeTax), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.profitBeforeTax), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Net Profit (Pre-Tax Model)', true),
        createTableCell(money(y1Statement.netProfit), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y3Statement.netProfit), true, undefined, AlignmentType.RIGHT),
        createTableCell(money(y5Statement.netProfit), true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('EBITDA Margin %'),
        createTableCell(`${y1Statement.revenue > 0 ? Math.round((y1Statement.ebitda / y1Statement.revenue) * 100) : 0}%`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`${y3Statement.revenue > 0 ? Math.round((y3Statement.ebitda / y3Statement.revenue) * 100) : 0}%`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`${y5Statement.revenue > 0 ? Math.round((y5Statement.ebitda / y5Statement.revenue) * 100) : 0}%`, false, undefined, AlignmentType.RIGHT)
      ]
    })
  ];

  docChildren.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: pnlRows
  }), new Paragraph({ spacing: { after: 240 } }));

  // Financial Notes
  if (bp.financialRequirements) addSection('Financial Requirements', bp.financialRequirements);
  if (bp.fundingRequirements) addSection('Funding Requirements', bp.fundingRequirements);
  if (bp.useOfFunds) addSection('Use of Funds & Capital Allocation', bp.useOfFunds);

  // 21. Implementation Plan
  addSection('Implementation Plan', bp.implementationPlan);

  // 22. Milestones & Project Schedule
  const tasks = project.tasks || [];
  if (tasks.length > 0 || bp.milestonesNotes) {
    docChildren.push(createSectionHeading('Milestones & Execution Timeline', String(sectionIndex++)));
    if (bp.milestonesNotes) {
      docChildren.push(createParagraph(bp.milestonesNotes));
    }

    if (tasks.length > 0) {
      const taskRows: TableRow[] = [
        new TableRow({
          children: [
            createTableCell('Milestone Task', true, 45),
            createTableCell('Target Date', true, 20),
            createTableCell('Priority', true, 15),
            createTableCell('Status', true, 20)
          ]
        })
      ];

      tasks.slice(0, 15).forEach(t => {
        taskRows.push(
          new TableRow({
            children: [
              createTableCell(t.text),
              createTableCell(t.dueDate || 'TBD'),
              createTableCell((t.priority || 'medium').toUpperCase()),
              createTableCell((t.status || 'not_started').replace('_', ' ').toUpperCase())
            ]
          })
        );
      });

      docChildren.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: taskRows
      }), new Paragraph({ spacing: { after: 240 } }));
    }
  }

  // 23. Risks & Mitigation
  addSection('Risk Analysis & Mitigation Strategies', bp.risksMitigation);

  // 24. Conclusion
  addSection('Conclusion & Funding Request Summary', bp.conclusion || `In conclusion, ${companyName} presents a viable, high-yield commercial opportunity with clear unit economics, robust operational safeguards, and scalable market demand. We respectfully submit this business plan for credit committee and grant funding approval.`);

  // Formal Endorsement & Execution Sign-Off Block
  docChildren.push(
    createSectionHeading('Commercial Endorsement & Executive Signatures', String(sectionIndex++)),
    createParagraph('By signing below, the undersigned principals and officers verify that this business plan and associated financial projections represent a true, fair, and rigorously prepared operating forecast:'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell([
              new Paragraph({ spacing: { before: 200, after: 600 } }),
              new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_BORDER } } }),
              new Paragraph({ children: [new TextRun({ text: preparedBy || 'Principal Executive', bold: true, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Managing Director / Founder', size: 18, color: COLOR_MUTED })] }),
              new Paragraph({ children: [new TextRun({ text: `Date: ${prepDate}`, size: 16, color: COLOR_MUTED })] })
            ], false, 50),
            createTableCell([
              new Paragraph({ spacing: { before: 200, after: 600 } }),
              new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_BORDER } } }),
              new Paragraph({ children: [new TextRun({ text: 'Authorized Financial Officer', bold: true, size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Chief Financial Officer / Accountant', size: 18, color: COLOR_MUTED })] }),
              new Paragraph({ children: [new TextRun({ text: 'Date: ________________________', size: 16, color: COLOR_MUTED })] })
            ], false, 50)
          ]
        })
      ]
    }),
    new Paragraph({ spacing: { after: 300 } })
  );

  // 25. Supporting Documents / Appendices
  const importedQuotes = sd.importedQuotes || [];
  const projectFiles = project.files || [];
  if (importedQuotes.length > 0 || projectFiles.length > 0) {
    docChildren.push(createSectionHeading('Supporting Documents & Appendices', String(sectionIndex++)));
    docChildren.push(createParagraph('The following original verified documents and supplier quotes are archived and available for audit verification:'));

    importedQuotes.forEach(q => {
      docChildren.push(createParagraph(`• Supplier Quote: ${q.supplier} (Quote Ref: ${q.quoteNumber || 'N/A'}, Date: ${q.quoteDate}) - Quoted Total: ${q.currency || 'USD'} $${(q.total || 0).toFixed(2)}${q.savedFileName ? ` [Archived as: ${q.savedFileName}]` : ''}`, { bold: true }));
    });

    projectFiles.forEach(f => {
      docChildren.push(createParagraph(`• Project Document: ${f.name} (${(f.size ? (f.size / 1024).toFixed(1) + ' KB' : 'Document')})`));
    });
  }

  // Build Document
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `${companyName} | Business Plan & Funding Proposal`,
                  size: 16,
                  color: COLOR_MUTED,
                  italics: true
                })
              ]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Confidential - Prepared for Commercial Funding Evaluation | Page ', size: 16, color: COLOR_MUTED }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR_MUTED }),
                new TextRun({ text: ' of ', size: 16, color: COLOR_MUTED }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLOR_MUTED })
              ]
            })
          ]
        })
      },
      children: docChildren
    }]
  });

  return await Packer.toBlob(doc);
}
