export type BusinessCopilotMode = 'explain' | 'audit' | 'scenario' | 'action';

export type BusinessCopilotSeverity = 'info' | 'warning' | 'error';

export type BusinessCopilotSourceType =
  | 'plan'
  | 'forecast'
  | 'validation'
  | 'document'
  | 'user'
  | 'ai';

export interface BusinessCopilotLocation {
  page: string;
  workflowStep?: string | number;
  section?: string;
  selectedEntityId?: string;
}

export interface BusinessCopilotDocumentRef {
  id: string;
  name: string;
  type?: string;
  date?: string;
  summary?: string;
}

export interface BusinessCopilotMetricSnapshot {
  revenue?: number;
  cogs?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  operatingExpenses?: number;
  depreciation?: number;
  netProfit?: number;
  netMarginPercent?: number;
  cashFlow?: number;
  endingCashBalance?: number;
}

export interface BusinessCopilotContext {
  projectId?: string;
  location: BusinessCopilotLocation;

  business: {
    name?: string;
    businessModelType?: string;
    operatingModel?: string;
    displayCurrency: 'USD' | 'XCD';
    exchangeRate: number;
  };

  services?: Array<{
    id: string;
    name: string;
    revenueModel: string;
    unitLabel: string;
    currency: 'USD' | 'XCD';
    rate: number;
    expectedVolume: number;
    unitsPerBooking?: number;
    directCostPerUnitOrJob?: number;
    monthlyGrowthRatePercent?: number;
  }>;

  costs?: Array<{
    id: string;
    name: string;
    classification: string;
    category?: string;
    currency: 'USD' | 'XCD';
    amount: number;
    directCostBasis?: string;
    notes?: string;
  }>;

  capacity?: {
    staff?: Record<string, unknown>;
    equipment?: Record<string, unknown>;
  };

  loan?: Record<string, unknown>;

  forecast?: {
    month1?: BusinessCopilotMetricSnapshot & {
      serviceBookingEquivalents?: number;
      billableHoursOrJobs?: number;
      salesVolumeUnits?: number;
    };
    year1?: BusinessCopilotMetricSnapshot;
    year3?: BusinessCopilotMetricSnapshot;
    year5?: BusinessCopilotMetricSnapshot;
    breakEven?: {
      monthlyFixedCosts: number;
      averageContributionMarginPercent: number;
      breakEvenRevenueMonthly: number;
      breakEvenUnitsMonthly: number;
      breakEvenMetricLabel: string;
      unitPrice: number;
      unitVariableCost: number;
      unitContributionMargin: number;
      safetyMarginPercent: number;
    };
  };

  validation?: {
    errors: Array<{ id: string; title: string; message: string; recommendation?: string }>;
    warnings: Array<{ id: string; title: string; message: string; recommendation?: string }>;
    info: Array<{ id: string; title: string; message: string; recommendation?: string }>;
  };

  narrative?: Record<string, string | undefined>;
  documents?: BusinessCopilotDocumentRef[];
}

export interface BusinessCopilotObservation {
  severity: BusinessCopilotSeverity;
  text: string;
  metricId?: string;
}

export interface BusinessCopilotCalculation {
  label: string;
  formula?: string;
  value: string;
}

export interface BusinessCopilotSource {
  type: BusinessCopilotSourceType;
  label: string;
  documentId?: string;
}

export interface BusinessCopilotProposal {
  id: string;
  title: string;
  reason: string;
  requiresConfirmation: true;
  actions: Array<{
    type: string;
    targetId?: string;
    fields?: Record<string, unknown>;
  }>;
  impact?: {
    before?: Record<string, number>;
    after?: Record<string, number>;
  };
}

export interface BusinessCopilotResponse {
  message: string;
  mode: BusinessCopilotMode;
  observations?: BusinessCopilotObservation[];
  calculations?: BusinessCopilotCalculation[];
  sources?: BusinessCopilotSource[];
  proposals?: BusinessCopilotProposal[];
  suggestedPrompts?: string[];
  provider?: 'ollama' | 'gemini' | 'deterministic';
  model?: string;
}

export interface BusinessCopilotRequest {
  message: string;
  context: BusinessCopilotContext;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}
