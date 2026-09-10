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
}

export const computeStartupCalculations = (sd?: StartupPlanDetails): BusinessPlanCalculations => {
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

  const rent = sd?.rent || 0;
  const salaries = sd?.salaries || 0;
  const marketing = sd?.marketing || 0;
  const utilities = sd?.utilities || 0;
  const otherExpenses = sd?.otherExpenses || 0;
  const monthlyOpExpenses = rent + salaries + marketing + utilities + otherExpenses;
  const monthlyVolumeUnits = sd?.monthlyVolume || 1;
  const allocatedOverheadPerUnit = (allocateOverhead && monthlyVolumeUnits > 0) ? (monthlyOpExpenses / monthlyVolumeUnits) : 0;

  const calculatedCogs = parseFloat((finalMaterialsCostPerUnit + laborCostPerUnit + allocatedOverheadPerUnit).toFixed(2));

  let calculatedProfitPerUnit = 0;
  if (desiredProfitType === 'percentage') {
    calculatedProfitPerUnit = calculatedCogs * (desiredProfitValue / 100);
  } else {
    calculatedProfitPerUnit = desiredProfitValue;
  }
  calculatedProfitPerUnit = parseFloat(calculatedProfitPerUnit.toFixed(2));

  const preTaxSellingPrice = parseFloat((calculatedCogs + calculatedProfitPerUnit).toFixed(2));
  const levyCost = includeLevy ? parseFloat((preTaxSellingPrice * 0.025).toFixed(2)) : 0;
  const vatCost = includeVat ? parseFloat((preTaxSellingPrice * 0.125).toFixed(2)) : 0;
  const finalSuggestedPrice = parseFloat((preTaxSellingPrice + levyCost + vatCost).toFixed(2));

  const hasDynamicCosting = productionItems.length > 0 || laborHours > 0 || allocateOverhead;
  const costOfGoodsSoldUnit = hasDynamicCosting ? calculatedCogs : (sd?.cogs || 10);
  const markupPercent = hasDynamicCosting 
    ? (desiredProfitType === 'percentage' ? desiredProfitValue : parseFloat(((calculatedProfitPerUnit / (calculatedCogs || 1)) * 100).toFixed(1)))
    : (sd?.markup || 50);

  const sellingPrice = hasDynamicCosting ? finalSuggestedPrice : parseFloat((costOfGoodsSoldUnit * (1 + markupPercent / 100)).toFixed(2));
  
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
    materialsCostPerUnit,
    laborCostPerUnit,
    allocatedOverheadPerUnit,
    calculatedProfitPerUnit,
    preTaxSellingPrice,
    finalSuggestedPrice,
    contingencyPercent,
    includeVat,
    includeLevy,
    vatCost,
    levyCost
  };
};

// Styling Constants (Corporate Funding Palette)
const COLOR_PRIMARY = '0F766E';    // Deep Emerald Teal
const COLOR_SECONDARY = '1E293B';  // Slate Dark
const COLOR_MUTED = '64748B';      // Slate Muted
const COLOR_BG_HEADER = 'F1F5F9';  // Light Slate Table Header
const COLOR_BORDER = 'CBD5E1';     // Slate 300

function createSectionHeading(title: string, sectionNumber?: string): Paragraph {
  const displayText = sectionNumber ? `${sectionNumber}. ${title.toUpperCase()}` : title.toUpperCase();
  return new Paragraph({
    text: displayText,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 140 },
    border: {
      bottom: {
        color: COLOR_PRIMARY,
        space: 4,
        style: BorderStyle.SINGLE,
        size: 12
      }
    }
  });
}

function createSubHeading(title: string): Paragraph {
  return new Paragraph({
    text: title,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 }
  });
}

function createParagraph(text: string, options?: { italic?: boolean; bold?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }): Paragraph {
  return new Paragraph({
    alignment: options?.align || AlignmentType.LEFT,
    spacing: { after: 140, line: 276 },
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
  align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT
): TableCell {
  const children = typeof content === 'string'
    ? [new Paragraph({
        alignment: align,
        children: [new TextRun({
          text: content,
          bold: isHeader,
          size: 20, // 10pt
          color: isHeader ? COLOR_SECONDARY : '333333'
        })]
      })]
    : content;

  return new TableCell({
    width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: isHeader ? { fill: COLOR_BG_HEADER, type: ShadingType.CLEAR } : undefined,
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
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
  // FINANCIAL SECTION: Costing & Unit Pricing Structure
  // =========================================================================
  docChildren.push(
    createSectionHeading('Product Costing & Interactive Unit Pricing', String(sectionIndex++)),
    createParagraph('The following pricing model establishes the cost of goods sold (COGS), labor allocation, overhead sharing, and calculated retail selling price per unit based on commercial accounting principles:')
  );

  // Quoted Raw Materials Table
  const productionItems = sd.productionItems || [];
  if (productionItems.length > 0) {
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

    productionItems.forEach(item => {
      itemRows.push(
        new TableRow({
          children: [
            createTableCell(item.name || 'Component'),
            createTableCell(item.description || item.supplier || '-'),
            createTableCell(String(item.quantity || 1), false, undefined, AlignmentType.RIGHT),
            createTableCell(`$${(item.unitCost || item.cost || 0).toFixed(2)}`, false, undefined, AlignmentType.RIGHT),
            createTableCell(`$${(item.cost || 0).toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
          ]
        })
      );
    });

    const totalBatchCost = productionItems.reduce((s, it) => s + (it.cost || 0), 0);
    itemRows.push(
      new TableRow({
        children: [
          createTableCell('Total Material Inputs (Batch Yield)', true, 70),
          createTableCell('', true, 0),
          createTableCell('', true, 0),
          createTableCell('', true, 0),
          createTableCell(`$${totalBatchCost.toFixed(2)}`, true, 30, AlignmentType.RIGHT)
        ]
      })
    );

    docChildren.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: itemRows
    }), new Paragraph({ spacing: { after: 180 } }));
  }

  // Unit Economics Receipt Table
  const unitBreakdownRows: TableRow[] = [
    new TableRow({
      children: [
        createTableCell('Unit Pricing Parameter', true, 60),
        createTableCell('Value / Unit Impact', true, 40, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Raw Material Cost per Unit'),
        createTableCell(`$${calc.materialsCostPerUnit.toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    ...(calc.contingencyPercent > 0 ? [
      new TableRow({
        children: [
          createTableCell(`Material Contingency Buffer (${calc.contingencyPercent}%)`),
          createTableCell(`+$${((calc.materialsCostPerUnit * calc.contingencyPercent) / 100).toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
        ]
      })
    ] : []),
    new TableRow({
      children: [
        createTableCell('Direct Labor Cost per Unit'),
        createTableCell(`+$${calc.laborCostPerUnit.toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    ...(calc.allocatedOverheadPerUnit > 0 ? [
      new TableRow({
        children: [
          createTableCell('Allocated Fixed Monthly Overhead per Unit'),
          createTableCell(`+$${calc.allocatedOverheadPerUnit.toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
        ]
      })
    ] : []),
    new TableRow({
      children: [
        createTableCell('Calculated Cost of Goods Sold (COGS)', true),
        createTableCell(`$${calc.costOfGoodsSoldUnit.toFixed(2)}`, true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell(`Target Unit Profit Markup (${calc.markupPercent}%)`),
        createTableCell(`+$${calc.calculatedProfitPerUnit.toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Determined Pre-Tax Retail Price', true),
        createTableCell(`$${calc.preTaxSellingPrice.toFixed(2)}`, true, undefined, AlignmentType.RIGHT)
      ]
    }),
    ...(calc.includeLevy ? [
      new TableRow({
        children: [
          createTableCell('Health & Safety Legal Levy (2.5%)'),
          createTableCell(`+$${calc.levyCost.toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
        ]
      })
    ] : []),
    ...(calc.includeVat ? [
      new TableRow({
        children: [
          createTableCell('Value Added Tax (VAT 12.5%)'),
          createTableCell(`+$${calc.vatCost.toFixed(2)}`, false, undefined, AlignmentType.RIGHT)
        ]
      })
    ] : []),
    new TableRow({
      children: [
        createTableCell('FINAL INVOICE / SALE PRICE', true),
        createTableCell(`$${calc.finalSuggestedPrice.toFixed(2)}`, true, undefined, AlignmentType.RIGHT)
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
    createParagraph('The following schedule outlines recurring fixed overhead expenditures required to maintain business continuity:')
  );

  const monthlyTotalOpEx = (sd.rent || 0) + (sd.salaries || 0) + (sd.marketing || 0) + (sd.utilities || 0) + (sd.otherExpenses || 0);
  const opexRows: TableRow[] = [
    new TableRow({
      children: [
        createTableCell('Operating Expense Category', true, 60),
        createTableCell('Monthly Allocation', true, 20, AlignmentType.RIGHT),
        createTableCell('Annualized Budget', true, 20, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Rent / Facilities / Workspace'),
        createTableCell(`$${(sd.rent || 0).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${((sd.rent || 0) * 12).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Direct Staff Salaries & Payroll'),
        createTableCell(`$${(sd.salaries || 0).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${((sd.salaries || 0) * 12).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Marketing, Client Acquisition & PR'),
        createTableCell(`$${(sd.marketing || 0).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${((sd.marketing || 0) * 12).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Utilities, Power & Technology Infrastructure'),
        createTableCell(`$${(sd.utilities || 0).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${((sd.utilities || 0) * 12).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Administrative, Legal & Miscellaneous Contingency'),
        createTableCell(`$${(sd.otherExpenses || 0).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${((sd.otherExpenses || 0) * 12).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('TOTAL FIXED OPERATING OVERHEAD', true),
        createTableCell(`$${monthlyTotalOpEx.toLocaleString()}`, true, undefined, AlignmentType.RIGHT),
        createTableCell(`$${(monthlyTotalOpEx * 12).toLocaleString()}`, true, undefined, AlignmentType.RIGHT)
      ]
    })
  ];

  docChildren.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: opexRows
  }), new Paragraph({ spacing: { after: 240 } }));

  // Multi-Year P&L Statement
  docChildren.push(
    createSubHeading('Multi-Year Profit & Loss Projections (Commercial Credit Evaluation)'),
    createParagraph('Prepared under standard commercial bank criteria modeling 5-year growth trajectory:')
  );

  const pnlRows: TableRow[] = [
    new TableRow({
      children: [
        createTableCell('Profit & Loss Statement Line', true, 40),
        createTableCell('Year 1', true, 20, AlignmentType.RIGHT),
        createTableCell(`Year 3 (+${sd.growthRateYear3 || 50}% Vol)`, true, 20, AlignmentType.RIGHT),
        createTableCell(`Year 5 (+${sd.growthRateYear5 || 100}% Vol)`, true, 20, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Gross Revenue (Unit Sales x Price)', true),
        createTableCell(`$${Math.round(calc.y1Rev).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y3Rev).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y5Rev).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Cost of Goods Sold (COGS)'),
        createTableCell(`$${Math.round(calc.y1COGS).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y3COGS).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y5COGS).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Gross Profit Margin', true),
        createTableCell(`$${Math.round(calc.y1Gross).toLocaleString()}`, true, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y3Gross).toLocaleString()}`, true, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y5Gross).toLocaleString()}`, true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Operating Expenses (Fixed & Variable)'),
        createTableCell(`$${Math.round(calc.y1OpEx).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y3OpEx).toLocaleString()}`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y5OpEx).toLocaleString()}`, false, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Net Operating Profit (EBIT)', true),
        createTableCell(`$${Math.round(calc.y1Net).toLocaleString()}`, true, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y3Net).toLocaleString()}`, true, undefined, AlignmentType.RIGHT),
        createTableCell(`$${Math.round(calc.y5Net).toLocaleString()}`, true, undefined, AlignmentType.RIGHT)
      ]
    }),
    new TableRow({
      children: [
        createTableCell('Operating Margin %'),
        createTableCell(`${calc.netMarginPercent}%`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`${calc.y3Rev > 0 ? Math.round((calc.y3Net / calc.y3Rev) * 100) : 0}%`, false, undefined, AlignmentType.RIGHT),
        createTableCell(`${calc.y5Rev > 0 ? Math.round((calc.y5Net / calc.y5Rev) * 100) : 0}%`, false, undefined, AlignmentType.RIGHT)
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
