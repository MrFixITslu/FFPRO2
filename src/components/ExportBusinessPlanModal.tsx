import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Sparkles,
  X,
  Check,
  Building,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Landmark,
  Eye,
  Loader2,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Layers,
  ChevronRight
} from 'lucide-react';
import { BudgetEvent, BusinessPlanSections } from '../types';
import { generateBusinessPlanDocx, BusinessPlanCalculations } from '../services/businessPlanExportService';
import { triggerSecureDownload } from '../services/fileStorageService';
import { buildBusinessPlanPresentation } from '../services/businessPlanPresentationService';
import { formatBusinessPlanMarkdownToHtml } from '../utils/businessPlanRichText';
import { validateBusinessPlan } from '../services/businessPlanValidationService';

interface ExportBusinessPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEvent: BudgetEvent;
  calculations: BusinessPlanCalculations;
  currentUser: string;
  onUpdateBusinessPlanMeta: (meta: Partial<BusinessPlanSections>) => void;
  onExportPnlToDocuments?: () => Promise<void>;
}

export const ExportBusinessPlanModal: React.FC<ExportBusinessPlanModalProps> = ({
  isOpen,
  onClose,
  selectedEvent,
  calculations,
  currentUser,
  onUpdateBusinessPlanMeta,
  onExportPnlToDocuments
}) => {
  if (!isOpen || !selectedEvent) return null;

  const sd = selectedEvent?.startupDetails || {};
  const bp: BusinessPlanSections = sd?.businessPlan || {};

  const [companyName, setCompanyName] = useState<string>(bp.companyName || selectedEvent?.name || '');
  const [preparedBy, setPreparedBy] = useState<string>(bp.preparedBy || currentUser || 'Project Executive');
  const [fundingAgency, setFundingAgency] = useState<string>(bp.fundingAgencyOrBank || 'Commercial Lending & Development Agency');
  const [contactEmail, setContactEmail] = useState<string>(bp.contactEmail || '');
  const [contactPhone, setContactPhone] = useState<string>(bp.contactPhone || '');
  const [businessAddress, setBusinessAddress] = useState<string>(bp.businessAddress || '');
  const [preparedDate, setPreparedDate] = useState<string>(
    bp.preparedDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  );

  const [activeTab, setActiveTab] = useState<'options' | 'preview'>('options');
  const [isGeneratingDocx, setIsGeneratingDocx] = useState<boolean>(false);
  const [isExportingPnl, setIsExportingPnl] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Presentation & Validation Models
  const presentation = buildBusinessPlanPresentation(sd, calculations);
  const validation = validateBusinessPlan(sd, calculations);

  const handleSaveMeta = () => {
    onUpdateBusinessPlanMeta({
      companyName,
      preparedBy,
      fundingAgencyOrBank: fundingAgency,
      contactEmail,
      contactPhone,
      businessAddress,
      preparedDate
    });
  };

  const handleDownloadDocx = async () => {
    setIsGeneratingDocx(true);
    setSuccessMessage(null);
    try {
      handleSaveMeta();
      const currentStartupDetails = selectedEvent.startupDetails || {
        cogs: 0,
        markup: 0,
        monthlyVolume: 0,
        rent: 0,
        salaries: 0,
        marketing: 0,
        utilities: 0,
        otherExpenses: 0,
        growthRateYear3: 15,
        growthRateYear5: 35
      };

      const updatedEvent: BudgetEvent = {
        ...selectedEvent,
        startupDetails: {
          ...currentStartupDetails,
          businessPlan: {
            ...(currentStartupDetails.businessPlan || {}),
            companyName,
            preparedBy,
            fundingAgencyOrBank: fundingAgency,
            contactEmail,
            contactPhone,
            businessAddress,
            preparedDate
          }
        }
      };

      const blob = await generateBusinessPlanDocx(updatedEvent, calculations);
      const safeName = (companyName || selectedEvent.name).replace(/[/\\?%*:|"<>]/g, '-').trim();
      const filename = `${safeName} - Business Plan.docx`;
      
      triggerSecureDownload(blob, filename);
      setSuccessMessage(`Successfully generated editable Word document: "${filename}"`);
    } catch (err: any) {
      console.error('Failed to generate DOCX:', err);
      alert(`Error generating DOCX: ${err.message || err}`);
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const handlePrintPdf = () => {
    handleSaveMeta();
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to open the print preview.');
      return;
    }

    const title = `${companyName} - Commercial Business Plan & Funding Proposal`;

    // Dynamic sequential section numbering (only non-empty sections get numbered)
    const sectionList: Array<{ title: string; html: string }> = [];

    const addSectionHtml = (title: string, markdownText?: string) => {
      if (!markdownText || !markdownText.trim()) return;
      const htmlContent = formatBusinessPlanMarkdownToHtml(markdownText);
      if (htmlContent) {
        sectionList.push({ title, html: htmlContent });
      }
    };

    addSectionHtml('Executive Summary', bp.executiveSummary);
    addSectionHtml('Business Description & Vision', bp.businessDescription);
    addSectionHtml('Strategic Business Objectives', bp.businessObjectives);
    addSectionHtml('Problem Statement & Market Opportunity', bp.problemOpportunity);
    addSectionHtml('Products, Services & Value Proposition', bp.productsServices);
    addSectionHtml('Target Market Analysis', bp.targetMarket);
    addSectionHtml('Customer Profile & Segmentation', bp.customerProfile);
    addSectionHtml('Industry & Market Dynamics', bp.marketAnalysis);
    addSectionHtml('Competitor Analysis & Market Positioning', bp.competitorAnalysis);
    addSectionHtml('Sustainable Competitive Advantage', bp.competitiveAdvantage);
    addSectionHtml('Core Business Model', bp.businessModel);
    addSectionHtml('Revenue Model & Monetization Structure', bp.revenueModel);
    addSectionHtml('Marketing & Sales Strategy', bp.marketingSalesStrategy);
    addSectionHtml('Operations & Service Delivery Plan', bp.operationsPlan);
    addSectionHtml('Equipment, Technology & Fleet Requirements', bp.equipmentTechRequirements);
    addSectionHtml('Suppliers, Vendors & Procurement Chain', bp.suppliers);
    addSectionHtml('Management Team & Staffing Structure', bp.managementStaffing);
    addSectionHtml('Startup Capitalization Requirements', bp.startupRequirements);
    addSectionHtml('Financial Requirements & Assumptions', bp.financialRequirements);
    addSectionHtml('Sales & Revenue Projections Notes', bp.salesRevenueProjectionsNotes);
    addSectionHtml('Operating Cost Structure Notes', bp.operatingCostsNotes);
    addSectionHtml('Funding Request & Commercial Terms', bp.fundingRequirements);
    addSectionHtml('Use of Proceeds & Capital Allocation', bp.useOfFunds);
    addSectionHtml('Implementation Roadmap & Timelines', bp.implementationPlan);
    addSectionHtml('Critical Milestones & Success Metrics', bp.milestonesNotes);
    addSectionHtml('Risk Analysis & Mitigation Strategies', bp.risksMitigation);
    addSectionHtml('Conclusion & Summary Endorsement', bp.conclusion);

    // Build dynamic numbered sections HTML
    let sectionCounter = 1;
    const renderedSectionsHtml = sectionList.map(sec => {
      const num = sectionCounter++;
      return `
        <div class="narrative-section">
          <h2 class="section-title">${num}. ${sec.title}</h2>
          <div class="narrative-content">${sec.html}</div>
        </div>
      `;
    }).join('\n');

    const docHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap');
          
          * { box-sizing: border-box; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #1e293b;
            line-height: 1.6;
            margin: 0;
            padding: 24px 40px;
            background: #ffffff;
            font-size: 13px;
          }

          .no-print-bar {
            background: #0f172a;
            color: #f8fafc;
            padding: 14px 24px;
            margin: -24px -40px 32px -40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #0d9488;
          }

          .print-btn {
            background: #0d9488;
            color: #ffffff;
            border: none;
            padding: 8px 18px;
            border-radius: 8px;
            font-weight: 700;
            cursor: pointer;
            font-size: 12px;
          }
          .print-btn:hover { background: #0f766e; }

          /* Cover Page */
          .cover {
            min-height: 88vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            text-align: center;
            padding: 40px 20px 20px 20px;
            page-break-after: always;
            break-after: page;
          }

          .cover-badge {
            display: inline-block;
            background: #0d9488;
            color: white;
            font-size: 11px;
            font-weight: 800;
            padding: 5px 14px;
            border-radius: 9999px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-bottom: 24px;
          }

          h1 {
            font-family: 'Playfair Display', serif;
            font-size: 34px;
            font-weight: 700;
            color: #0f2942;
            margin: 0 0 10px 0;
            letter-spacing: -0.5px;
          }

          h2.cover-subtitle {
            font-size: 16px;
            font-weight: 600;
            color: #475569;
            margin: 0 0 28px 0;
          }

          .cover-divider {
            width: 90px;
            height: 3px;
            background: #0d9488;
            margin: 0 auto 36px auto;
          }

          .meta-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px;
            max-width: 560px;
            margin: 0 auto;
            text-align: left;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            border-bottom: 1px solid #f1f5f9;
            font-size: 12px;
          }
          .meta-row:last-child { border-bottom: none; }
          .meta-label { font-weight: 600; color: #64748b; }
          .meta-val { font-weight: 700; color: #0f172a; text-align: right; }

          .confidential-pill {
            margin-top: 32px;
            font-size: 10px;
            color: #b91c1c;
            font-weight: 800;
            letter-spacing: 1.5px;
            text-transform: uppercase;
          }

          /* Executive KPI Cards */
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin: 24px 0 32px 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .kpi-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 14px;
            text-align: center;
          }
          .kpi-card.highlight {
            background: #f0fdfa;
            border-color: #99f6e4;
          }
          .kpi-title {
            font-size: 10px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
          }
          .kpi-val {
            font-size: 19px;
            font-weight: 800;
            color: #0f2942;
            line-height: 1.2;
          }
          .kpi-card.highlight .kpi-val {
            color: #0d9488;
          }
          .kpi-sub {
            font-size: 10px;
            color: #64748b;
            margin-top: 4px;
            font-weight: 600;
          }

          /* Headings */
          h2.section-title {
            font-size: 14px;
            font-weight: 800;
            color: #0f2942;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            border-bottom: 2px solid #0d9488;
            padding-bottom: 5px;
            margin: 32px 0 14px 0;
            page-break-after: avoid;
            break-after: avoid;
          }
          h3.sub-title {
            font-size: 13px;
            font-weight: 700;
            color: #334155;
            margin: 18px 0 8px 0;
            page-break-after: avoid;
          }
          .narrative-section {
            margin-bottom: 20px;
          }
          .narrative-content p {
            margin: 0 0 12px 0;
            text-align: justify;
            color: #334155;
            line-height: 1.65;
          }

          /* Tables */
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 14px 0 22px 0;
            font-size: 12px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 7px 10px;
            text-align: left;
            font-variant-numeric: tabular-nums;
          }
          th {
            background: #f1f5f9;
            color: #0f2942;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
          }
          tr:nth-child(even) td {
            background: #f8fafc;
          }
          .text-right { text-align: right; }
          .bold { font-weight: 700; color: #0f172a; }
          .highlight-row td {
            background: #f0fdfa !important;
            font-weight: 700;
            color: #0f766e;
          }
          .total-double-line td {
            border-bottom: 3px double #0f2942;
            font-weight: 800;
          }

          /* Signature Block */
          .sign-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin: 40px 0 20px 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .sign-col {
            border-top: 1px solid #cbd5e1;
            padding-top: 12px;
          }
          .sign-name { font-size: 13px; font-weight: 700; color: #0f2942; }
          .sign-role { font-size: 11px; color: #64748b; }
          .sign-date { font-size: 11px; color: #94a3b8; margin-top: 4px; }

          @media print {
            @page {
              size: A4 portrait;
              margin: 15mm 15mm 15mm 15mm;
            }
            body { padding: 0; margin: 0; max-width: 100%; font-size: 11pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print-bar { display: none !important; }
            .narrative-content p { text-align: left; word-spacing: normal; }
            .page-break { page-break-after: always; break-after: page; }
            table, tr, .kpi-grid, .kpi-card, .meta-box, .sign-grid, .narrative-section { page-break-inside: avoid; break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div style="text-align: left;">
            <div style="font-weight: 800; font-size: 14px;">Commercial Print & PDF Ready</div>
            <div style="font-size: 11px; color: #94a3b8;">Choose "Save as PDF" in destination printer to export clean high-resolution document</div>
          </div>
          <button class="print-btn" onclick="window.print()">
            🖨️ Print / Save as PDF
          </button>
        </div>

        <div class="cover">
          <div>
            <div class="cover-badge">Commercial Funding Proposal</div>
            <h1>${companyName}</h1>
            <h2 class="cover-subtitle">Comprehensive Business Plan & Financial Projections</h2>
            <div class="cover-divider"></div>
          </div>

          <div class="meta-box">
            <div class="meta-row">
              <span class="meta-label">Target Financial Institution:</span>
              <span class="meta-val">${fundingAgency}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Prepared & Endorsed By:</span>
              <span class="meta-val">${preparedBy}</span>
            </div>
            ${contactEmail || contactPhone ? `
            <div class="meta-row">
              <span class="meta-label">Official Contact:</span>
              <span class="meta-val">${[contactEmail, contactPhone].filter(Boolean).join(' • ')}</span>
            </div>` : ''}
            ${businessAddress ? `
            <div class="meta-row">
              <span class="meta-label">Commercial Location:</span>
              <span class="meta-val">${businessAddress}</span>
            </div>` : ''}
            <div class="meta-row">
              <span class="meta-label">Date of Submission:</span>
              <span class="meta-val">${preparedDate}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Operating Currency:</span>
              <span class="meta-val" style="color:#0d9488;">${presentation.currencyCode} (${presentation.currencySymbol})</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Document Classification:</span>
              <span class="meta-val" style="color:#0d9488;">Credit Committee Appraisal</span>
            </div>
          </div>

          <div class="confidential-pill">
            STRICTLY CONFIDENTIAL • PROPRIETARY FINANCIAL APPRAISAL
          </div>
        </div>

        <!-- Executive Financial Highlights -->
        <div class="kpi-grid">
          <div class="kpi-card highlight">
            <div class="kpi-title">${presentation.headline.primaryMetricLabel}</div>
            <div class="kpi-val">${presentation.headline.primaryPriceFormatted}</div>
            <div class="kpi-sub">${presentation.headline.volumeMetricLabel}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">${presentation.headline.primaryCostLabel}</div>
            <div class="kpi-val">${presentation.headline.primaryCostFormatted}</div>
            <div class="kpi-sub">${presentation.headline.marginMetricPercent}% ${presentation.isServiceBusiness ? 'Contribution Margin' : 'Gross Margin'}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Year 1 Revenue</div>
            <div class="kpi-val">${presentation.year1.revenueFormatted}</div>
            <div class="kpi-sub">${presentation.headline.volumeYear1.toLocaleString()} Projected Units</div>
          </div>
          <div class="kpi-card highlight">
            <div class="kpi-title">Year 1 Operating Profit (EBITDA)</div>
            <div class="kpi-val">${presentation.year1.ebitdaFormatted}</div>
            <div class="kpi-sub">${presentation.year1.revenue > 0 ? Math.round((presentation.year1.ebitda / presentation.year1.revenue) * 100) : 0}% EBITDA Margin</div>
          </div>
        </div>

        <!-- Dynamic Narrative Sections -->
        ${renderedSectionsHtml}

        <!-- Revenue Streams & Commercial Economics -->
        ${presentation.isServiceBusiness && presentation.revenueStreams.length > 0 ? `
          <h2 class="section-title">Service Offerings & Revenue Model Structure</h2>
          <p>The operational service matrix establishes pricing tiers, booking units, and direct variable margins:</p>
          <table>
            <thead>
              <tr>
                <th>Service Offering</th>
                <th>Revenue Model</th>
                <th>Unit Type</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Monthly Vol</th>
                <th class="text-right">Monthly Rev</th>
                <th class="text-right">Direct Cost</th>
                <th class="text-right">Contribution Margin</th>
              </tr>
            </thead>
            <tbody>
              ${presentation.revenueStreams.map(s => `
                <tr>
                  <td class="bold">${s.name}</td>
                  <td><span style="text-transform: capitalize;">${s.revenueModel}</span></td>
                  <td>${s.unitLabel}</td>
                  <td class="text-right">${s.rateFormatted}</td>
                  <td class="text-right">${s.monthlyVolume}</td>
                  <td class="text-right bold">${s.monthlyRevenueFormatted}</td>
                  <td class="text-right">${s.directCostPerUnitFormatted}</td>
                  <td class="text-right" style="color: #0f766e; font-weight: 700;">${s.contributionMarginFormatted} (${s.contributionMarginPercent}%)</td>
                </tr>
              `).join('')}
              <tr class="highlight-row total-double-line">
                <td colspan="5">TOTAL MONTHLY SERVICE GENERATION</td>
                <td class="text-right">${presentation.totalMonthlyRevenueFormatted}</td>
                <td class="text-right">${presentation.totalMonthlyDirectCostsFormatted}</td>
                <td class="text-right">${presentation.totalMonthlyGrossProfitFormatted} (${presentation.blendedGrossMarginPercent}%)</td>
              </tr>
            </tbody>
          </table>
        ` : `
          <h2 class="section-title">Unit Costing & Price Determination</h2>
          <p>The unit economic architecture below specifies all direct material inputs, labor calculations, overhead allocations, and statutory considerations:</p>
          <table>
            <thead>
              <tr><th>Unit Pricing Parameter</th><th class="text-right">Unit Impact (${presentation.currencySymbol})</th></tr>
            </thead>
            <tbody>
              <tr><td>Raw Materials Cost per Unit</td><td class="text-right">${presentation.currencySymbol}${calculations.materialsCostPerUnit.toFixed(2)}</td></tr>
              ${calculations.contingencyPercent > 0 ? `<tr><td>Raw Material Contingency Buffer (${calculations.contingencyPercent}%)</td><td class="text-right">+${presentation.currencySymbol}${((calculations.materialsCostPerUnit * calculations.contingencyPercent) / 100).toFixed(2)}</td></tr>` : ''}
              <tr><td>Direct Production Labor per Unit</td><td class="text-right">+${presentation.currencySymbol}${calculations.laborCostPerUnit.toFixed(2)}</td></tr>
              ${calculations.allocatedOverheadPerUnit > 0 ? `<tr><td>Allocated Monthly Overhead per Unit</td><td class="text-right">+${presentation.currencySymbol}${calculations.allocatedOverheadPerUnit.toFixed(2)}</td></tr>` : ''}
              <tr class="bold"><td>Calculated Cost of Goods Sold (COGS)</td><td class="text-right">${presentation.currencySymbol}${calculations.costOfGoodsSoldUnit.toFixed(2)}</td></tr>
              <tr><td>Profit Markup Margin (${calculations.markupPercent}%)</td><td class="text-right">+${presentation.currencySymbol}${calculations.calculatedProfitPerUnit.toFixed(2)}</td></tr>
              <tr class="bold"><td>Pre-Tax Wholesale Selling Price</td><td class="text-right">${presentation.currencySymbol}${calculations.preTaxSellingPrice.toFixed(2)}</td></tr>
              ${calculations.includeLevy ? `<tr><td>Health & Environmental Levy (2.5%)</td><td class="text-right">+${presentation.currencySymbol}${calculations.levyCost.toFixed(2)}</td></tr>` : ''}
              ${calculations.includeVat ? `<tr><td>Value Added Tax (VAT 12.5%)</td><td class="text-right">+${presentation.currencySymbol}${calculations.vatCost.toFixed(2)}</td></tr>` : ''}
              <tr class="highlight-row total-double-line"><td>DETERMINED COMMERCIAL SELLING PRICE</td><td class="text-right">${presentation.currencySymbol}${calculations.finalSuggestedPrice.toFixed(2)}</td></tr>
            </tbody>
          </table>
        `}

        <!-- Operating Expenses Breakdown -->
        <h2 class="section-title">Monthly Operating Overhead Structure</h2>
        <p>Fixed monthly operational commitments required for baseline continuous capacity:</p>
        <table>
          <thead>
            <tr>
              <th>Overhead Expenditure Category</th>
              <th class="text-right">Monthly Amount</th>
              <th class="text-right">Annualized Budget</th>
            </tr>
          </thead>
          <tbody>
            ${presentation.operatingExpensesBreakdown.map(o => `
              <tr>
                <td>${o.name}</td>
                <td class="text-right">${o.formatted}</td>
                <td class="text-right">${presentation.currencySymbol}${(o.amount * 12).toLocaleString()}</td>
              </tr>
            `).join('')}
            <tr class="highlight-row total-double-line">
              <td>TOTAL FIXED OPERATING OVERHEAD (OpEx)</td>
              <td class="text-right">${presentation.operatingExpensesMonthlyFormatted}</td>
              <td class="text-right">${presentation.operatingExpensesYear1Formatted}</td>
            </tr>
          </tbody>
        </table>

        <!-- Multi-Year Statement of Comprehensive Income -->
        <h2 class="section-title">Multi-Year Statement of Comprehensive Income</h2>
        <p>Projections grounded in audited operational unit economics scaled across 5 years:</p>
        <table>
          <thead>
            <tr>
              <th>Financial Statement Metric</th>
              <th class="text-right">Year 1</th>
              <th class="text-right">Year 3</th>
              <th class="text-right">Year 5</th>
            </tr>
          </thead>
          <tbody>
            <tr class="bold">
              <td>Gross Operating Revenue</td>
              <td class="text-right">${presentation.year1.revenueFormatted}</td>
              <td class="text-right">${presentation.year3.revenueFormatted}</td>
              <td class="text-right">${presentation.year5.revenueFormatted}</td>
            </tr>
            <tr>
              <td>${presentation.isServiceBusiness ? 'Direct Variable Service Costs' : 'Cost of Goods Sold (COGS)'}</td>
              <td class="text-right">${presentation.year1.cogsFormatted}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(calculations.y3COGS).toLocaleString()}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(calculations.y5COGS).toLocaleString()}</td>
            </tr>
            <tr class="bold">
              <td>Gross Profit / Contribution Margin</td>
              <td class="text-right">${presentation.year1.grossProfitFormatted}</td>
              <td class="text-right">${presentation.year3.grossProfitFormatted}</td>
              <td class="text-right">${presentation.year5.grossProfitFormatted}</td>
            </tr>
            <tr>
              <td>Fixed Operating Expenses (OpEx)</td>
              <td class="text-right">${presentation.year1.operatingExpensesFormatted}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(calculations.y3OpEx).toLocaleString()}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(calculations.y5OpEx).toLocaleString()}</td>
            </tr>
            <tr class="highlight-row">
              <td>Operating Profit (EBITDA)</td>
              <td class="text-right">${presentation.year1.ebitdaFormatted}</td>
              <td class="text-right">${presentation.year3.netProfitFormatted}</td>
              <td class="text-right">${presentation.year5.netProfitFormatted}</td>
            </tr>
            <tr>
              <td>Equipment Depreciation</td>
              <td class="text-right">${presentation.year1.depreciationFormatted}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(presentation.year1.depreciation).toLocaleString()}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(presentation.year1.depreciation).toLocaleString()}</td>
            </tr>
            <tr class="bold">
              <td>Net Operating Profit (EBIT)</td>
              <td class="text-right">${presentation.year1.ebitFormatted}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(calculations.y3Net - presentation.year1.depreciation).toLocaleString()}</td>
              <td class="text-right">${presentation.currencySymbol}${Math.round(calculations.y5Net - presentation.year1.depreciation).toLocaleString()}</td>
            </tr>
            ${presentation.year1.interest > 0 ? `
            <tr>
              <td>Loan Interest Expense</td>
              <td class="text-right">(${presentation.year1.interestFormatted})</td>
              <td class="text-right">-</td>
              <td class="text-right">-</td>
            </tr>
            <tr class="bold">
              <td>Profit Before Tax (EBT)</td>
              <td class="text-right">${presentation.year1.profitBeforeTaxFormatted}</td>
              <td class="text-right">-</td>
              <td class="text-right">-</td>
            </tr>` : ''}
            <tr class="bold total-double-line">
              <td>Net Profit / Bottom Line</td>
              <td class="text-right">${presentation.year1.netProfitFormatted}</td>
              <td class="text-right">${presentation.year3.netProfitFormatted}</td>
              <td class="text-right">${presentation.year5.netProfitFormatted}</td>
            </tr>
          </tbody>
        </table>

        <!-- Break-Even Analysis Summary -->
        <h2 class="section-title">Break-Even Operational Thresholds</h2>
        <p>Minimum monthly volume required to fully cover all operating overhead:</p>
        <table>
          <thead>
            <tr><th>Metric</th><th class="text-right">Threshold Requirement</th></tr>
          </thead>
          <tbody>
            <tr><td>Monthly Operating Overhead to Cover</td><td class="text-right">${presentation.operatingExpensesMonthlyFormatted}</td></tr>
            <tr><td>Average Contribution Margin Ratio</td><td class="text-right">${presentation.breakEven.contributionMarginPercent}%</td></tr>
            <tr class="bold"><td>Monthly Break-Even Revenue</td><td class="text-right">${presentation.breakEven.monthlyRevenueFormatted}</td></tr>
            <tr class="highlight-row total-double-line"><td>Monthly Break-Even Volume</td><td class="text-right">${presentation.breakEven.monthlyUnits} ${presentation.breakEven.metricLabel}</td></tr>
          </tbody>
        </table>

        <!-- Loan Amortization Section -->
        ${presentation.loan ? `
          <h2 class="section-title">Bank Debt Financing & Amortization Schedule</h2>
          <p><strong>Facility Principal:</strong> ${presentation.currencyCode} ${presentation.loan.principalFormatted} @ ${presentation.loan.annualInterestRate}% p.a. (${presentation.loan.termYears}-Year Term, ${presentation.loan.paymentFrequency} repayments)</p>
          <p>
            <strong>Upfront Fees:</strong> Negotiation Fee ${presentation.loan.negotiationFeeFormatted} + Insurance ${presentation.loan.insuranceFeeFormatted} = ${presentation.loan.totalFeesFormatted} (${presentation.loan.includeFeesInLoan ? 'Financed in Opening Balance' : 'Out-of-Pocket Cash Payment'}).<br/>
            <strong>Opening Loan Balance:</strong> ${presentation.loan.openingBalanceFormatted} | 
            <strong>Monthly Debt Service:</strong> ${presentation.loan.monthlyDebtServiceFormatted} | 
            <strong>Annual Debt Service:</strong> ${presentation.loan.annualDebtServiceFormatted}
            ${presentation.loan.gracePeriodMonths ? `<br/><strong>Grace Period (Moratorium):</strong> ${presentation.loan.gracePeriodMonths} Month(s) (${presentation.loan.gracePeriodType === 'full_defer' ? 'Full Interest & Principal Deferral' : 'Interest-Only Servicing'}) | <strong>Repayment Start:</strong> ${presentation.loan.firstPaymentDate || 'Month 1'}` : ''}
          </p>
          <p>
            <strong>Debt Service Coverage Ratio (DSCR):</strong> ${presentation.loan.dscrYear1 > 50 ? 'N/A' : presentation.loan.dscrYear1.toFixed(2) + 'x'} 
            (${presentation.loan.dscrStatus.toUpperCase()}) — <em>Basis: Year 1 EBITDA / Year 1 Debt Service</em>.
          </p>
        ` : ''}

        <!-- Formal Authorization Signatures -->
        <h2 class="section-title">Commercial Execution & Endorsement</h2>
        <p>The undersigned authorized officers certify the operational veracity and financial calculations presented in this proposal:</p>
        <div class="sign-grid">
          <div class="sign-col">
            <div class="sign-name">${preparedBy}</div>
            <div class="sign-role">Principal Executive / Managing Director</div>
            <div class="sign-date">Date: ${preparedDate}</div>
          </div>
          <div class="sign-col">
            <div class="sign-name">Authorized Lending Representative</div>
            <div class="sign-role">${fundingAgency}</div>
            <div class="sign-date">Date: ________________________</div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(docHtml);
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
    printWindow.document.close();
  };

  const handleExportPnl = async () => {
    if (!onExportPnlToDocuments) return;
    setIsExportingPnl(true);
    setSuccessMessage(null);
    try {
      await onExportPnlToDocuments();
      setSuccessMessage('Successfully exported Multi-Year P&L Statement to Project Documents (.fdoc).');
    } catch (err: any) {
      alert(`Export error: ${err.message || err}`);
    } finally {
      setIsExportingPnl(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-stone-150 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Download size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900">
                  Export Business Plan
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  validation.status === 'bank_ready'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : validation.status === 'ready_for_financial_review'
                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                    : validation.status === 'needs_review'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-stone-100 text-stone-600 border border-stone-300'
                }`}>
                  {validation.statusLabel} ({validation.completionPercent}%)
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Generate an editable Microsoft Word (.docx) document or print-optimized PDF with live unit costing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-stone-200 text-stone-400 hover:text-stone-700 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* View Switcher */}
        <div className="px-5 pt-3 border-b border-stone-200 bg-white flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('options')}
            className={`pb-2.5 px-3 font-bold border-b-2 transition-colors ${
              activeTab === 'options'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Export Options & Document Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`pb-2.5 px-3 font-bold border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Financial Summary Preview
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <Check size={16} className="text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Validation Warnings / Feedback if any */}
          {validation.issues.length > 0 && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <AlertCircle size={15} className="text-amber-600" />
                <span>Plan Review Feedback ({validation.issues.length} Checkpoints)</span>
              </div>
              <ul className="text-xs text-amber-800 space-y-1 pl-5 list-disc">
                {validation.issues.slice(0, 3).map((issue) => (
                  <li key={issue.id}>
                    <strong>{issue.title}:</strong> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'options' ? (
            <div className="space-y-5">
              {/* Export Format Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Word Export Card */}
                <div className="p-4 border-2 border-emerald-500/40 bg-emerald-50/20 rounded-2xl space-y-2.5 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
                        W
                      </span>
                      <h4 className="text-xs font-bold text-stone-900">Microsoft Word (.docx)</h4>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Fully formatted master document with Cover Page, Table of Contents, complete narrative sections, and commercial tables.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadDocx}
                    disabled={isGeneratingDocx}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isGeneratingDocx ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Generating DOCX...
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        Export Editable DOCX
                      </>
                    )}
                  </button>
                </div>

                {/* PDF Print Card */}
                <div className="p-4 border border-stone-200 bg-stone-50/50 rounded-2xl space-y-2.5 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-rose-600 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
                        PDF
                      </span>
                      <h4 className="text-xs font-bold text-stone-900">Print / Save as PDF</h4>
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Print-optimized preview designed for clean browser printing or saving as high-resolution PDF.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintPdf}
                    className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Printer size={14} />
                    Print / Export PDF
                  </button>
                </div>
              </div>

              {/* Document Cover Details */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Building size={14} /> Cover Page & Submission Metadata
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Company / Business Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded font-semibold text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Prepared & Endorsed By</label>
                    <input
                      type="text"
                      value={preparedBy}
                      onChange={(e) => setPreparedBy(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded font-semibold text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Target Financial Institution / Bank</label>
                    <input
                      type="text"
                      value={fundingAgency}
                      onChange={(e) => setFundingAgency(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded font-semibold text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Submission Date</label>
                    <input
                      type="text"
                      value={preparedDate}
                      onChange={(e) => setPreparedDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded font-semibold text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Contact Email</label>
                    <input
                      type="text"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="e.g. director@company.com"
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Contact Phone</label>
                    <input
                      type="text"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="e.g. +1 (758) 555-0199"
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Commercial Address / Facility Location</label>
                    <input
                      type="text"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      placeholder="e.g. Rodney Bay Commercial Centre, Gros Islet, Saint Lucia"
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Preview Summary Tab */
            <div className="space-y-4">
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-4">
                
                {/* Meta Header */}
                <div className="border-b border-stone-200 pb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Commercial Business Plan
                  </span>
                  <h4 className="text-base font-bold text-stone-900 mt-1">{companyName || 'Business Plan'}</h4>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 mt-1">
                    <span>Target: <strong className="text-stone-700">{fundingAgency}</strong></span>
                    <span>•</span>
                    <span>Prepared By: <strong className="text-stone-700">{preparedBy}</strong></span>
                    <span>•</span>
                    <span>Currency: <strong className="text-stone-700">{presentation.currencyCode} ({presentation.currencySymbol})</strong></span>
                  </div>
                </div>

                {/* Executive Highlights */}
                <div>
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Executive Highlights</h5>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-emerald-50/70 border border-emerald-150 rounded-lg p-2">
                      <div className="text-[9px] font-bold text-stone-400 uppercase">{presentation.headline.primaryMetricLabel}</div>
                      <div className="text-sm font-extrabold text-emerald-800">{presentation.headline.primaryPriceFormatted}</div>
                      <div className="text-[9px] text-emerald-700">{presentation.headline.volumeMetricLabel}</div>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-2">
                      <div className="text-[9px] font-bold text-stone-400 uppercase">{presentation.headline.primaryCostLabel}</div>
                      <div className="text-sm font-extrabold text-stone-800">{presentation.headline.primaryCostFormatted}</div>
                      <div className="text-[9px] text-stone-500">{presentation.headline.marginMetricPercent}% Margin</div>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-2">
                      <div className="text-[9px] font-bold text-stone-400 uppercase">Year 1 Rev</div>
                      <div className="text-sm font-extrabold text-stone-800">{presentation.year1.revenueFormatted}</div>
                      <div className="text-[9px] text-stone-500">{presentation.headline.volumeYear1.toLocaleString()} Units</div>
                    </div>
                    <div className="bg-emerald-50/70 border border-emerald-150 rounded-lg p-2">
                      <div className="text-[9px] font-bold text-stone-400 uppercase">Year 1 Operating Profit (EBITDA)</div>
                      <div className="text-sm font-extrabold text-emerald-800">{presentation.year1.ebitdaFormatted}</div>
                      <div className="text-[9px] text-emerald-700">{presentation.year1.revenue > 0 ? Math.round((presentation.year1.ebitda / presentation.year1.revenue) * 100) : 0}% EBITDA Margin</div>
                    </div>
                  </div>
                </div>

                {/* Service Streams Matrix Preview if applicable */}
                {presentation.isServiceBusiness && presentation.revenueStreams.length > 0 && (
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Service Revenue Matrix</h5>
                    <div className="space-y-1.5 text-xs">
                      {presentation.revenueStreams.map(s => (
                        <div key={s.id} className="p-2 bg-white border border-stone-200 rounded-lg flex items-center justify-between">
                          <div>
                            <span className="font-bold text-stone-800">{s.name}</span>
                            <span className="text-[10px] text-stone-500 ml-2">({s.unitLabel} • {s.rateFormatted})</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-700">{s.monthlyRevenueFormatted}</span>
                            <span className="text-[10px] text-stone-400 ml-2">CM: {s.contributionMarginPercent}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Multi-Year P&L Statement Preview */}
                <div>
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Multi-Year Income Statement Preview</h5>
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
                        <th className="p-1.5 text-left">Statement Line</th>
                        <th className="p-1.5 text-right">Year 1</th>
                        <th className="p-1.5 text-right">Year 3</th>
                        <th className="p-1.5 text-right">Year 5</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      <tr>
                        <td className="p-1.5 font-medium text-stone-800">Gross Revenue</td>
                        <td className="p-1.5 text-right font-semibold">{presentation.year1.revenueFormatted}</td>
                        <td className="p-1.5 text-right font-semibold">{presentation.year3.revenueFormatted}</td>
                        <td className="p-1.5 text-right font-semibold">{presentation.year5.revenueFormatted}</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 text-stone-600">{presentation.isServiceBusiness ? 'Direct Variable Costs' : 'Cost of Goods Sold'}</td>
                        <td className="p-1.5 text-right text-stone-600">{presentation.year1.cogsFormatted}</td>
                        <td className="p-1.5 text-right text-stone-600">{presentation.currencySymbol}{Math.round(calculations.y3COGS).toLocaleString()}</td>
                        <td className="p-1.5 text-right text-stone-600">{presentation.currencySymbol}{Math.round(calculations.y5COGS).toLocaleString()}</td>
                      </tr>
                      <tr className="bg-stone-50/60 font-semibold">
                        <td className="p-1.5 text-stone-800">Gross Profit / CM</td>
                        <td className="p-1.5 text-right text-stone-800">{presentation.year1.grossProfitFormatted}</td>
                        <td className="p-1.5 text-right text-stone-800">{presentation.year3.grossProfitFormatted}</td>
                        <td className="p-1.5 text-right text-stone-800">{presentation.year5.grossProfitFormatted}</td>
                      </tr>
                      <tr className="bg-emerald-50/50 text-emerald-900 font-bold">
                        <td className="p-1.5">Net Operating Profit (EBITDA)</td>
                        <td className="p-1.5 text-right">{presentation.year1.ebitdaFormatted}</td>
                        <td className="p-1.5 text-right">{presentation.year3.netProfitFormatted}</td>
                        <td className="p-1.5 text-right">{presentation.year5.netProfitFormatted}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>

              {/* Action Buttons within Preview */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="px-4 py-2 border border-stone-200 hover:bg-stone-100 text-stone-700 font-bold rounded-xl flex items-center gap-2 transition-colors text-xs"
                >
                  <Printer size={14} />
                  Print / Save PDF Preview
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDocx}
                  disabled={isGeneratingDocx}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors text-xs"
                >
                  <Download size={14} />
                  Download Word (.docx)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-150 bg-stone-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleDownloadDocx}
            disabled={isGeneratingDocx}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {isGeneratingDocx ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating Document...
              </>
            ) : (
              <>
                <Download size={14} />
                Download Word (.docx)
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
