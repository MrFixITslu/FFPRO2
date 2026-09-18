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
  Clock,
  Info,
  Lightbulb,
  Check
} from 'lucide-react';
import { BudgetEvent, BusinessPlanSections, SupplierQuoteData, ProjectFile } from '../types';

interface BusinessPlanFormProps {
  selectedEvent?: BudgetEvent;
  businessPlan?: BusinessPlanSections;
  eventName?: string;
  onUpdateBusinessPlan: (updatedPlan: BusinessPlanSections) => void;
  onOpenImportQuote?: () => void;
  onOpenExportModal?: () => void;
  onScrollToCosting?: () => void;
  onExportClick?: () => void;
  onImportQuoteClick?: () => void;
  onNavigateToDocuments?: (fileId?: string) => void;
  onOpenFile?: (file: ProjectFile) => void;
}

interface SectionFieldDef {
  key: keyof BusinessPlanSections;
  label: string;
  placeholder: string;
  helper: string;
  simpleExplanation: string;
  requiredItems: string[];
  exampleSnippet?: string;
  rows?: number;
}

interface SectionModuleGuide {
  title: string;
  subtitle: string;
  simpleExplanation: string;
  requiredItems: string[];
  tips: string;
}

const SECTION_GUIDES: Record<'exec' | 'market' | 'offering' | 'financials' | 'execution', SectionModuleGuide> = {
  exec: {
    title: 'Executive Summary & Corporate Identity',
    subtitle: 'High-Level Snapshot & Corporate Profile',
    simpleExplanation: 'This is the most important section of your plan. In simple terms: It gives investors, banks, or partners a quick 2-minute snapshot of who you are, what you sell, how much money you need, and why your business will make money.',
    requiredItems: [
      'High-level summary of your business purpose and main offering',
      'Official business name, legal structure, and physical location',
      'Key 1-year, 3-year, and 5-year measurable goals (revenue & milestones)',
      'The real customer problem you solve and why your solution is better'
    ],
    tips: 'Bank loan officers and grant reviewers read this section first. Keep it positive, clear, and easy to understand.'
  },
  market: {
    title: 'Market Analysis, Demographics & Competitors',
    subtitle: 'Customer Demand & Competitive Landscape',
    simpleExplanation: 'This section proves there are real people eager to buy what you sell. In simple terms: It defines who your exact customers are, how big your market is, who else sells similar products, and why customers will choose you.',
    requiredItems: [
      'Who your target customers are (age, income, habits, businesses)',
      'Total size and growth trends of your target market',
      'Direct and indirect competitors and where they fall short',
      'Your distinct competitive edge (lower cost, better quality, faster service)'
    ],
    tips: 'Be specific about why customers will switch from existing alternatives to your business.'
  },
  offering: {
    title: 'Products, Services, Operations & Supply Chain',
    subtitle: 'Daily Operations, Production & Core Team',
    simpleExplanation: 'This section details what you sell and how you create and deliver it every day. In simple terms: Describe your products, daily workflow, machinery/equipment needs, verified suppliers, and your core team.',
    requiredItems: [
      'Complete catalog and description of your products or service packages',
      'How you make money (pricing, wholesale, retail, subscription)',
      'How you attract and win customers (marketing & sales channels)',
      'Daily operations, production steps, equipment, and suppliers',
      'Key management team members and their practical experience'
    ],
    tips: 'Attach and reference verified supplier quotes to back up your equipment and raw material numbers.'
  },
  financials: {
    title: 'Funding Request & Financial Projections Commentary',
    subtitle: 'Capital Requirements & Profitability Forecast',
    simpleExplanation: 'This section puts dollar figures on your plans. In simple terms: State the exact amount of money you need to launch or expand, explain what every dollar will be used for, and summarize your expected sales and profits.',
    requiredItems: [
      'Total startup outlay and one-time launch expenditures',
      'Exact loan or grant amount requested and preferred repayment tenure',
      'Clear breakdown of how the funding will be spent (Use of Funds)',
      'Explanation of your profit margins, pricing, and 5-year sales growth'
    ],
    tips: 'Ensure your funding request matches your equipment quotes, inventory outlay, and working capital needs.'
  },
  execution: {
    title: 'Implementation Roadmap, Milestones & Risk Mitigation',
    subtitle: 'Launch Timelines, Checkpoints & Safety Measures',
    simpleExplanation: 'This is your action plan and risk safety net. In simple terms: It shows the step-by-step timeline to launch, key milestones you will hit, what potential risks you might face, and how you will prevent or solve them.',
    requiredItems: [
      'Step-by-step launch roadmap with estimated months/dates',
      'Key milestones (first product sold, break-even date, hiring staff)',
      'Realistic risks (cash flow, supplier delays, competition) and your solutions',
      'Final closing summary statement requesting credit or grant approval'
    ],
    tips: 'Underwriters love seeing that you have thought ahead about potential risks and already have backup solutions ready.'
  }
};

export const BusinessPlanForm: React.FC<BusinessPlanFormProps> = ({
  selectedEvent,
  businessPlan,
  eventName,
  onUpdateBusinessPlan,
  onOpenImportQuote,
  onOpenExportModal,
  onScrollToCosting,
  onExportClick,
  onImportQuoteClick,
  onNavigateToDocuments,
  onOpenFile
}) => {
  const openExport = onOpenExportModal || onExportClick || (() => {});
  const openImport = onOpenImportQuote || onImportQuoteClick || (() => {});
  const scrollToCosting = onScrollToCosting || (() => {});

  const sd = selectedEvent?.startupDetails;
  const currentPlan: BusinessPlanSections = businessPlan || sd?.businessPlan || {};
  const projectFiles: ProjectFile[] = selectedEvent?.files || [];

  // Filter out deleted files: only show quotes whose associated file still exists in projectFiles
  const importedQuotes: SupplierQuoteData[] = (sd?.importedQuotes || []).filter(q => {
    if (q.savedFileId) {
      return projectFiles.some(f => f.id === q.savedFileId || f.systemFileId === q.savedFileId);
    }
    if (q.savedFileName) {
      return projectFiles.some(f => f.name === q.savedFileName || f.name.toLowerCase() === q.savedFileName.toLowerCase());
    }
    return projectFiles.some(f => 
      f.id === q.id || 
      (q.supplier && f.name.toLowerCase().includes(q.supplier.toLowerCase()))
    );
  });

  const [activeTab, setActiveTab] = useState<'exec' | 'market' | 'offering' | 'financials' | 'execution'>('exec');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [hoveredGuide, setHoveredGuide] = useState<string | null>(null);

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
      simpleExplanation: 'A brief summary of your whole business plan in simple everyday words. If an investor or banker only reads this one page, they will understand what you do, who buys from you, how much money you need, and how you will make a profit.',
      requiredItems: [
        'What your business does and why it exists',
        'Who your target customers are and what market gap you fill',
        'Total funding requested and what it will be used for',
        'Why your business will be profitable and successful'
      ],
      exampleSnippet: 'e.g., "EcoClean Ltd is an eco-friendly commercial cleaning enterprise in Castries seeking $65,000 in loan financing to procure specialized sanitation equipment, hire 4 staff, and service 35 commercial client facilities in Year 1..."',
      rows: 5
    },
    {
      key: 'businessDescription',
      label: 'Business Description',
      placeholder: 'Detail the business name, legal entity structure, founding history, registration details, and physical headquarters...',
      helper: 'Legal foundation and corporate identity of the enterprise.',
      simpleExplanation: 'The official background and identity of your company. In simple terms: State your registered business name, legal form (e.g., Sole Proprietorship, LLC, Partnership), physical operating address, and how/why you started.',
      requiredItems: [
        'Registered business name and trade name',
        'Legal structure (Sole Trader, LLC, Partnership, Non-Profit)',
        'Physical operating location and facility details',
        'Founding background, ownership breakdown, and mission statement'
      ],
      exampleSnippet: 'e.g., "Founded in 2024 as a registered limited liability company, EcoClean operates from a central facility on Bridge Street, Castries, providing certified green cleaning services..."',
      rows: 3
    },
    {
      key: 'businessObjectives',
      label: 'Business Objectives',
      placeholder: 'Specify 1-year, 3-year, and 5-year SMART objectives (e.g. revenue targets, unit output, regional expansion)...',
      helper: 'Quantifiable milestones demonstrating growth trajectory.',
      simpleExplanation: 'Your main goals and target milestones for the future. In simple terms: List clear, realistic targets you want to reach in Year 1, Year 3, and Year 5 (such as sales revenue, customer count, or opening new locations).',
      requiredItems: [
        'Year 1 Milestones (e.g., launch operations, secure first 30 corporate clients, achieve $85,000 revenue)',
        'Year 3 Milestones (e.g., achieve operational break-even, expand fleet, increase revenue to $240,000)',
        'Year 5 Milestones (e.g., regional island expansion, product line diversification, 20+ full-time employees)'
      ],
      exampleSnippet: 'e.g., "Year 1: Complete launch and achieve $85,000 in gross revenue. Year 3: Reach profitability with $250,000 annual revenue. Year 5: Expand operations island-wide..."',
      rows: 3
    },
    {
      key: 'problemOpportunity',
      label: 'Problem / Market Opportunity',
      placeholder: 'Identify the exact market pain point, unmet customer demand, or technological deficiency in the current landscape...',
      helper: 'Why this business must exist and why customers will switch.',
      simpleExplanation: 'The real problem or headache your customers face today, and why your product or service is the ideal solution they are eager to pay for.',
      requiredItems: [
        'The specific frustration, high cost, or poor quality customers currently endure',
        'Why existing competitors fail to solve this problem effectively',
        'How your product or service solves it better, faster, or more affordably'
      ],
      exampleSnippet: 'e.g., "Commercial properties currently rely on harsh chemical cleaners imported at high freight costs with 3-week delivery delays. Our locally produced eco-formulas deliver 48-hour fulfillment at 20% lower cost..."',
      rows: 3
    }
  ];

  const marketFields: SectionFieldDef[] = [
    {
      key: 'targetMarket',
      label: 'Target Market Definition',
      placeholder: 'Define the Total Addressable Market (TAM), Serviceable Addressable Market (SAM), and Serviceable Obtainable Market (SOM)...',
      helper: 'Market sizing and customer demographic parameters.',
      simpleExplanation: 'Who will buy from you and how large the market is. In simple terms: Explain who your customers are and estimate how many potential buyers exist in your area.',
      requiredItems: [
        'Description of customer groups (consumers, hotels, businesses, tourists)',
        'Geographic area served (local town, island-wide, or export markets)',
        'Estimated market size and annual spending in your sector'
      ],
      rows: 3
    },
    {
      key: 'customerProfile',
      label: 'Ideal Customer Profile (ICP)',
      placeholder: 'Describe target buyer personas, income brackets, B2B purchasing agents, decision criteria, and consumer habits...',
      helper: 'Who directly signs the check or authorizes payment.',
      simpleExplanation: 'A clear picture of your ideal buyer. In simple terms: Describe who makes the purchasing decision, what their budget is, and what matters most to them (price, speed, quality, convenience).',
      requiredItems: [
        'Key buyer demographics, income level, or corporate manager roles',
        'Primary purchasing motivations and pain points',
        'Where and how they discover new products or service providers'
      ],
      rows: 3
    },
    {
      key: 'marketAnalysis',
      label: 'Industry & Market Analysis',
      placeholder: 'Current trends, growth rates, regulatory environment, and tailwinds favoring this sector...',
      helper: 'Macroeconomic and industry sector validation.',
      simpleExplanation: 'The broader industry landscape. In simple terms: Explain whether your industry is growing, current market trends, and any government or economic factors supporting your growth.',
      requiredItems: [
        'Industry growth rates and consumer demand trends',
        'Government policies, green incentives, or tourism growth supporting the sector',
        'Market supply shortages or import substitution opportunities'
      ],
      rows: 4
    },
    {
      key: 'competitorAnalysis',
      label: 'Competitor Analysis',
      placeholder: 'List primary and secondary competitors, their market share, strengths, and identifiable weaknesses...',
      helper: 'Demonstrates thorough market awareness to investors.',
      simpleExplanation: 'Who else sells similar products. In simple terms: Name your main competitors in the market, what they do well, and where they fall short so you can win customers.',
      requiredItems: [
        'Names of direct competitors and indirect alternatives',
        'Competitor strengths (e.g. established brand, big budget)',
        'Competitor weaknesses (e.g. slow delivery, high prices, poor customer support)'
      ],
      rows: 4
    },
    {
      key: 'competitiveAdvantage',
      label: 'Competitive Advantage & Moat',
      placeholder: 'Highlight your proprietary technology, exclusive supplier quotes/agreements, locational superiority, or unit cost advantages...',
      helper: 'What prevents competitors from copying your success.',
      simpleExplanation: 'Why customers will choose you over competitors. In simple terms: Your unique edge or "secret sauce" that makes you better and hard to copy.',
      requiredItems: [
        'Your unique selling proposition (USP)',
        'Cost advantage, proprietary methods, or exclusive supplier pricing',
        'Superior customer service, faster turnaround, or local presence'
      ],
      rows: 3
    }
  ];

  const offeringFields: SectionFieldDef[] = [
    {
      key: 'productsServices',
      label: 'Products & Services Portfolio',
      placeholder: 'Comprehensive breakdown of products or service packages offered, specifications, packaging, and warranties...',
      helper: 'Detailed technical or commercial catalog of offerings.',
      simpleExplanation: 'The complete lineup of what you sell. In simple terms: Describe each product or service package, what features it includes, and how it is packaged or delivered.',
      requiredItems: [
        'Complete list of product items or service packages',
        'Key features, specifications, and volume options',
        'Warranties, guarantees, or after-sales customer support'
      ],
      rows: 4
    },
    {
      key: 'businessModel',
      label: 'Business Model',
      placeholder: 'How the organization creates, delivers, and captures value (e.g. direct-to-consumer, B2B wholesale, subscription, retail distribution)...',
      helper: 'The fundamental commercial engine of the company.',
      simpleExplanation: 'How your business operates and creates value. In simple terms: Explain whether you sell direct to consumers (B2C), wholesale to retailers (B2B), online, or through subscriptions.',
      requiredItems: [
        'Core commercial channel (B2B wholesale, retail, direct-to-consumer)',
        'Order-to-cash workflow',
        'Value delivered at each customer touchpoint'
      ],
      rows: 3
    },
    {
      key: 'revenueModel',
      label: 'Revenue Model & Monetization',
      placeholder: 'Primary revenue streams, pricing tiers, payment terms, billing cadence, and repeat purchase dynamics...',
      helper: 'How money flows into the corporate bank accounts.',
      simpleExplanation: 'How money flows into your company. In simple terms: Explain your pricing tiers, payment terms (cash on delivery, 30-day invoice), and recurring purchase opportunities.',
      requiredItems: [
        'Primary revenue sources and pricing structure',
        'Payment terms (e.g., upfront payment, milestone billing, credit terms)',
        'Repeat customer frequency and retention expectations'
      ],
      rows: 3
    },
    {
      key: 'marketingSalesStrategy',
      label: 'Marketing & Sales Strategy',
      placeholder: 'Customer acquisition channels, direct sales team structure, digital advertising, partner referrals, and launch campaigns...',
      helper: 'Actionable customer acquisition pipeline.',
      simpleExplanation: 'How you will attract customers and make sales. In simple terms: Describe your promotional methods, social media, sales reps, word-of-mouth, and opening launch campaign.',
      requiredItems: [
        'Customer acquisition channels (social media, Google, direct sales, flyers)',
        'Grand opening promotional campaign and introductory offers',
        'Sales pipeline and lead conversion process'
      ],
      rows: 4
    },
    {
      key: 'operationsPlan',
      label: 'Operations Plan',
      placeholder: 'Day-to-day workflow, physical facility requirements, production processes, fulfillment, quality control, and customer service...',
      helper: 'How orders are fulfilled seamlessly from quote to delivery.',
      simpleExplanation: 'How your business runs day-to-day. In simple terms: Describe the step-by-step workflow from receiving a customer order to producing and delivering the goods.',
      requiredItems: [
        'Step-by-step daily production and delivery workflow',
        'Operating hours, facility location, and storage capacity',
        'Quality control standards and customer service response process'
      ],
      rows: 4
    },
    {
      key: 'equipmentTechRequirements',
      label: 'Equipment & Technology Requirements',
      placeholder: 'Commercial machinery, IT software, POS systems, specialized tooling, vehicles, and digital infrastructure...',
      helper: 'Capital assets necessary for production capacity.',
      simpleExplanation: 'The machinery, tools, and software needed to run your business. In simple terms: List all major machines, delivery vehicles, POS software, and computers required.',
      requiredItems: [
        'Commercial machinery and production tooling with capacity specs',
        'Vehicles or specialized logistics transport',
        'Software, inventory management, and POS billing systems'
      ],
      rows: 3
    },
    {
      key: 'suppliers',
      label: 'Suppliers & Supply Chain Partners',
      placeholder: 'Key material vendors, equipment manufacturers, shipping logistics partners, backup suppliers, and verified credit terms...',
      helper: 'Demonstrates procurement resilience and quote verification.',
      simpleExplanation: 'Your key vendors and material suppliers. In simple terms: Name the companies supplying your raw materials or equipment, their reliability, and agreed credit terms.',
      requiredItems: [
        'Primary suppliers and equipment vendors (linked to attached quotes)',
        'Backup suppliers to prevent shortages or delays',
        'Delivery lead times and negotiated payment terms'
      ],
      rows: 3
    },
    {
      key: 'managementStaffing',
      label: 'Management Team & Key Staffing',
      placeholder: 'Bios of founders, key directors, advisors, technical specialists, and planned staffing headcount...',
      helper: 'Underwriters invest in experienced, execution-oriented operators.',
      simpleExplanation: 'The people running the business. In simple terms: Highlight the skills and background of the founders/managers, and list the staff roles you will hire.',
      requiredItems: [
        'Founder & key manager profiles with relevant industry experience',
        'Staffing roles, job titles, and planned headcount',
        'Professional advisors (accountants, legal counsel, technical consultants)'
      ],
      rows: 3
    }
  ];

  const financialFields: SectionFieldDef[] = [
    {
      key: 'startupRequirements',
      label: 'Startup Requirements & Initial Outlay',
      placeholder: 'Initial capital equipment, security deposits, incorporation legal fees, licensing, and starting inventory...',
      helper: 'Pre-operational one-time expenditures required to open doors.',
      simpleExplanation: 'One-time costs needed before opening your doors. In simple terms: Total up everything needed to get started (equipment purchases, rent deposits, renovations, licenses, initial stock).',
      requiredItems: [
        'Capital equipment and machinery outlay',
        'Facility lease deposit and renovation fit-out costs',
        'Legal incorporation fees, trade licenses, and initial inventory stock'
      ],
      rows: 3
    },
    {
      key: 'fundingRequirements',
      label: 'Total Funding Requested',
      placeholder: 'Total capital requested (e.g. $150,000 commercial term loan / $50,000 equity injection), requested repayment tenure, and grace period...',
      helper: 'The clear, explicit funding ask submitted to the review board.',
      simpleExplanation: 'The exact financing amount you are asking for. In simple terms: State how much money you need (loan, grant, or equity) and your preferred repayment period.',
      requiredItems: [
        'Exact dollar amount of capital requested',
        'Type of funding (commercial loan, grant, equity investment)',
        'Proposed loan tenure (e.g. 5-year repayment) and requested grace period'
      ],
      rows: 3
    },
    {
      key: 'useOfFunds',
      label: 'Use of Funds & Capital Allocation',
      placeholder: 'Specific line-by-line breakdown of how funding proceeds will be disbursed (e.g. 50% equipment, 25% working capital, 15% inventory, 10% marketing)...',
      helper: 'Ensures funds are allocated solely to productive assets.',
      simpleExplanation: 'How every single dollar of the funding will be spent. In simple terms: Provide a clear breakdown showing lenders that funds will buy productive equipment and assets.',
      requiredItems: [
        'Specific equipment and asset purchases with exact dollar amounts',
        'Raw material and inventory initial purchases',
        'Working capital reserve for the first 3-6 months of operation',
        'Marketing, branding, and opening launch budget'
      ],
      rows: 4
    },
    {
      key: 'financialRequirements',
      label: 'Financial Assumptions & Unit Economics',
      placeholder: 'Commentary on underlying unit cost assumptions, gross margins, payment cycles, and debtor/creditor terms...',
      helper: 'Narrative supporting the Interactive Costing figures.',
      simpleExplanation: 'The assumptions behind your financial figures. In simple terms: Explain your product profit margins, production costs, and expected payment collection timing.',
      requiredItems: [
        'Product sale prices and gross profit margin percentages',
        'Raw material costs and cost-of-goods-sold (COGS) assumptions',
        'Cash flow buffer and accounts receivable payment timing'
      ],
      rows: 3
    },
    {
      key: 'salesRevenueProjectionsNotes',
      label: 'Sales Projections Commentary',
      placeholder: 'Justification for monthly volume expansion, seasonality factors, and Year 3 / Year 5 growth rates...',
      helper: 'Context for credit analysts reviewing the P&L table.',
      simpleExplanation: 'Explanation of your sales forecast. In simple terms: Explain why you believe your sales will grow year-over-year, and mention any busy or slow seasons.',
      requiredItems: [
        'Justification for sales growth from Year 1 through Year 5',
        'Seasonal volume swings (e.g. tourist peak seasons, holidays)',
        'Production capacity limits and plans for scaling output'
      ],
      rows: 3
    },
    {
      key: 'operatingCostsNotes',
      label: 'Operating Overhead Budget Commentary',
      placeholder: 'Explanation of rent escalations, staff salary benchmarks, and utility containment strategies...',
      helper: 'Validates the monthly operating expenses entered below.',
      simpleExplanation: 'Explanation of your monthly overheads and bills. In simple terms: Justify your monthly expenses such as rent, salaries, utilities, marketing, and insurance.',
      requiredItems: [
        'Rent and utility expense estimates based on facility size',
        'Staff wages, salaries, and statutory benefit allowances',
        'Marketing, insurance, and routine administrative costs'
      ],
      rows: 3
    }
  ];

  const executionFields: SectionFieldDef[] = [
    {
      key: 'implementationPlan',
      label: 'Implementation & Launch Plan',
      placeholder: 'Phase-by-phase roadmap from funding disbursement through facility fit-out, supplier delivery, testing, and grand opening...',
      helper: 'Timeline establishing operational readiness.',
      simpleExplanation: 'Your timeline to get the business open and running. In simple terms: List the key steps in order from receiving the funding to your grand opening day.',
      requiredItems: [
        'Phase 1: Securing funds, ordering equipment, and signing premises lease',
        'Phase 2: Facility renovations, equipment installation, and staff onboarding',
        'Phase 3: Trial production runs, soft launch, and official grand opening'
      ],
      rows: 4
    },
    {
      key: 'milestonesNotes',
      label: 'Critical Milestones & Success Metrics',
      placeholder: 'Key performance indicators (KPIs), break-even date, regulatory approvals, and first commercial sales target...',
      helper: 'Measurable checkpoints tracked by stakeholders.',
      simpleExplanation: 'Key checkpoints to measure your progress. In simple terms: List major milestone dates like opening day, first 100 sales, hiring key staff, and reaching break-even.',
      requiredItems: [
        'Official commercial launch / grand opening date',
        'Target date to reach cash flow break-even',
        'Key sales volume checkpoints and customer acquisition targets'
      ],
      rows: 3
    },
    {
      key: 'risksMitigation',
      label: 'Risk Analysis & Mitigation Strategies',
      placeholder: 'Identify financial, operational, supply chain, and regulatory risks, paired with concrete preventative counteractions...',
      helper: 'Critical risk disclosure mandatory for commercial bank approval.',
      simpleExplanation: 'What could go wrong and how you will handle it. In simple terms: Identify potential challenges (e.g. shipping delays, cost increases, slow sales) and your exact backup plans.',
      requiredItems: [
        'Top operational, financial, and supply chain risks identified',
        'Concrete backup plans and preventive actions for each risk',
        'Emergency cash reserves and insurance coverage safeguards'
      ],
      rows: 4
    },
    {
      key: 'conclusion',
      label: 'Conclusion & Summary Statement',
      placeholder: 'Final closing pitch highlighting return on investment, economic development impact, job creation, and request for credit approval...',
      helper: 'The closing endorsement summarizing the opportunity.',
      simpleExplanation: 'Your closing summary to the reader. In simple terms: Summarize why this business is a sound investment, the positive economic impact (like jobs created), and ask for approval.',
      requiredItems: [
        'Summary of business viability, profitability, and loan serviceability',
        'Local economic impact (jobs created, local supply chain support)',
        'Formal closing request for funding or credit committee approval'
      ],
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
            onClick={openImport}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all"
          >
            <Upload size={14} />
            Import Supplier Quote (Ollama)
          </button>

          <button
            type="button"
            onClick={openExport}
            className="px-3.5 py-2 bg-white hover:bg-stone-100 text-stone-900 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-all"
          >
            <Download size={14} />
            Export Business Plan (.docx)
          </button>
        </div>
      </div>

      {/* Imported Quotes Bar (if any non-deleted quotes exist) */}
      {importedQuotes.length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-700" />
              <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                Attached Supplier Quotes ({importedQuotes.length})
              </h4>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToDocuments?.()}
              className="text-[11px] text-emerald-800 hover:text-emerald-950 font-medium flex items-center gap-1 hover:underline cursor-pointer group transition-colors"
              title="Open Project Documents page"
            >
              <span>Preserved in <strong className="font-semibold underline decoration-emerald-500/50">Project → Documents</strong></span>
              <ExternalLink size={12} className="text-emerald-700 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {importedQuotes.map((q, i) => {
              const matchingFile = projectFiles.find(f => 
                f.id === q.savedFileId || 
                f.systemFileId === q.savedFileId || 
                (q.savedFileName && (f.name === q.savedFileName || f.name.toLowerCase() === q.savedFileName.toLowerCase())) || 
                f.id === q.id
              );

              return (
                <div
                  key={q.id || i}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (matchingFile && onOpenFile) {
                      onOpenFile(matchingFile);
                    } else {
                      onNavigateToDocuments?.(q.savedFileId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (matchingFile && onOpenFile) {
                        onOpenFile(matchingFile);
                      } else {
                        onNavigateToDocuments?.(q.savedFileId);
                      }
                    }
                  }}
                  title={matchingFile ? `Click to open "${matchingFile.name}" in Project Documents` : 'Click to view in Project Documents'}
                  className="bg-white hover:bg-emerald-50/40 border border-emerald-200/80 hover:border-emerald-400 rounded-xl p-3 text-xs flex items-center justify-between shadow-2xs hover:shadow-sm cursor-pointer transition-all duration-150 group"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <FileText size={14} />
                    </div>
                    <div className="space-y-0.5 truncate">
                      <p className="font-bold text-stone-900 group-hover:text-emerald-900 transition-colors truncate">
                        {q.supplierName || q.supplier}
                      </p>
                      <p className="text-[10px] text-stone-500 truncate">
                        Ref: {q.quoteNumber || 'N/A'} • {q.quoteDate || 'Recent'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-800 text-xs">
                      ${(q.total || 0).toFixed(2)}
                    </span>
                    <ExternalLink size={12} className="text-stone-400 group-hover:text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              );
            })}
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
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-stone-150 gap-4">
          <div 
            className="relative group/header inline-block"
            onMouseEnter={() => setHoveredGuide(`section_${activeTab}`)}
            onMouseLeave={() => setHoveredGuide(null)}
          >
            <div className="flex items-center gap-2 cursor-help select-none">
              <h4 className="text-sm font-bold text-stone-900 group-hover/header:text-emerald-800 transition-colors flex items-center gap-1.5">
                <span>{SECTION_GUIDES[activeTab].title}</span>
                <Info size={15} className="text-emerald-600/80 group-hover/header:text-emerald-600 transition-colors shrink-0" />
              </h4>
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200/70 transition-colors hidden sm:inline-flex items-center gap-1 shadow-2xs">
                <Sparkles size={10} className="text-emerald-600" />
                <span>Hover for Guide</span>
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Enter your actual project data. In the exported document, only sections with content are included.
            </p>

            {/* Popup Window on Mouse Roll Over Section Heading */}
            <div 
              className={`absolute left-0 top-full mt-2 w-84 sm:w-[500px] max-w-[92vw] bg-stone-950/95 text-white rounded-2xl p-4 shadow-2xl border border-emerald-500/40 text-xs space-y-3 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                hoveredGuide === `section_${activeTab}`
                  ? 'opacity-100 translate-y-0 visible scale-100'
                  : 'opacity-0 translate-y-1 invisible scale-98 group-hover/header:opacity-100 group-hover/header:translate-y-0 group-hover/header:visible group-hover/header:scale-100'
              }`}
            >
              <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <Sparkles size={13} />
                  </div>
                  <div>
                    <h5 className="font-bold text-white text-xs leading-tight">{SECTION_GUIDES[activeTab].title}</h5>
                    <span className="text-[10px] text-emerald-400 font-medium">{SECTION_GUIDES[activeTab].subtitle}</span>
                  </div>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  Section Overview
                </span>
              </div>

              <div className="space-y-1 bg-stone-900/90 rounded-xl p-3 border border-stone-800">
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider block">
                  In Simple Terms:
                </span>
                <p className="text-stone-200 text-xs leading-relaxed">
                  {SECTION_GUIDES[activeTab].simpleExplanation}
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider block">
                  What is Required for this Section:
                </span>
                <ul className="space-y-1.5 text-[11px] text-stone-300">
                  {SECTION_GUIDES[activeTab].requiredItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <Check size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {SECTION_GUIDES[activeTab].tips && (
                <div className="flex items-center gap-2 pt-2 border-t border-stone-800 text-[10.5px] text-stone-300">
                  <Lightbulb size={13} className="text-amber-400 shrink-0" />
                  <span><strong>Tip:</strong> {SECTION_GUIDES[activeTab].tips}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={scrollToCosting}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 underline"
            >
              Interactive Sale Price Costing <ChevronRight size={13} />
            </button>
            <span className="text-[11px] text-stone-400 font-mono">
              {saveStatus === 'saving' ? 'Saving...' : 'Auto-saved'}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          {currentTabFields.map((field) => {
            const val = (currentPlan[field.key] as string) || '';
            const isFilled = val.trim().length > 0;

            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  {/* Field Label with Mouse Rollover Popup */}
                  <div 
                    className="relative group/field inline-block"
                    onMouseEnter={() => setHoveredGuide(field.key)}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5 cursor-help hover:text-emerald-800 transition-colors py-0.5 select-none">
                      <span>{field.label}</span>
                      <Info size={13} className="text-stone-400 group-hover/field:text-emerald-600 transition-colors shrink-0" />
                      {isFilled && <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />}
                    </label>

                    {/* Floating Popup Window for this Input Heading */}
                    <div 
                      className={`absolute left-0 top-full mt-1.5 w-80 sm:w-[450px] max-w-[90vw] bg-stone-950/95 text-white rounded-2xl p-4 shadow-2xl border border-emerald-500/40 text-xs space-y-2.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                        hoveredGuide === field.key
                          ? 'opacity-100 translate-y-0 visible scale-100'
                          : 'opacity-0 translate-y-1 invisible scale-98 group-hover/field:opacity-100 group-hover/field:translate-y-0 group-hover/field:visible group-hover/field:scale-100'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                        <div className="flex items-center gap-1.5">
                          <Info size={13} className="text-emerald-400" />
                          <h5 className="font-bold text-white text-xs">{field.label}</h5>
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                          Simple Input Guide
                        </span>
                      </div>

                      <div className="space-y-1 bg-stone-900/90 rounded-xl p-2.5 border border-stone-800/80">
                        <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider block">
                          In Simple Terms:
                        </span>
                        <p className="text-stone-200 text-[11.5px] leading-relaxed">
                          {field.simpleExplanation}
                        </p>
                      </div>

                      {field.requiredItems && field.requiredItems.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider block">
                            What is Required for this Input:
                          </span>
                          <ul className="space-y-1 text-[11px] text-stone-300">
                            {field.requiredItems.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <Check size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {field.exampleSnippet && (
                        <div className="pt-2 border-t border-stone-800 text-[10.5px] text-stone-300">
                          <span className="font-bold text-emerald-400 block text-[10px] mb-0.5">Example / Practical Prompt:</span>
                          <p className="text-stone-300 italic">{field.exampleSnippet}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] text-stone-400 font-mono">
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
                onClick={openExport}
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
