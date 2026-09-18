import DOMPurify from 'dompurify';
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
  Loader2
} from 'lucide-react';
import { BudgetEvent, BusinessPlanSections } from '../types';
import { generateBusinessPlanDocx, BusinessPlanCalculations } from '../services/businessPlanExportService';
import { triggerSecureDownload } from '../services/fileStorageService';

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
      // Clone event with latest metadata
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
    const docHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Merriweather:wght@300;400;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: letter;
            margin: 18mm 20mm 20mm 20mm;
            @top-right {
              content: "${companyName} | Funding Proposal";
              font-size: 8pt;
              color: #64748b;
              font-family: 'Plus Jakarta Sans', sans-serif;
            }
            @bottom-center {
              content: "Confidential • Commercial Lending Review";
              font-size: 8pt;
              color: #94a3b8;
              font-family: 'Plus Jakarta Sans', sans-serif;
            }
          }

          * { box-sizing: border-box; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.65;
            color: #0f172a;
            background: #ffffff;
            margin: 0 auto;
            padding: 24px;
            max-width: 820px;
            font-size: 13px;
          }

          /* Top action banner */
          .no-print-bar {
            background: #0f2942;
            color: #ffffff;
            padding: 14px 20px;
            text-align: center;
            margin-bottom: 30px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 4px 12px rgba(15, 41, 66, 0.15);
          }
          .print-btn {
            background: #0d9488;
            color: #ffffff;
            font-weight: 700;
            padding: 10px 22px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            letter-spacing: 0.5px;
            transition: all 0.2s;
          }
          .print-btn:hover { background: #0f766e; }

          /* Cover Page */
          .cover {
            text-align: center;
            padding: 80px 20px 60px 20px;
            page-break-after: always;
            break-after: page;
            min-height: 85vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .cover-badge {
            display: inline-block;
            background: #f0fdfa;
            color: #0d9488;
            border: 1px solid #ccfbf1;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 2px;
            padding: 6px 16px;
            border-radius: 9999px;
            margin-bottom: 24px;
          }
          .cover h1 {
            font-family: 'Merriweather', serif;
            font-size: 34px;
            font-weight: 700;
            color: #0f2942;
            margin: 0 0 12px 0;
            letter-spacing: -0.5px;
          }
          .cover h2 {
            font-size: 15px;
            color: #0d9488;
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: 700;
            margin: 0 0 32px 0;
          }
          .cover-divider {
            width: 80px;
            height: 3px;
            background: #0d9488;
            margin: 0 auto 36px auto;
            border-radius: 2px;
          }

          .meta-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px;
            max-width: 540px;
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
            margin-top: 40px;
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
            font-size: 20px;
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
            font-size: 15px;
            font-weight: 800;
            color: #0f2942;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 2px solid #0d9488;
            padding-bottom: 6px;
            margin: 36px 0 16px 0;
            page-break-after: avoid;
            break-after: avoid;
          }
          h3.sub-title {
            font-size: 13px;
            font-weight: 700;
            color: #334155;
            margin: 20px 0 10px 0;
            page-break-after: avoid;
          }
          p {
            margin: 0 0 14px 0;
            text-align: justify;
            color: #334155;
            line-height: 1.7;
          }

          /* Tables */
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0 24px 0;
            font-size: 12px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 8px 12px;
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
            body { padding: 0; max-width: 100%; }
            .no-print-bar { display: none !important; }
            .page-break { page-break-after: always; break-after: page; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div style="text-align: left;">
            <div style="font-weight: 800; font-size: 14px;">Print Ready Preview</div>
            <div style="font-size: 11px; color: #94a3b8;">Choose "Save as PDF" in print destination for high-resolution document</div>
          </div>
          <button class="print-btn" onclick="window.print()">
            🖨️ Print / Save as PDF
          </button>
        </div>

        <div class="cover">
          <div>
            <div class="cover-badge">Commercial Funding Proposal</div>
            <h1>${companyName}</h1>
            <h2>Comprehensive Business Plan & Projections</h2>
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
              <span class="meta-label">Document Classification:</span>
              <span class="meta-val" style="color:#0d9488;">Lending Committee Review</span>
            </div>
          </div>

          <div class="confidential-pill">
            STRICTLY CONFIDENTIAL • PROPRIETARY FINANCIAL APPRAISAL
          </div>
        </div>

        <div class="page-break"></div>

        <!-- Executive KPI Highlights -->
        <div class="kpi-grid">
          <div class="kpi-card highlight">
            <div class="kpi-title">Retail Unit Price</div>
            <div class="kpi-val">$${calculations.finalSuggestedPrice.toFixed(2)}</div>
            <div class="kpi-sub">${calculations.markupPercent}% Target Markup</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Unit COGS</div>
            <div class="kpi-val">$${calculations.costOfGoodsSoldUnit.toFixed(2)}</div>
            <div class="kpi-sub">${calculations.grossMarginPercent}% Gross Margin</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Year 1 Revenue</div>
            <div class="kpi-val">$${Math.round(calculations.y1Rev).toLocaleString()}</div>
            <div class="kpi-sub">${Math.round(calculations.monthlyUnits * 12).toLocaleString()} Units Projected</div>
          </div>
          <div class="kpi-card highlight">
            <div class="kpi-title">Year 1 Net Profit</div>
            <div class="kpi-val">$${Math.round(calculations.y1Net).toLocaleString()}</div>
            <div class="kpi-sub">${calculations.netMarginPercent}% Net Operating Margin</div>
          </div>
        </div>

        ${bp.executiveSummary ? `<h2 class="section-title">1. Executive Summary</h2><p>${bp.executiveSummary.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.businessDescription ? `<h2 class="section-title">2. Business Description</h2><p>${bp.businessDescription.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.businessObjectives ? `<h2 class="section-title">3. Business Objectives</h2><p>${bp.businessObjectives.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.productsServices ? `<h2 class="section-title">4. Products & Services</h2><p>${bp.productsServices.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.targetMarket ? `<h2 class="section-title">5. Target Market</h2><p>${bp.targetMarket.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.marketAnalysis ? `<h2 class="section-title">6. Market Analysis</h2><p>${bp.marketAnalysis.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.competitorAnalysis ? `<h2 class="section-title">7. Competitor Analysis</h2><p>${bp.competitorAnalysis.replace(/\n/g, '<br/>')}</p>` : ''}

        <h2 class="section-title">Unit Costing & Price Determination</h2>
        <p>The unit economic architecture below specifies all direct material inputs, labor calculations, overhead allocations, and statutory considerations:</p>
        <table>
          <thead>
            <tr><th>Unit Pricing Parameter</th><th class="text-right">Unit Impact ($)</th></tr>
          </thead>
          <tbody>
            <tr><td>Raw Materials Cost per Unit</td><td class="text-right">$${calculations.materialsCostPerUnit.toFixed(2)}</td></tr>
            ${calculations.contingencyPercent > 0 ? `<tr><td>Raw Material Contingency Buffer (${calculations.contingencyPercent}%)</td><td class="text-right">+$${((calculations.materialsCostPerUnit * calculations.contingencyPercent) / 100).toFixed(2)}</td></tr>` : ''}
            <tr><td>Direct Production Labor per Unit</td><td class="text-right">+$${calculations.laborCostPerUnit.toFixed(2)}</td></tr>
            ${calculations.allocatedOverheadPerUnit > 0 ? `<tr><td>Allocated Monthly Overhead per Unit</td><td class="text-right">+$${calculations.allocatedOverheadPerUnit.toFixed(2)}</td></tr>` : ''}
            <tr class="bold"><td>Calculated Cost of Goods Sold (COGS)</td><td class="text-right">$${calculations.costOfGoodsSoldUnit.toFixed(2)}</td></tr>
            <tr><td>Profit Markup Margin (${calculations.markupPercent}%)</td><td class="text-right">+$${calculations.calculatedProfitPerUnit.toFixed(2)}</td></tr>
            <tr class="bold"><td>Pre-Tax Wholesale Selling Price</td><td class="text-right">$${calculations.preTaxSellingPrice.toFixed(2)}</td></tr>
            ${calculations.includeLevy ? `<tr><td>Health & Environmental Levy (2.5%)</td><td class="text-right">+$${calculations.levyCost.toFixed(2)}</td></tr>` : ''}
            ${calculations.includeVat ? `<tr><td>Value Added Tax (VAT 12.5%)</td><td class="text-right">+$${calculations.vatCost.toFixed(2)}</td></tr>` : ''}
            <tr class="highlight-row total-double-line"><td>DETERMINED COMMERCIAL SELLING PRICE</td><td class="text-right">$${calculations.finalSuggestedPrice.toFixed(2)}</td></tr>
          </tbody>
        </table>

        <h2 class="section-title">Multi-Year Statement of Comprehensive Income</h2>
        <p>Projections are grounded in audited unit economics scaled by commercial capacity expansion rates:</p>
        <table>
          <thead>
            <tr><th>Financial Statement Metric</th><th class="text-right">Year 1</th><th class="text-right">Year 3</th><th class="text-right">Year 5</th></tr>
          </thead>
          <tbody>
            <tr class="bold"><td>Gross Revenue</td><td class="text-right">$${Math.round(calculations.y1Rev).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3Rev).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5Rev).toLocaleString()}</td></tr>
            <tr><td>Cost of Goods Sold (COGS)</td><td class="text-right">$${Math.round(calculations.y1COGS).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3COGS).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5COGS).toLocaleString()}</td></tr>
            <tr class="bold"><td>Gross Profit Margin</td><td class="text-right">$${Math.round(calculations.y1Gross).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3Gross).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5Gross).toLocaleString()}</td></tr>
            <tr><td>Operating Fixed Overhead (OpEx)</td><td class="text-right">$${Math.round(calculations.y1OpEx).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3OpEx).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5OpEx).toLocaleString()}</td></tr>
            <tr class="highlight-row total-double-line"><td>Net Operating Profit (EBIT)</td><td class="text-right">$${Math.round(calculations.y1Net).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3Net).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5Net).toLocaleString()}</td></tr>
            <tr><td>Operating Margin %</td><td class="text-right">${calculations.netMarginPercent}%</td><td class="text-right">${calculations.y3Rev > 0 ? Math.round((calculations.y3Net / calculations.y3Rev) * 100) : 0}%</td><td class="text-right">${calculations.y5Rev > 0 ? Math.round((calculations.y5Net / calculations.y5Rev) * 100) : 0}%</td></tr>
          </tbody>
        </table>

        ${bp.fundingRequirements ? `<h2 class="section-title">Funding Request & Capital Utilization</h2><p>${bp.fundingRequirements.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.useOfFunds ? `<h2 class="section-title">Use of Proceeds</h2><p>${bp.useOfFunds.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.risksMitigation ? `<h2 class="section-title">Risk Analysis & Mitigation Controls</h2><p>${bp.risksMitigation.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.conclusion ? `<h2 class="section-title">Conclusion & Execution Plan</h2><p>${bp.conclusion.replace(/\n/g, '<br/>')}</p>` : ''}

        <h2 class="section-title">Commercial Execution & Authorization</h2>
        <p>The undersigned authorized officers certify the veracity of the operational forecasts and market assessments contained herein:</p>
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
    printWindow.document.write(DOMPurify.sanitize(docHtml, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style', 'link'] }));
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
      <div className="bg-white border border-stone-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-stone-150 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Download size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                Export Funding-Ready Business Plan
              </h3>
              <p className="text-xs text-stone-500">
                Generate an editable Microsoft Word document or printable PDF suitable for banks and funding agencies.
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
            Document Preview Summary
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
                      Fully editable master document with Cover Page, Table of Contents, formatted financial tables, and headers/footers.
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
                      Print-optimized preview designed for clean direct browser printing or saving as a submission-ready PDF.
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
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Target Lending Agency / Bank</label>
                    <input
                      type="text"
                      value={fundingAgency}
                      onChange={(e) => setFundingAgency(e.target.value)}
                      placeholder="e.g. Commercial Bank / Development Agency"
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Prepared By</label>
                    <input
                      type="text"
                      value={preparedBy}
                      onChange={(e) => setPreparedBy(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Submission Date</label>
                    <input
                      type="text"
                      value={preparedDate}
                      onChange={(e) => setPreparedDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="executive@company.com"
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+1 (758) 555-0199"
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Business Physical Address</label>
                    <input
                      type="text"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                      placeholder="e.g. Rodney Bay Commercial Boulevard, Gros Islet, Saint Lucia"
                      className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Archive Multi-Year P&L Directly to Vault */}
              {onExportPnlToDocuments && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-stone-800">Archive P&L to Project Documents</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Saves an interactive snapshot of the 5-year profit & loss table in the Vault/Documents tab.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportPnl}
                    disabled={isExportingPnl}
                    className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {isExportingPnl ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                    Archive P&L
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Document Structure & Live Mockup Preview */
            <div className="space-y-4 text-xs">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-4 max-h-[480px] overflow-y-auto">
                <div className="bg-white border border-stone-200 rounded-lg p-5 shadow-xs space-y-4">
                  
                  {/* Cover Header Preview */}
                  <div className="text-center border-b border-stone-150 pb-4 space-y-2">
                    <span className="inline-block px-3 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                      Commercial Funding Proposal
                    </span>
                    <h2 className="text-xl font-bold text-stone-900">{companyName || 'Business Name'}</h2>
                    <p className="text-xs text-stone-500 font-medium">Business Plan & Projections for {fundingAgency || 'Lending Agency'}</p>
                    <div className="flex items-center justify-center gap-4 text-[11px] text-stone-400 pt-1">
                      <span>Prepared by: <strong className="text-stone-700">{preparedBy}</strong></span>
                      <span>•</span>
                      <span>Date: <strong className="text-stone-700">{preparedDate}</strong></span>
                    </div>
                  </div>

                  {/* Executive KPI Snapshot Cards */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Executive Highlights</h5>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-emerald-50/70 border border-emerald-150 rounded-lg p-2">
                        <div className="text-[9px] font-bold text-stone-400 uppercase">Retail Price</div>
                        <div className="text-sm font-extrabold text-emerald-800">${calculations.finalSuggestedPrice.toFixed(2)}</div>
                        <div className="text-[9px] text-emerald-700">{calculations.markupPercent}% Markup</div>
                      </div>
                      <div className="bg-stone-50 border border-stone-200 rounded-lg p-2">
                        <div className="text-[9px] font-bold text-stone-400 uppercase">Unit COGS</div>
                        <div className="text-sm font-extrabold text-stone-800">${calculations.costOfGoodsSoldUnit.toFixed(2)}</div>
                        <div className="text-[9px] text-stone-500">{calculations.grossMarginPercent}% Margin</div>
                      </div>
                      <div className="bg-stone-50 border border-stone-200 rounded-lg p-2">
                        <div className="text-[9px] font-bold text-stone-400 uppercase">Year 1 Rev</div>
                        <div className="text-sm font-extrabold text-stone-800">${Math.round(calculations.y1Rev).toLocaleString()}</div>
                        <div className="text-[9px] text-stone-500">{Math.round(calculations.monthlyUnits * 12).toLocaleString()} Units</div>
                      </div>
                      <div className="bg-emerald-50/70 border border-emerald-150 rounded-lg p-2">
                        <div className="text-[9px] font-bold text-stone-400 uppercase">Year 1 Net (EBIT)</div>
                        <div className="text-sm font-extrabold text-emerald-800">${Math.round(calculations.y1Net).toLocaleString()}</div>
                        <div className="text-[9px] text-emerald-700">{calculations.netMarginPercent}% Net Margin</div>
                      </div>
                    </div>
                  </div>

                  {/* Sample Financial Statement Table */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Multi-Year Income Statement Preview</h5>
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
                          <th className="p-1.5 text-left">Revenue Statement Line</th>
                          <th className="p-1.5 text-right">Year 1</th>
                          <th className="p-1.5 text-right">Year 3</th>
                          <th className="p-1.5 text-right">Year 5</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-150">
                        <tr>
                          <td className="p-1.5 font-medium text-stone-800">Gross Revenue</td>
                          <td className="p-1.5 text-right font-semibold">${Math.round(calculations.y1Rev).toLocaleString()}</td>
                          <td className="p-1.5 text-right font-semibold">${Math.round(calculations.y3Rev).toLocaleString()}</td>
                          <td className="p-1.5 text-right font-semibold">${Math.round(calculations.y5Rev).toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 text-stone-600">Cost of Goods Sold (COGS)</td>
                          <td className="p-1.5 text-right text-stone-600">${Math.round(calculations.y1COGS).toLocaleString()}</td>
                          <td className="p-1.5 text-right text-stone-600">${Math.round(calculations.y3COGS).toLocaleString()}</td>
                          <td className="p-1.5 text-right text-stone-600">${Math.round(calculations.y5COGS).toLocaleString()}</td>
                        </tr>
                        <tr className="bg-stone-50/60 font-semibold">
                          <td className="p-1.5 text-stone-800">Gross Profit</td>
                          <td className="p-1.5 text-right text-stone-800">${Math.round(calculations.y1Gross).toLocaleString()}</td>
                          <td className="p-1.5 text-right text-stone-800">${Math.round(calculations.y3Gross).toLocaleString()}</td>
                          <td className="p-1.5 text-right text-stone-800">${Math.round(calculations.y5Gross).toLocaleString()}</td>
                        </tr>
                        <tr className="bg-emerald-50/50 text-emerald-900 font-bold">
                          <td className="p-1.5">Net Operating Profit (EBIT)</td>
                          <td className="p-1.5 text-right">${Math.round(calculations.y1Net).toLocaleString()}</td>
                          <td className="p-1.5 text-right">${Math.round(calculations.y3Net).toLocaleString()}</td>
                          <td className="p-1.5 text-right">${Math.round(calculations.y5Net).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Signatures notice */}
                  <div className="pt-2 border-t border-stone-150 flex items-center justify-between text-[11px] text-stone-400">
                    <span>Includes Formal Endorsement Signatures Block</span>
                    <span className="font-semibold text-stone-600">25 Comprehensive Sections</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons within Preview */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="px-4 py-2 border border-stone-200 hover:bg-stone-100 text-stone-700 font-bold rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Printer size={14} />
                  Print / Save PDF Preview
                </button>
                <button
                  type="button"
                  onClick={handleDownloadDocx}
                  disabled={isGeneratingDocx}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors"
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
