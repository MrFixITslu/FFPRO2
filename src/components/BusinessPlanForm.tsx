import React, { useState } from 'react';
import {
  FileText,
  Building,
  Target,
  Users,
  Briefcase,
  DollarSign,
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  Download,
  Upload,
  Sparkles,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  Clock
} from 'lucide-react';
import { BudgetEvent, BusinessPlanSections, SupplierQuoteData } from '../types';

interface BusinessPlanFormProps {
  selectedEvent: BudgetEvent;
  onUpdateBusinessPlan: (updatedPlan: BusinessPlanSections) => void;
  onOpenImportQuote: () => void;
  onOpenExportModal: () => void;
  onScrollToCosting: () => void;
}

interface SectionFieldDef {
  key: keyof BusinessPlanSections;
  label: string;
  placeholder: string;
  helper: string;
  rows?: number;
}

export const BusinessPlanForm: React.FC<BusinessPlanFormProps> = ({
  selectedEvent,
  onUpdateBusinessPlan,
  onOpenImportQuote,
  onOpenExportModal,
  onScrollToCosting
}) => {
  const sd = selectedEvent.startupDetails;
  const currentPlan: BusinessPlanSections = sd?.businessPlan || {};
  const importedQuotes: SupplierQuoteData[] = sd?.importedQuotes || [];

  const [activeTab, setActiveTab] = useState<'exec' | 'market' | 'offering' | 'financials' | 'execution'>('exec');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  const handleFieldChange = (key: keyof BusinessPlanSections, value: string) => {
    setSaveStatus('saving');
    const updated = {
      ...currentPlan,
      [key]: value
    };
    onUpdateBusinessPlan(updated);
    setTimeout(() => setSaveStatus('saved'), 300);
  };

  // Field configurations categorized into 5 professional modules
  const execFields: SectionFieldDef[] = [
    {
      key: 'executiveSummary',
      label: 'Executive Summary',
      placeholder: 'Synthesize the company mission, core value proposition, key leadership, target market, and the total funding requested...',
      helper: 'The primary page read by commercial bank underwriters and grant committee members.',
      rows: 5
    },
    {
      key: 'businessDescription',
      label: 'Business Description',
      placeholder: 'Detail the business name, legal entity structure, founding history, registration details, and physical headquarters...',
      helper: 'Legal foundation and corporate identity of the enterprise.',
      rows: 3
    },
    {
      key: 'businessObjectives',
      label: 'Business Objectives',
      placeholder: 'Specify 1-year, 3-year, and 5-year SMART objectives (e.g. revenue targets, unit output, regional expansion)...',
      helper: 'Quantifiable milestones demonstrating growth trajectory.',
      rows: 3
    },
    {
      key: 'problemOpportunity',
      label: 'Problem / Market Opportunity',
      placeholder: 'Identify the exact market pain point, unmet customer demand, or technological deficiency in the current landscape...',
      helper: 'Why this business must exist and why customers will switch.',
      rows: 3
    }
  ];

  const marketFields: SectionFieldDef[] = [
    {
      key: 'targetMarket',
      label: 'Target Market Definition',
      placeholder: 'Define the Total Addressable Market (TAM), Serviceable Addressable Market (SAM), and Serviceable Obtainable Market (SOM)...',
      helper: 'Market sizing and customer demographic parameters.',
      rows: 3
    },
    {
      key: 'customerProfile',
      label: 'Ideal Customer Profile (ICP)',
      placeholder: 'Describe target buyer personas, income brackets, B2B purchasing agents, decision criteria, and consumer habits...',
      helper: 'Who directly signs the check or authorizes payment.',
      rows: 3
    },
    {
      key: 'marketAnalysis',
      label: 'Industry & Market Analysis',
      placeholder: 'Current trends, growth rates, regulatory environment, and tailwinds favoring this sector...',
      helper: 'Macroeconomic and industry sector validation.',
      rows: 4
    },
    {
      key: 'competitorAnalysis',
      label: 'Competitor Analysis',
      placeholder: 'List primary and secondary competitors, their market share, strengths, and identifiable weaknesses...',
      helper: 'Demonstrates thorough market awareness to investors.',
      rows: 4
    },
    {
      key: 'competitiveAdvantage',
      label: 'Competitive Advantage & Moat',
      placeholder: 'Highlight your proprietary technology, exclusive supplier quotes/agreements, locational superiority, or unit cost advantages...',
      helper: 'What prevents competitors from copying your success.',
      rows: 3
    }
  ];

  const offeringFields: SectionFieldDef[] = [
    {
      key: 'productsServices',
      label: 'Products & Services Portfolio',
      placeholder: 'Comprehensive breakdown of products or service packages offered, specifications, packaging, and warranties...',
      helper: 'Detailed technical or commercial catalog of offerings.',
      rows: 4
    },
    {
      key: 'businessModel',
      label: 'Business Model',
      placeholder: 'How the organization creates, delivers, and captures value (e.g. direct-to-consumer, B2B wholesale, subscription, retail distribution)...',
      helper: 'The fundamental commercial engine of the company.',
      rows: 3
    },
    {
      key: 'revenueModel',
      label: 'Revenue Model & Monetization',
      placeholder: 'Primary revenue streams, pricing tiers, payment terms, billing cadence, and repeat purchase dynamics...',
      helper: 'How money flows into the corporate bank accounts.',
      rows: 3
    },
    {
      key: 'marketingSalesStrategy',
      label: 'Marketing & Sales Strategy',
      placeholder: 'Customer acquisition channels, direct sales team structure, digital advertising, partner referrals, and launch campaigns...',
      helper: 'Actionable customer acquisition pipeline.',
      rows: 4
    },
    {
      key: 'operationsPlan',
      label: 'Operations Plan',
      placeholder: 'Day-to-day workflow, physical facility requirements, production processes, fulfillment, quality control, and customer service...',
      helper: 'How orders are fulfilled seamlessly from quote to delivery.',
      rows: 4
    },
    {
      key: 'equipmentTechRequirements',
      label: 'Equipment & Technology Requirements',
      placeholder: 'Commercial machinery, IT software, POS systems, specialized tooling, vehicles, and digital infrastructure...',
      helper: 'Capital assets necessary for production capacity.',
      rows: 3
    },
    {
      key: 'suppliers',
      label: 'Suppliers & Supply Chain Partners',
      placeholder: 'Key material vendors, equipment manufacturers, shipping logistics partners, backup suppliers, and verified credit terms...',
      helper: 'Demonstrates procurement resilience and quote verification.',
      rows: 3
    },
    {
      key: 'managementStaffing',
      label: 'Management Team & Key Staffing',
      placeholder: 'Bios of founders, key directors, advisors, technical specialists, and planned staffing headcount...',
      helper: 'Underwriters invest in experienced, execution-oriented operators.',
      rows: 3
    }
  ];

  const financialFields: SectionFieldDef[] = [
    {
      key: 'startupRequirements',
      label: 'Startup Requirements & Initial Outlay',
      placeholder: 'Initial capital equipment, security deposits, incorporation legal fees, licensing, and starting inventory...',
      helper: 'Pre-operational one-time expenditures required to open doors.',
      rows: 3
    },
    {
      key: 'fundingRequirements',
      label: 'Total Funding Requested',
      placeholder: 'Total capital requested (e.g. $150,000 commercial term loan / $50,000 equity injection), requested repayment tenure, and grace period...',
      helper: 'The clear, explicit funding ask submitted to the review board.',
      rows: 3
    },
    {
      key: 'useOfFunds',
      label: 'Use of Funds & Capital Allocation',
      placeholder: 'Specific line-by-line breakdown of how funding proceeds will be disbursed (e.g. 50% equipment, 25% working capital, 15% inventory, 10% marketing)...',
      helper: 'Ensures funds are allocated solely to productive assets.',
      rows: 4
    },
    {
      key: 'financialRequirements',
      label: 'Financial Assumptions & Unit Economics',
      placeholder: 'Commentary on underlying unit cost assumptions, gross margins, payment cycles, and debtor/creditor terms...',
      helper: 'Narrative supporting the Interactive Costing figures.',
      rows: 3
    },
    {
      key: 'salesRevenueProjectionsNotes',
      label: 'Sales Projections Commentary',
      placeholder: 'Justification for monthly volume expansion, seasonality factors, and Year 3 / Year 5 growth rates...',
      helper: 'Context for credit analysts reviewing the P&L table.',
      rows: 3
    },
    {
      key: 'operatingCostsNotes',
      label: 'Operating Overhead Budget Commentary',
      placeholder: 'Explanation of rent escalations, staff salary benchmarks, and utility containment strategies...',
      helper: 'Validates the monthly operating expenses entered below.',
      rows: 3
    }
  ];

  const executionFields: SectionFieldDef[] = [
    {
      key: 'implementationPlan',
      label: 'Implementation & Launch Plan',
      placeholder: 'Phase-by-phase roadmap from funding disbursement through facility fit-out, supplier delivery, testing, and grand opening...',
      helper: 'Timeline establishing operational readiness.',
      rows: 4
    },
    {
      key: 'milestonesNotes',
      label: 'Critical Milestones & Success Metrics',
      placeholder: 'Key performance indicators (KPIs), break-even date, regulatory approvals, and first commercial sales target...',
      helper: 'Measurable checkpoints tracked by stakeholders.',
      rows: 3
    },
    {
      key: 'risksMitigation',
      label: 'Risk Analysis & Mitigation Strategies',
      placeholder: 'Identify financial, operational, supply chain, and regulatory risks, paired with concrete preventative counteractions...',
      helper: 'Critical risk disclosure mandatory for commercial bank approval.',
      rows: 4
    },
    {
      key: 'conclusion',
      label: 'Conclusion & Summary Statement',
      placeholder: 'Final closing pitch highlighting return on investment, economic development impact, job creation, and request for credit approval...',
      helper: 'The closing endorsement summarizing the opportunity.',
      rows: 3
    }
  ];

  const currentTabFields =
    activeTab === 'exec'
      ? execFields
      : activeTab === 'market'
      ? marketFields
      : activeTab === 'offering'
      ? offeringFields
      : activeTab === 'financials'
      ? financialFields
      : executionFields;

  // Calculate completion percentage across all 26 sections
  const allKeys: (keyof BusinessPlanSections)[] = [
    'executiveSummary', 'businessDescription', 'businessObjectives', 'problemOpportunity',
    'targetMarket', 'customerProfile', 'marketAnalysis', 'competitorAnalysis', 'competitiveAdvantage',
    'productsServices', 'businessModel', 'revenueModel', 'marketingSalesStrategy', 'operationsPlan',
    'equipmentTechRequirements', 'suppliers', 'managementStaffing', 'startupRequirements',
    'financialRequirements', 'salesRevenueProjectionsNotes', 'operatingCostsNotes', 'fundingRequirements',
    'useOfFunds', 'implementationPlan', 'milestonesNotes', 'risksMitigation', 'conclusion'
  ];

  const completedCount = allKeys.filter(k => (currentPlan[k] || '').trim().length > 10).length;
  const progressPercent = Math.round((completedCount / allKeys.length) * 100);

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Overview & Action Bar */}
      <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-2xl p-5 shadow-sm border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Commercial Credit Standard
            </span>
            <span className="text-xs text-stone-400">
              {completedCount} of {allKeys.length} Sections Completed ({progressPercent}%)
            </span>
          </div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Funding-Ready Business Plan
          </h3>
          <p className="text-xs text-stone-300 max-w-xl">
            Structured for credit committee reviews, bank loan underwriting, and grant applications. Integrates live unit costing and multi-year financial projections.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenImportQuote}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all"
          >
            <Upload size={14} />
            Import Supplier Quote (Ollama)
          </button>

          <button
            type="button"
            onClick={onOpenExportModal}
            className="px-3.5 py-2 bg-white hover:bg-stone-100 text-stone-900 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all"
          >
            <Download size={14} />
            Export Business Plan (.docx)
          </button>
        </div>
      </div>

      {/* Imported Quotes Bar (if any quotes have been imported) */}
      {importedQuotes.length > 0 && (
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-700" />
              <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                Attached Supplier Quotes ({importedQuotes.length})
              </h4>
            </div>
            <span className="text-[11px] text-emerald-800">
              Preserved in <strong className="font-semibold">Project → Documents</strong>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {importedQuotes.map((q, i) => (
              <div
                key={q.id || i}
                className="bg-white border border-emerald-200/60 rounded-xl p-2.5 text-xs flex items-center justify-between shadow-2xs"
              >
                <div className="space-y-0.5 truncate pr-2">
                  <p className="font-bold text-stone-900 truncate">{q.supplier}</p>
                  <p className="text-[10px] text-stone-500 truncate">
                    Ref: {q.quoteNumber || 'N/A'} • {q.quoteDate || 'Recent'}
                  </p>
                </div>
                <div className="text-right shrink-0 font-mono font-bold text-emerald-800">
                  ${(q.total || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Navigation Tabs */}
      <div className="flex flex-wrap border-b border-stone-200 gap-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('exec')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition-all ${
            activeTab === 'exec'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Building size={15} />
          1. Executive & Company
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('market')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition-all ${
            activeTab === 'market'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Target size={15} />
          2. Market & Competition
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('offering')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition-all ${
            activeTab === 'offering'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Briefcase size={15} />
          3. Offering & Operations
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('financials')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition-all ${
            activeTab === 'financials'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <DollarSign size={15} />
          4. Financials & Capital
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('execution')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold border-b-2 transition-all ${
            activeTab === 'execution'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <ShieldAlert size={15} />
          5. Execution & Risks
        </button>
      </div>

      {/* Active Tab Form Fields */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-stone-150">
          <div>
            <h4 className="text-sm font-bold text-stone-900">
              {activeTab === 'exec' && 'Executive Summary & Corporate Identity'}
              {activeTab === 'market' && 'Market Analysis, Demographics & Competitors'}
              {activeTab === 'offering' && 'Products, Services, Operations & Supply Chain'}
              {activeTab === 'financials' && 'Funding Request & Financial Projections Commentary'}
              {activeTab === 'execution' && 'Implementation Roadmap, Milestones & Risk Mitigation'}
            </h4>
            <p className="text-xs text-stone-500">
              Enter your actual project data. In the exported document, only sections with content are included.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onScrollToCosting}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 underline"
            >
              Interactive Sale Price Costing <ChevronRight size={13} />
            </button>
            <span className="text-[11px] text-stone-400 font-mono">
              {saveStatus === 'saving' ? 'Saving...' : 'Auto-saved'}
            </span>
          </div>
        </div>

        <div className="space-y-5">
          {currentTabFields.map((field) => {
            const val = (currentPlan[field.key] as string) || '';
            const isFilled = val.trim().length > 0;

            return (
              <div key={field.key} className="space-y-1.5 group">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-800 flex items-center gap-2">
                    {field.label}
                    {isFilled && <CheckCircle2 size={13} className="text-emerald-600" />}
                  </label>
                  <span className="text-[10px] text-stone-400">
                    {val.length} chars
                  </span>
                </div>
                <p className="text-[11px] text-stone-400 italic">
                  {field.helper}
                </p>
                <textarea
                  rows={field.rows || 3}
                  value={val}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full p-3 bg-stone-50/70 border border-stone-200 rounded-xl text-xs text-stone-800 leading-relaxed outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all resize-y"
                />
              </div>
            );
          })}
        </div>

        {/* Tab Switcher Actions */}
        <div className="pt-4 border-t border-stone-150 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Clock size={13} />
            All inputs are saved directly with the project plan.
          </div>

          <div className="flex items-center gap-2">
            {activeTab !== 'exec' && (
              <button
                type="button"
                onClick={() => {
                  const tabs: ('exec' | 'market' | 'offering' | 'financials' | 'execution')[] = [
                    'exec', 'market', 'offering', 'financials', 'execution'
                  ];
                  const idx = tabs.indexOf(activeTab);
                  if (idx > 0) setActiveTab(tabs[idx - 1]);
                }}
                className="px-3 py-1.5 border border-stone-200 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
              >
                Previous Module
              </button>
            )}

            {activeTab !== 'execution' ? (
              <button
                type="button"
                onClick={() => {
                  const tabs: ('exec' | 'market' | 'offering' | 'financials' | 'execution')[] = [
                    'exec', 'market', 'offering', 'financials', 'execution'
                  ];
                  const idx = tabs.indexOf(activeTab);
                  if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
                }}
                className="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
              >
                Next Module <ChevronRight size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenExportModal}
                className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Download size={13} /> Export Business Plan
              </button>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
