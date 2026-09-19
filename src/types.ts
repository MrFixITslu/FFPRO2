
export type TransactionType = 'expense' | 'income' | 'savings' | 'withdrawal' | 'transfer';
export type InstitutionType = 'bank' | 'credit_union' | 'investment';

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'collaborator';
  avatar?: string;
  online: boolean;
}

export interface StoredUser {
  username: string;
  password?: string; // Only stored locally for this demo
  role: 'admin' | 'collaborator';
  createdAt: string;
}

export interface LineItem {
  name: string;
  price: number;
  quantity?: number;
}

export interface BankConnection {
  institution: string;
  institutionType: InstitutionType;
  status: 'linked' | 'unlinked' | 'syncing';
  lastSynced?: string;
  accountLastFour?: string;
  openingBalance: number;
}

export interface Holding {
  symbol: string;
  quantity: number;
  purchasePrice: number;
}

export interface InvestmentAccount {
  id: string;
  provider: 'Binance' | 'Vanguard';
  name: string;
  holdings: Holding[];
}

export interface MarketPrice {
  symbol: string;
  price: number;
  change24h: number;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  type: TransactionType;
  notes?: string;
  vendor?: string;
  lineItems?: LineItem[];
  recurringId?: string;
  savingGoalId?: string;
  institution?: string;
  destinationInstitution?: string; 
}

export interface PortfolioUpdate {
  symbol: string;
  quantity: number;
  provider: 'Binance' | 'Vanguard';
}

export interface AIAnalysisResult {
  updateType: 'transaction' | 'portfolio';
  transaction?: {
    amount: number;
    category: string;
    description: string;
    type: TransactionType;
    notes?: string;
    date?: string;
    vendor?: string;
    lineItems?: LineItem[];
  };
  portfolio?: PortfolioUpdate;
}

export interface SavingGoal {
  id: string;
  name: string;
  institution: string;
  institutionType: 'bank' | 'credit_union';
  targetAmount: number;
  currentAmount: number;
  openingBalance: number;
  category: string;
}

export interface InvestmentGoal {
  id: string;
  name: string;
  targetAmount: number;
  provider: string;
}

export interface RecurringExpense {
  id: string;
  amount: number;
  category: string;
  description: string;
  dayOfMonth: number;
  nextDueDate: string; 
  accumulatedOverdue: number; 
  lastBilledDate?: string;
  externalPortalUrl?: string; 
  externalSyncEnabled?: boolean;
  isSubscription?: boolean;
}

export interface RecurringIncome {
  id: string;
  amount: number;
  category: string;
  description: string;
  dayOfMonth: number;
  nextConfirmationDate: string; 
  lastConfirmedDate?: string;
  accumulatedReceived?: number; 
}

export interface Contact {
  id: string;
  name: string;
  number: string;
  email: string;
  address?: string;
}

export interface ProjectNote {
  id: string;
  text: string;
  timestamp: string;
  authorId: string;
  version: number;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue' | 'blocked';
export type ReminderOption = 'none' | '30m' | '1h' | '1d' | '2d' | '1w' | 'custom';

export interface TaskActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
}

export interface ProjectTask {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  dueTime?: string;
  startDate?: string;
  startTime?: string;
  completionDate?: string;
  assignedToId?: string;
  subTasks?: ProjectTask[];
  
  // Enhanced Planner Fields
  description?: string;
  notes?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dependencies?: string[]; // IDs of tasks this task depends on (prerequisites)
  reminder?: ReminderOption;
  customReminderOffsetMinutes?: number;
  repeatInterval?: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually';
  repeatReminder?: 'none' | '30m' | '1h' | '1d' | '2d' | '1w';
  tags?: string[];
  order?: number;
  activityHistory?: TaskActivityLog[];
}

export interface ProjectFile {
  id: string;
  name: string;
  type: string;
  size: number;
  timestamp: string;
  storageRef: string;
  storageType: 'database' | 'indexeddb' | 'filesystem' | 'url';
  version: number;
  lastModifiedBy: string;
  systemFileId?: string;
  downloadUrl?: string;
  viewUrl?: string;
}

export interface IOU {
  id: string;
  contactId: string;
  amount: number;
  description: string;
  type: 'debt' | 'claim';
  settled: boolean;
}

export interface EventLog {
  id: string;
  action: string;
  timestamp: string;
  username: string;
  type: 'system' | 'transaction' | 'task' | 'file' | 'team' | 'contact' | 'note';
  details?: string;
}

export interface TripPlanDetails {
  destination: string;
  startDate?: string;
  endDate?: string;
  flightCost: number;
  flightNotes?: string;
  flightBooked: boolean;
  accommodationCost: number;
  accommodationNotes?: string;
  accommodationBooked: boolean;
  transportType: 'taxi' | 'rental' | 'public' | 'none';
  transportCost: number;
  transportNotes?: string;
  transportBooked: boolean;
  foodCost: number;
  foodNotes?: string;
  sitesCost: number;
  sitesNotes?: string;
  savingMode: 'save' | 'book';
  targetDate?: string;
  amountSaved: number;
}

export interface ProductionItem {
  id: string;
  name: string;
  cost: number;
  description?: string;
  quantity?: number;
  unitCost?: number;
  discount?: number;
  shippingCost?: number;
  supplier?: string;
  sourceQuoteId?: string;
  isRecurring?: boolean;
  costType?: 'one-time' | 'recurring';
}

export interface ExtractedQuoteItem {
  item: string;
  description?: string;
  quantity: number;
  unitCost: number;
  discount?: number;
  shippingCost?: number;
  lineTotal: number;
}

export interface SupplierQuoteData {
  id: string;
  supplier: string;
  supplierName?: string;
  quoteNumber: string;
  quoteDate: string;
  currency: string;
  items: ExtractedQuoteItem[];
  discounts?: number;
  shippingCosts?: number;
  subtotal?: number;
  total?: number;
  commercialTerms?: string;
  savedFileId?: string;
  savedFileName?: string;
  importedAt?: string;
}

export interface BusinessPlanSections {
  executiveSummary?: string;
  businessDescription?: string;
  businessObjectives?: string;
  productsServices?: string;
  problemOpportunity?: string;
  targetMarket?: string;
  customerProfile?: string;
  marketAnalysis?: string;
  competitorAnalysis?: string;
  competitiveAdvantage?: string;
  businessModel?: string;
  revenueModel?: string;
  marketingSalesStrategy?: string;
  operationsPlan?: string;
  equipmentTechRequirements?: string;
  suppliers?: string;
  managementStaffing?: string;
  startupRequirements?: string;
  financialRequirements?: string;
  salesRevenueProjectionsNotes?: string;
  operatingCostsNotes?: string;
  fundingRequirements?: string;
  useOfFunds?: string;
  implementationPlan?: string;
  milestonesNotes?: string;
  risksMitigation?: string;
  conclusion?: string;

  // Cover page & official submission metadata
  companyName?: string;
  businessPlanTitle?: string;
  preparedBy?: string;
  contactEmail?: string;
  contactPhone?: string;
  businessAddress?: string;
  websiteUrl?: string;
  preparedDate?: string;
  fundingAgencyOrBank?: string;
}

export interface OperatingExpenseItem {
  id: string;
  name: string;
  amount: number;
  category?: string;
}

export type BusinessModelType = 'goods' | 'services' | 'both';
export type GoodsBusinessType = 'make' | 'resell';
export type ServiceRevenueModel = 'hourly' | 'project' | 'retainer' | 'subscription' | 'commission' | 'rental';

export type CostItemClassification = 
  | 'equipment'   // Reusable Equipment (Cash on purchase, straight-line depreciation over useful life)
  | 'stock'       // Stock / Raw Materials (Cash on purchase, COGS upon sale, carries inventory)
  | 'direct'      // Cost per Sale / Service (Direct variable cost at time of sale/job)
  | 'operating'   // Recurring Operating Expense (Rent, utilities, subscriptions, insurance)
  | 'setup';      // One-Time Setup Expense (Deposits, licenses, launch branding)

export interface StartupCostItem {
  id: string;
  name: string;
  classification: CostItemClassification;
  category?: string;
  notes?: string;

  // Reusable Equipment fields
  purchaseCost?: number;
  residualValue?: number;
  usefulLifeYears?: number;
  purchaseMonth?: number; // 1-12 in Year 1 (default 1)
  
  // Equipment Rental Revenue Generator (Decision 2)
  isRentalRevenueGenerator?: boolean;
  rentalUnitsOwned?: number;
  rentalAvailableTimePerUnit?: number; // e.g. 30 days or 160 hours per month
  rentalUtilisationPercent?: number;  // e.g. 60%
  rentalRatePerUnit?: number;         // e.g. $150/day or $45/hour
  rentalTimeUnit?: 'days' | 'hours';

  // Stock / Raw Materials fields
  stockQuantity?: number;
  stockUnitCost?: number;
  stockReorderPoint?: number;
  initialStockUnits?: number;
  monthlyRestockUnits?: number;
  unitsConsumedPerProduct?: number; // units needed per finished goods sale

  // Cost per Sale / Service (Direct variable cost)
  directCostPerUnitOrJob?: number;

  // Recurring Operating Expense fields
  monthlyExpenseAmount?: number;
  isMaintenanceForEquipmentId?: string;

  // One-Time Setup Expense fields
  setupExpenseAmount?: number;
  setupMonth?: number; // 1-12 in Year 1 (default 1)

  // Legacy / generic compatibility
  amount?: number;
  quantity?: number;
  unitCost?: number;
  isRecurring?: boolean;
}

export interface GoodsProduct {
  id: string;
  name: string;
  sellingPrice: number;
  monthlySalesVolume: number;
  monthlyGrowthRatePercent?: number; // month-over-month growth % in Year 1
  annualGrowthRatePercent?: number;  // annual growth % for Years 2-5
  unitCost?: number;
  costItems?: StartupCostItem[];
  // legacy compatibility
  cogs?: number;
  rawMaterials?: any[];
}

export interface ServiceOffering {
  id: string;
  name: string;
  revenueModel: ServiceRevenueModel;
  rate: number; // hourly rate, project fee, monthly retainer, subscription fee, rental daily/hourly rate
  monthlyCapacityUnits?: number; // hours, projects, clients, subscribers, rental days
  expectedVolume?: number; // expected monthly units/hours/clients
  utilisationPercent?: number; // %
  monthlyGrowthRatePercent?: number; // month-over-month growth % in Year 1
  annualGrowthRatePercent?: number;  // annual growth % for Years 2-5
  directCostPerUnitOrJob?: number;
  costItems?: StartupCostItem[];
}

export interface ServiceCapacityPlan {
  resourceType: 'staff' | 'equipment';
  resourceCount: number; // staff members or equipment units
  availableTimePerResource: number; // hours per month or days per month
  targetUtilisationPercent: number; // e.g. 75%
  hourlyOrDailyRate?: number;
}

export interface MonthlyForecastMonth {
  month: number; // 1 to 12
  monthName: string;
  revenue: number;
  goodsRevenue: number;
  servicesRevenue: number;
  rentalRevenue: number;
  cogs: number; // direct cost of sales / goods / services
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number; // recurring op-ex + this month's one-time setup expenses
  recurringExpenses: number;
  setupExpenses: number;
  depreciation: number;
  netProfit: number;
  netMarginPercent: number;
  // Cash Flow
  cashInflow: number;
  cashOutflow: number;
  cashPurchasesEquipment: number;
  cashPurchasesStock: number;
  cashDirectCosts: number;
  cashOperatingExpenses: number;
  cashFlow: number; // net cash change for month
  endingCashBalance: number;
  endingInventoryValue: number;
  endingInventoryUnits: number;
  // Breakdown by items
  salesVolumeUnits: number;
  billableHoursOrJobs: number;
}

export interface YearlyForecastSummary {
  year: number; // 1 to 5
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  depreciation: number;
  netProfit: number;
  netMarginPercent: number;
  cashFlow: number;
  endingCashBalance: number;
}

export interface BreakEvenResult {
  monthlyFixedCosts: number;
  averageContributionMarginPercent: number;
  breakEvenRevenueMonthly: number;
  breakEvenUnitsMonthly: number;
  breakEvenMetricLabel: string; // e.g. "units", "billable hours", "projects", "clients", "subscribers", "rental days"
  unitPrice: number;
  unitVariableCost: number;
  unitContributionMargin: number;
  safetyMarginPercent: number;
}

export interface StartupPlanDetails {
  cogs: number;
  markup: number;
  monthlyVolume: number;
  rent: number;
  salaries: number;
  marketing: number;
  utilities: number;
  otherExpenses: number;
  customExpenses?: OperatingExpenseItem[];
  growthRateYear3: number;
  growthRateYear5: number;
  
  // Sale Price Calculator Fields
  productionItems?: ProductionItem[];
  derivedUnits?: number;
  hourlyRate?: number;
  laborHours?: number;
  desiredProfitType?: 'percentage' | 'fixed';
  desiredProfitValue?: number;
  includeVat?: boolean;
  includeLevy?: boolean;
  contingencyPercent?: number;
  allocateOverhead?: boolean;

  // Comprehensive Funding-Ready Business Plan
  businessPlan?: BusinessPlanSections;
  importedQuotes?: SupplierQuoteData[];

  // Additive Item-Driven Business Model fields
  businessModelType?: BusinessModelType;
  goodsType?: GoodsBusinessType;
  goodsProducts?: GoodsProduct[];
  serviceOfferings?: ServiceOffering[];
  serviceCapacityPlan?: ServiceCapacityPlan;
  costItems?: StartupCostItem[];
  startingCash?: number;
}

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface ProjectMember {
  userId: string;
  email: string;
  username: string | null;
  displayName: string | null;
  role: ProjectRole;
  addedAt: string;
}

export interface ProjectInvite {
  id: string;
  projectId: string;
  email: string;
  role: ProjectRole;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  acceptedAt: string | null;
}

export interface ProjectChatMessage {
  id: string;
  projectId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface BudgetEvent {
  id: string;
  name: string;
  date: string;
  items: EventItem[];
  notes: ProjectNote[];
  tasks: ProjectTask[];
  files: ProjectFile[];
  contactIds: string[];
  memberUsernames: string[]; 
  ious: IOU[];
  logs?: EventLog[];
  status: 'planned' | 'active' | 'completed' | 'closed';
  outcome?: 'success' | 'failed' | 'cancelled' | 'neutral';
  lessonsLearnt?: string;
  closedAt?: string;
  closedBy?: string;
  closedReason?: string;
  projectedBudget?: number;
  lastUpdated: string;
  activeCollaborators?: string[];
  eventType?: 'event' | 'trip' | 'startup';
  tripDetails?: TripPlanDetails;
  startupDetails?: StartupPlanDetails;
  // --- Collaboration (present only once a plan has been shared) ---
  sharedProjectId?: string;
  isShared?: boolean;
  role?: ProjectRole;
  serverVersion?: number;
  coverImage?: string;
}

export interface CalendarItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: 'meeting' | 'reminder' | 'event';
  startTime?: string;
  description?: string;
  recurring: 'none' | 'daily' | 'weekly' | 'monthly';
  completed?: boolean;
  // --- Google Calendar Read-Only Metadata ---
  isGoogleCalendar?: boolean;
  googleEventId?: string;
  htmlLink?: string;
  location?: string;
  hangoutLink?: string;
  attendeesCount?: number;
}

export interface EventItem {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  notes?: string;
  date: string;
  splitWithContactIds?: string[];
}

export interface Idea {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface ForecastSettings {
  yearsToProject: number;
  monthlyContribution: number;
  expectedReturn: number;
}

export interface NetWorthSnapshot {
  date: string;
  value: number;
}

export const CATEGORIES = [
  'Food', 'Transport', 'Housing', 'Entertainment', 'Utilities', 
  'Health', 'Shopping', 'Education', 'Personal', 'Income', 'Savings', 'Other', 'Investments', 'Transfer'
];

export const EVENT_ITEM_CATEGORIES = [
  'Venue', 'Catering', 'Decor', 'Entertainment', 'Staff', 'Marketing', 'Tickets', 'Donation', 'Other'
];

export type EventItemCategory = typeof EVENT_ITEM_CATEGORIES[number];

export const STORAGE_KEYS = {
  TRANSACTIONS: 'budget_transactions',
  RECURRING_EXPENSES: 'budget_recurring',
  RECURRING_INCOMES: 'budget_recurring_incomes',
  SAVINGS_GOALS: 'budget_savings_goals',
  INVESTMENT_GOALS: 'budget_investment_goals',
  SALARY: 'budget_salary',
  CASH_OPENING: 'budget_cash_opening',
  CATEGORY_LIMITS: 'budget_category_limits',
  BANK_CONNECTIONS: 'budget_bank_conns',
  INVESTMENTS: 'budget_investments',
  EVENTS: 'budget_events',
  CALENDAR_ITEMS: 'budget_calendar_items',
  CONTACTS: 'ff_contacts',
  NETWORTH_HISTORY: 'ff_networth_history',
  AUTH: 'ff_auth',
  AUTH_USER: 'ff_auth_username',
  USERS_LIST: 'ff_users_list',
  REMINDERS: 'ff_reminders_enabled',
  PASSWORD: 'ff_custom_password',
  DATA_OWNER: 'ff_data_owner_id',
  IDEAS: 'ff_ideas',
  FORECAST_SETTINGS: 'ff_forecast_settings',
  FINANCIAL_LOGS: 'ff_financial_logs'
};

export interface GmailPlanningNotification {
  id: string;
  threadId?: string;
  from: string;
  fromRaw?: string;
  to?: string;
  subject: string;
  snippet?: string;
  date: string;
  isUnread: boolean;
  taskReference?: {
    taskId: string;
    taskTitle: string;
    projectName?: string;
    projectId?: string | null;
    source?: string;
  } | null;
}

