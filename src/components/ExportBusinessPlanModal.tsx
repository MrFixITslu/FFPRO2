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
  const sd = selectedEvent.startupDetails;
  const bp: BusinessPlanSections = sd?.businessPlan || {};

  const [companyName, setCompanyName] = useState<string>(bp.companyName || selectedEvent.name || '');
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

  if (!isOpen) return null;

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
      const updatedEvent: BudgetEvent = {
        ...selectedEvent,
        startupDetails: {
          ...selectedEvent.startupDetails!,
          businessPlan: {
            ...selectedEvent.startupDetails?.businessPlan,
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
    // Build a print-optimized window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to open the print preview.');
      return;
    }

    const title = `${companyName} - Business Plan & Funding Proposal`;
    const docHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: letter; margin: 20mm; }
          body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 20px; }
          .cover { text-align: center; padding: 100px 0 60px 0; page-break-after: always; }
          .cover h1 { font-size: 32px; color: #0f766e; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
          .cover h2 { font-size: 18px; color: #334155; margin-bottom: 24px; font-weight: 600; }
          .cover .meta { margin-top: 40px; font-size: 14px; color: #475569; }
          .cover .confidential { margin-top: 80px; font-size: 11px; color: #dc2626; font-weight: bold; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          h2.section-title { font-size: 16px; color: #0f766e; text-transform: uppercase; border-bottom: 2px solid #0f766e; padding-bottom: 4px; margin-top: 30px; }
          h3.sub-title { font-size: 14px; color: #1e293b; margin-top: 20px; }
          p { font-size: 13px; text-align: justify; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
          th { background: #f1f5f9; color: #1e293b; font-weight: bold; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .highlight { background: #f0fdf4; font-weight: bold; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="background: #0f766e; color: white; padding: 12px; text-align: center; margin-bottom: 20px; border-radius: 8px;">
          <button onclick="window.print()" style="background: white; color: #0f766e; font-weight: bold; padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
            🖨️ Print / Save as PDF
          </button>
          <span style="margin-left: 15px; font-size: 13px;">Choose "Save as PDF" in your print dialog for a clean document.</span>
        </div>

        <div class="cover">
          <h1>${companyName}</h1>
          <h2>Commercial Business Plan & Funding Proposal</h2>
          <div class="meta">
            <p><strong>Prepared For:</strong> ${fundingAgency}</p>
            <p><strong>Prepared By:</strong> ${preparedBy}</p>
            ${contactEmail || contactPhone ? `<p><strong>Contact:</strong> ${[contactEmail, contactPhone].filter(Boolean).join(' | ')}</p>` : ''}
            ${businessAddress ? `<p><strong>Business Address:</strong> ${businessAddress}</p>` : ''}
            <p><strong>Date:</strong> ${preparedDate}</p>
          </div>
          <div class="confidential">
            STRICTLY CONFIDENTIAL • COMMERCIAL CREDIT EVALUATION
          </div>
        </div>

        ${bp.executiveSummary ? `<h2 class="section-title">1. Executive Summary</h2><p>${bp.executiveSummary.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.businessDescription ? `<h2 class="section-title">2. Business Description</h2><p>${bp.businessDescription.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.businessObjectives ? `<h2 class="section-title">3. Business Objectives</h2><p>${bp.businessObjectives.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.productsServices ? `<h2 class="section-title">4. Products & Services</h2><p>${bp.productsServices.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.targetMarket ? `<h2 class="section-title">5. Target Market</h2><p>${bp.targetMarket.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.marketAnalysis ? `<h2 class="section-title">6. Market Analysis</h2><p>${bp.marketAnalysis.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.competitorAnalysis ? `<h2 class="section-title">7. Competitor Analysis</h2><p>${bp.competitorAnalysis.replace(/\n/g, '<br/>')}</p>` : ''}

        <h2 class="section-title">Product Costing & Interactive Unit Economics</h2>
        <table>
          <thead>
            <tr><th>Unit Pricing Parameter</th><th class="text-right">Value / Unit Impact</th></tr>
          </thead>
          <tbody>
            <tr><td>Raw Materials per Unit</td><td class="text-right">$${calculations.materialsCostPerUnit.toFixed(2)}</td></tr>
            <tr><td>Direct Labor per Unit</td><td class="text-right">+$${calculations.laborCostPerUnit.toFixed(2)}</td></tr>
            ${calculations.allocatedOverheadPerUnit > 0 ? `<tr><td>Allocated Monthly Overhead</td><td class="text-right">+$${calculations.allocatedOverheadPerUnit.toFixed(2)}</td></tr>` : ''}
            <tr class="bold"><td>Calculated Cost of Goods Sold (COGS)</td><td class="text-right">$${calculations.costOfGoodsSoldUnit.toFixed(2)}</td></tr>
            <tr><td>Target Markup (${calculations.markupPercent}%)</td><td class="text-right">+$${calculations.calculatedProfitPerUnit.toFixed(2)}</td></tr>
            <tr class="bold"><td>Pre-Tax Selling Price</td><td class="text-right">$${calculations.preTaxSellingPrice.toFixed(2)}</td></tr>
            ${calculations.includeLevy ? `<tr><td>Health & Safety Levy (2.5%)</td><td class="text-right">+$${calculations.levyCost.toFixed(2)}</td></tr>` : ''}
            ${calculations.includeVat ? `<tr><td>VAT (12.5%)</td><td class="text-right">+$${calculations.vatCost.toFixed(2)}</td></tr>` : ''}
            <tr class="highlight"><td>FINAL DETERMINED SALE PRICE</td><td class="text-right">$${calculations.finalSuggestedPrice.toFixed(2)}</td></tr>
          </tbody>
        </table>

        <h2 class="section-title">Multi-Year Profit & Loss Projections</h2>
        <table>
          <thead>
            <tr><th>Revenue Statement Item</th><th class="text-right">Year 1</th><th class="text-right">Year 3</th><th class="text-right">Year 5</th></tr>
          </thead>
          <tbody>
            <tr class="bold"><td>Gross Revenue</td><td class="text-right">$${Math.round(calculations.y1Rev).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3Rev).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5Rev).toLocaleString()}</td></tr>
            <tr><td>Cost of Goods Sold (COGS)</td><td class="text-right">$${Math.round(calculations.y1COGS).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3COGS).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5COGS).toLocaleString()}</td></tr>
            <tr class="bold"><td>Gross Profit Margin</td><td class="text-right">$${Math.round(calculations.y1Gross).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3Gross).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5Gross).toLocaleString()}</td></tr>
            <tr><td>Operating Expenses</td><td class="text-right">$${Math.round(calculations.y1OpEx).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3OpEx).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5OpEx).toLocaleString()}</td></tr>
            <tr class="highlight"><td>Net Operating Profit (EBIT)</td><td class="text-right">$${Math.round(calculations.y1Net).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y3Net).toLocaleString()}</td><td class="text-right">$${Math.round(calculations.y5Net).toLocaleString()}</td></tr>
            <tr><td>Operating Margin %</td><td class="text-right">${calculations.netMarginPercent}%</td><td class="text-right">${calculations.y3Rev > 0 ? Math.round((calculations.y3Net / calculations.y3Rev) * 100) : 0}%</td><td class="text-right">${calculations.y5Rev > 0 ? Math.round((calculations.y5Net / calculations.y5Rev) * 100) : 0}%</td></tr>
          </tbody>
        </table>

        ${bp.fundingRequirements ? `<h2 class="section-title">Funding Requirements</h2><p>${bp.fundingRequirements.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.useOfFunds ? `<h2 class="section-title">Use of Funds</h2><p>${bp.useOfFunds.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.risksMitigation ? `<h2 class="section-title">Risk Analysis & Mitigation</h2><p>${bp.risksMitigation.replace(/\n/g, '<br/>')}</p>` : ''}
        ${bp.conclusion ? `<h2 class="section-title">Conclusion</h2><p>${bp.conclusion.replace(/\n/g, '<br/>')}</p>` : ''}
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(docHtml);
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
            /* Document Structure Preview */
            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-stone-700 space-y-2">
                <p className="font-bold text-stone-900 text-sm">Included Business Plan Structure</p>
                <p className="text-stone-500 text-[11px]">
                  The export combines entered business plan narratives with your live interactive costing calculations:
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-stone-700 pt-1">
                  <div>• Cover Page & Agency Submission Meta</div>
                  <div>• Table of Contents</div>
                  <div>• Executive Summary</div>
                  <div>• Business Description & Objectives</div>
                  <div>• Market Analysis & Target Customer</div>
                  <div>• Competitor Analysis & Advantages</div>
                  <div>• Products, Services & Business Model</div>
                  <div>• Operations & Technology Plan</div>
                  <div>• Suppliers & Procurement Matrix</div>
                  <div>• Management Team & Staffing</div>
                  <div>• Unit Costing & Price Breakdown Table</div>
                  <div>• Monthly Fixed Operating Expenses</div>
                  <div>• Multi-Year P&L Projections (Y1, Y3, Y5)</div>
                  <div>• Funding Requirements & Use of Funds</div>
                  <div>• Implementation Milestones & Schedule</div>
                  <div>• Risk Analysis & Mitigation Plan</div>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 text-xs">
                <p className="font-bold">Live Financial Metrics Embedded:</p>
                <p className="text-[11px] text-emerald-800 mt-1">
                  • Unit COGS: ${calculations.costOfGoodsSoldUnit.toFixed(2)} | Retail Price: ${calculations.sellingPrice.toFixed(2)} ({calculations.markupPercent}% markup)<br />
                  • Target Monthly Volume: {calculations.monthlyUnits.toLocaleString()} units | Gross Margin: {calculations.grossMarginPercent}%<br />
                  • Year 1 Gross Revenue: ${Math.round(calculations.y1Rev).toLocaleString()} | Year 1 Net Profit (EBIT): ${Math.round(calculations.y1Net).toLocaleString()}
                </p>
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
