
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

  // --- Business Model Classification (new, additive, optional) ---------
  // Existing projects will not have this set. When undefined, the UI must
  // prompt the user to classify the project (see BusinessModelClassifier)
  // rather than assuming a default — this is the migration gate referenced
  // throughout this section.
  businessModelType?: StartupBusinessModelType;
  goodsSubType?: GoodsSubType;
  serviceRevenueModels?: ServiceRevenueModel[];

  // --- Goods workflow data ------------------------------------------------
  goodsProducts?: GoodsProduct[];
  goodsInventory?: GoodsInventorySnapshot;

  // --- Services workflow data ----------------------------------------------
  serviceOfferings?: ServiceOffering[];
  serviceCapacity?: ServiceCapacityPlan;
  serviceDirectCosts?: ServiceDirectCosts;

  // --- Expense classification (used by both goods & services workflows) ---
  // Replaces the flat rent/salaries/marketing/utilities/otherExpenses split
  // with an explicit one-time / recurring / periodic classification so Year 1
  // investment is derived from real data instead of being hard-coded.
  classifiedExpenses?: ClassifiedExpenseItem[];
}

export type StartupBusinessModelType = 'goods' | 'services' | 'hybrid';

export type GoodsSubType = 'manufacturing' | 'resale' | 'both';

export type ServiceRevenueModel =
  | 'hourly'
  | 'fixed_project'
  | 'package'
  | 'retainer'
  | 'subscription'
  | 'per_transaction'
  | 'other';

export type ExpenseClassification = 'one_time' | 'recurring' | 'periodic';

export interface ClassifiedExpenseItem {
  id: string;
  name: string;
  amount: number;
  classification: ExpenseClassification;
  /** For 'periodic' items: how often the cost recurs, e.g. "Every 3 years". */
  periodicityNote?: string;
  category?: string;
}

export interface RawMaterialLine {
  id: string;
  name: string;
  quantityPerUnit: number;
  costPerUnit: number;
}

/**
 * A single product within a Goods business. Manufacturing- and resale-
 * specific fields are both optional on the same shape — which fields are
 * populated (and which are shown to the user) is driven by the product's
 * own `sourcing` value, so a hybrid "both manufacturing and resale" business
 * can mix product types within one list without forcing irrelevant fields.
 */
export interface GoodsProduct {
  id: string;
  name: string;
  description?: string;
  sourcing: 'manufactured' | 'resale';

  sellingPrice: number;
  expectedMonthlyUnits: number;
  monthlySalesGrowthPercent?: number;
  seasonalDemandNote?: string;

  supplier?: string;
  leadTimeDays?: number;
  minimumOrderQuantity?: number;
  importShippingCostPerUnit?: number;
  dutiesTaxesPercent?: number;
  packagingCostPerUnit?: number;
  distributionCostPerUnit?: number;
  returnsWarrantyAllowancePercent?: number;

  // Resale-specific
  purchaseCostPerUnit?: number;
  freightImportCostPerUnit?: number;

  // Manufacturing-specific
  rawMaterials?: RawMaterialLine[];
  directProductionLabourPerUnit?: number;
  productionOverheadPerUnit?: number;
  wasteScrapPercent?: number;
  productionCapacityUnitsPerMonth?: number;
  productionLeadTimeDays?: number;
}

export interface GoodsInventorySnapshot {
  beginningInventoryValue?: number;
  purchasesOrProductionCostThisPeriod?: number;
  endingInventoryValue?: number;
  safetyStockUnits?: number;
  reorderPointUnits?: number;
  reorderQuantityUnits?: number;
  supplierPaymentTermsDays?: number;
  expectedInventoryTurnsPerYear?: number;
  damagedLostObsoleteAllowancePercent?: number;
}

export interface ServiceOffering {
  id: string;
  name: string;
  description?: string;
  revenueModels: ServiceRevenueModel[];

  // Populated depending on which revenue model(s) are selected above.
  hourlyRate?: number;
  expectedBillableHoursPerMonth?: number;

  averageProjectFee?: number;
  expectedProjectsPerMonth?: number;

  packagePrice?: number;
  expectedPackagesPerMonth?: number;

  monthlyRetainerFee?: number;
  expectedRetainerClients?: number;

  subscriptionPrice?: number;
  expectedSubscribers?: number;

  averageRevenuePerTransaction?: number;
  expectedTransactionsPerMonth?: number;

  contractDurationMonths?: number;
  isRecurringRevenue?: boolean;
}

export interface ServiceCapacityPlan {
  staffCount?: number;
  availableHoursPerStaffPerWeek?: number;
  utilisationPercent?: number;
  expectedHiringDates?: string;
  salaryOrContractorCostPerStaff?: number;
}

export interface ServiceDirectCosts {
  directEmployeeLabour?: number;
  contractorSubcontractorCosts?: number;
  travel?: number;
  projectSpecificMaterials?: number;
  serviceDeliverySoftware?: number;
  paymentProcessingPercent?: number;
  otherDirectCosts?: number;
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

