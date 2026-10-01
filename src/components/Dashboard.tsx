
import React, { useMemo, useState, useEffect } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, BarChart, Bar, Cell } from 'recharts';
import { Transaction, RecurringExpense, RecurringIncome, InvestmentAccount, MarketPrice, BankConnection, InvestmentGoal, SavingGoal, EventLog, BudgetEvent, CalendarItem, GmailPlanningNotification } from '../types';
import { SpendingCashflowIntelligence } from './SpendingCashflowIntelligence';
import { UnifiedNotificationHub } from './UnifiedNotificationHub';
import { EmailDetailModal } from './EmailDetailModal';
import { AiNewsBriefing } from './AiNewsBriefing';
import { useGmailNotifications } from '../hooks/useGmailNotifications';
import { hasCalendarEventPassed } from '../utils/calendarNotificationUtils';
import { decodeHtmlEntities } from '../utils/textUtils';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Plus,
  ArrowRight,
  PieChart,
  Target,
  BarChart3,
  Calendar,
  Zap,
  Activity,
  Search,
  Filter,
  Download,
  Copy,
  Check,
  FileText,
  RefreshCw,
  Trash2,
  Tag,
  ChevronDown,
  ChevronUp,
  Layers,
  ExternalLink,
  Sliders,
  ArrowLeftRight,
  Mail,
  Inbox,
  LogIn,
  LogOut,
  ShieldCheck,
  Info,
  X
} from 'lucide-react';
import { motion } from 'framer-motion';

interface InstitutionalBalance {
  balance: number;
  type: string;
  available: boolean;
  holdings?: any[];
  isCash?: boolean;
}

const getSenderMonogram = (fromStr: string) => {
  if (!fromStr) return 'EM';
  const decoded = decodeHtmlEntities(fromStr);
  const clean = decoded.replace(/<.*?>/, '').replace(/["']/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'EM';
};

const getSenderCleanName = (fromStr: string) => {
  if (!fromStr) return 'Unknown Sender';
  const decoded = decodeHtmlEntities(fromStr);
  const match = decoded.match(/^"?([^"<]+)"?\s*(?:<.*>)?$/);
  if (match && match[1]?.trim()) return match[1].trim();
  const clean = decoded.replace(/<.*?>/, '').replace(/["']/g, '').trim();
  return clean || decoded;
};

const getEmailCategoryBadge = (subject: string, snippet: string) => {
  const text = `${decodeHtmlEntities(subject)} ${decodeHtmlEntities(snippet)}`.toLowerCase();
  if (text.includes('invoice') || text.includes('receipt') || text.includes('bill') || text.includes('payment') || text.includes('statement') || text.includes('$')) {
    return { label: 'Invoice / Financial', color: 'bg-emerald-50 text-emerald-700 border-emerald-200/80' };
  }
  if (text.includes('flight') || text.includes('hotel') || text.includes('trip') || text.includes('reservation') || text.includes('ticket')) {
    return { label: 'Travel & Booking', color: 'bg-cyan-50 text-cyan-700 border-cyan-200/80' };
  }
  if (text.includes('project') || text.includes('task') || text.includes('meeting') || text.includes('review') || text.includes('update') || text.includes('roadmap')) {
    return { label: 'Project Milestone', color: 'bg-indigo-50 text-indigo-700 border-indigo-200/80' };
  }
  return { label: 'General', color: 'bg-stone-100 text-stone-700 border-stone-200/80' };
};

interface Props {
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
  recurringIncomes: RecurringIncome[];
  savingGoals: SavingGoal[];
  investmentGoals: InvestmentGoal[];
  investments: InvestmentAccount[];
  marketPrices: MarketPrice[];
  bankConnections: BankConnection[];
  targetMargin: number;
  cashOpeningBalance: number;
  categoryBudgets: Record<string, number>;
  financialLogs?: EventLog[];
  currentUser?: string;
  userEmail?: string;
  events?: BudgetEvent[];
  calendarItems?: CalendarItem[];
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  onPayRecurring: (rec: RecurringExpense, amount: number) => void;
  onReceiveRecurringIncome: (inc: RecurringIncome, amount: number, destination: string) => void;
  onContributeSaving: (goalId: string, amount: number) => void;
  onWithdrawSaving: (goalId: string, amount: number) => void;
  onWithdrawal: (institution: string, amount: number) => void;
  onAddIncome: (amount: number, description: string, notes: string) => void;
  onUpdateCategoryBudget?: (category: string, amount: number) => void;
  onOpenTransactionForm?: () => void;
  onDeleteFinancialLog?: (id: string) => void;
  onNavigateToPlannerLogs?: () => void;
  onNavigateToTask?: (taskId: string, projectId?: string | null) => void;
  onNavigateToPlanner?: () => void;
  onNavigateToCalendar?: () => void;
  dismissedEmailIds?: string[];
  onDismissEmail?: (emailId: string) => void;
}

type Timeframe = 'daily' | 'monthly' | 'yearly';

const Dashboard: React.FC<Props> = ({ 
  transactions, investments, marketPrices, bankConnections, recurringExpenses, recurringIncomes, categoryBudgets, cashOpeningBalance, savingGoals, investmentGoals, financialLogs = [], currentUser = 'nsv', userEmail, events = [], calendarItems = [], onPayRecurring, onReceiveRecurringIncome, onUpdateCategoryBudget, onOpenTransactionForm, onDeleteFinancialLog, onNavigateToPlannerLogs, onNavigateToTask, onNavigateToPlanner, onNavigateToCalendar, onEdit, onDelete, dismissedEmailIds = [], onDismissEmail
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  // Executive vs Detailed View Mode
  // Scoped per-user (by email) so this preference doesn't leak between
  // different accounts signed in on the same shared browser/device.
  const viewModeKey = userEmail ? `dashboard_view_mode_${userEmail}` : 'dashboard_view_mode';
  const [viewMode, setViewMode] = useState<'executive' | 'detailed'>(() => {
    return (localStorage.getItem(viewModeKey) as 'executive' | 'detailed') || 'executive';
  });

  // Re-read the preference if the logged-in user changes (e.g. logout/login
  // as a different account without a full page reload).
  useEffect(() => {
    const stored = (localStorage.getItem(viewModeKey) as 'executive' | 'detailed') || 'executive';
    setViewMode(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewModeKey]);

  const handleSetViewMode = (mode: 'executive' | 'detailed') => {
    setViewMode(mode);
    localStorage.setItem(viewModeKey, mode);
  };

  // Gmail Sync & Notifications Engine
  const {
    activeUnreadEmails,
    unreadCount,
    gmailLoading,
    gmailConnected,
    gmailError,
    fetchGmail,
    handleConnectGmail,
    handleDisconnectGmail,
    handleDismissEmail,
  } = useGmailNotifications(userEmail, events, dismissedEmailIds, onDismissEmail);

  const [selectedEmailModal, setSelectedEmailModal] = useState<GmailPlanningNotification | null>(null);
  const [showGmailConsentModal, setShowGmailConsentModal] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Log Viewer State
  const [isLogsSectionOpen, setIsLogsSectionOpen] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<'all' | 'expense' | 'income' | 'recurring' | 'budget'>('all');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const cycleStartDate = useMemo(() => {
    const now = new Date();
    // Default to the 25th of the current month at 00:00:00
    let start = new Date(now.getFullYear(), now.getMonth(), 25, 0, 0, 0, 0);
    
    // If today is before the 25th, the cycle actually started on the 25th of LAST month
    if (now.getDate() < 25) {
      start.setMonth(start.getMonth() - 1);
    }
    
    // Hard override for the requested start on Feb 25, 2025
    const feb25_2025 = new Date(2025, 1, 25, 0, 0, 0, 0);
    if (start < feb25_2025) return feb25_2025;
    
    return start;
  }, []);

  const daysPassedInCycle = useMemo(() => {
    const now = new Date();
    const diff = now.getTime() - cycleStartDate.getTime();
    // Ensure at least 1 day for calculations to avoid division by zero
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [cycleStartDate]);

  const daysUntilNextCycle = useMemo(() => {
    const now = new Date();
    let nextCycle = new Date(now.getFullYear(), now.getMonth(), 25, 0, 0, 0, 0);
    if (now.getDate() >= 25) {
      nextCycle.setMonth(nextCycle.getMonth() + 1);
    }
    const diff = nextCycle.getTime() - now.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, []);

  const { totalActualIncome, totalActualExpenses } = useMemo(() => {
    const current = transactions.filter(t => new Date(t.date + 'T00:00:00') >= cycleStartDate);
    return {
      totalActualIncome: current.filter(t => t.type === 'income').reduce((acc: number, t) => acc + t.amount, 0),
      totalActualExpenses: current.filter(t => t.type === 'expense').reduce((acc: number, t) => acc + t.amount, 0),
    };
  }, [transactions, cycleStartDate]);

  const netMargin = totalActualIncome - totalActualExpenses;

  const institutionalBalances = useMemo<Record<string, InstitutionalBalance>>(() => {
    const balances: Record<string, InstitutionalBalance> = {};
    bankConnections.forEach(conn => {
      const history = transactions.filter(t => t.institution === conn.institution || t.destinationInstitution === conn.institution);
      const flow = history.reduce((acc: number, t) => {
        if (t.destinationInstitution === conn.institution && (t.type === 'transfer' || t.type === 'withdrawal')) return acc + t.amount;
        if (t.institution === conn.institution) {
          // Bug: 'savings' was grouped with 'income' here (adding to the
          // balance), but everywhere else a 'savings' transaction is treated
          // as money leaving its source account (a subtraction) — see the
          // Cash in Hand flow and cycleRollover just below, and the
          // equivalent App.tsx liquidFunds calc. This was the one place that
          // added it instead, silently inflating a bank's shown balance by
          // double-counting every savings contribution made from it.
          if (t.type === 'income') return acc + t.amount;
          if (t.type === 'expense' || t.type === 'transfer' || t.type === 'withdrawal' || t.type === 'savings') return acc - t.amount;
        }
        return acc;
      }, 0);
      balances[conn.institution] = { balance: (conn.openingBalance || 0) + flow, type: conn.institutionType, available: conn.institution.includes('1st National') };
    });

    const cashFlow = transactions.filter(t => t.institution === 'Cash in Hand' || t.destinationInstitution === 'Cash in Hand').reduce((acc: number, t) => {
      if (t.destinationInstitution === 'Cash in Hand' && (t.type === 'transfer' || t.type === 'withdrawal')) return acc + t.amount;
      if (t.institution === 'Cash in Hand') {
        if (t.type === 'income') return acc + t.amount;
        if (t.type === 'expense' || t.type === 'transfer' || t.type === 'withdrawal' || t.type === 'savings') return acc - t.amount;
      }
      return acc;
    }, cashOpeningBalance);
    balances['Cash in Hand'] = { balance: cashFlow, type: 'cash', available: true, isCash: true };

    investments.forEach(inv => {
      const liveVal = inv.holdings.reduce((hAcc: number, h) => {
        const live = marketPrices.find(m => m.symbol === h.symbol)?.price || h.purchasePrice;
        return hAcc + (h.quantity * live);
      }, 0);
      const withdrawFlow = transactions.filter(t => t.institution === inv.provider && (t.type === 'withdrawal' || t.type === 'transfer' || t.type === 'expense')).reduce((acc: number, t) => acc + t.amount, 0);
      const depositFlow = transactions.filter(t => t.destinationInstitution === inv.provider && (t.type === 'transfer' || t.type === 'income')).reduce((acc: number, t) => acc + t.amount, 0);
      balances[inv.provider] = { balance: liveVal - withdrawFlow + depositFlow, type: 'investment', available: false, holdings: inv.holdings };
    });
    return balances;
  }, [bankConnections, investments, transactions, marketPrices, cashOpeningBalance]);

  const { bankTotal, cuTotal, cryptoTotal, vanguardTotal } = useMemo(() => {
    let b = 0, c = 0, cr = 0, v = 0;
    (Object.entries(institutionalBalances) as Array<[string, InstitutionalBalance]>).forEach(([name, data]) => {
      if (data.type === 'bank') b += data.balance;
      if (data.type === 'credit_union') c += data.balance;
      if (data.type === 'investment') {
        if (name === 'Binance') cr += data.balance;
        else v += data.balance;
      }
    });
    return { bankTotal: b, cuTotal: c, cryptoTotal: cr, vanguardTotal: v };
  }, [institutionalBalances]);

  const liquidFunds = useMemo<number>(() => {
    const bankSum = (Object.values(institutionalBalances) as InstitutionalBalance[])
      .filter(b => b.type === 'bank')
      .reduce((acc, b) => acc + b.balance, 0);
    const cash = Number(institutionalBalances['Cash in Hand']?.balance || 0);
    return bankSum + cash;
  }, [institutionalBalances]);

  const netWorth: number = (Object.values(institutionalBalances) as InstitutionalBalance[]).reduce((acc: number, b) => acc + b.balance, 0);

  const cycleRollover = useMemo(() => {
    const pastTransactions = transactions.filter(t => new Date(t.date + 'T00:00:00').getTime() < cycleStartDate.getTime());
    const openingBalancesTotal = bankConnections.reduce((acc: number, conn) => acc + conn.openingBalance, 0) + cashOpeningBalance;

    // Bug: this only ever tracked '1st National Bank St. Lucia' by name, so
    // rollover silently ignored any other linked bank (e.g. a credit union)
    // once a user had more than the one default account. Now it checks
    // against every connection of type 'bank', matching how liquidFunds
    // decides what counts as liquid, instead of one hardcoded institution.
    const bankNames = new Set(bankConnections.filter(c => c.institutionType === 'bank').map(c => c.institution));
    const historicalCashflow = pastTransactions.reduce((acc: number, t) => {
      if ((t.institution && bankNames.has(t.institution)) || t.institution === 'Cash in Hand') {
        if (t.type === 'income') return acc + t.amount;
        if (t.type === 'expense' || t.type === 'savings' || t.type === 'withdrawal') return acc - t.amount;
      }
      if ((t.destinationInstitution && bankNames.has(t.destinationInstitution)) || t.destinationInstitution === 'Cash in Hand') {
        if (t.type === 'transfer' || t.type === 'withdrawal') return acc + t.amount;
      }
      return acc;
    }, 0);

    return openingBalancesTotal + historicalCashflow;
  }, [transactions, cycleStartDate, bankConnections, cashOpeningBalance]);

  const unpaidBills = useMemo(() => {
    return recurringExpenses.map(bill => {
      const totalPaid = transactions
        .filter(t => t.recurringId === bill.id && new Date(t.date + 'T00:00:00') >= cycleStartDate)
        .reduce((sum: number, t) => sum + t.amount, 0);
      return { ...bill, remainingAmount: Math.max(0, bill.amount - totalPaid), paidAmount: totalPaid };
    }).filter(bill => bill.remainingAmount > 0.01);
  }, [recurringExpenses, transactions, cycleStartDate]);

  const unconfirmedIncomes = useMemo(() => {
    return recurringIncomes.map(inc => {
      const totalReceived = transactions
        .filter(t => t.recurringId === inc.id && t.type === 'income' && new Date(t.date + 'T00:00:00') >= cycleStartDate)
        .reduce((sum: number, t) => sum + t.amount, 0);
      return { ...inc, remainingAmount: Math.max(0, inc.amount - totalReceived), receivedAmount: totalReceived };
    }).filter(inc => inc.remainingAmount > 0.01);
  }, [recurringIncomes, transactions, cycleStartDate]);

  const dailySafeSpend = useMemo(() => {
    return Math.max(0, liquidFunds / daysUntilNextCycle);
  }, [liquidFunds, daysUntilNextCycle]);

  // High-Level Executive Summary Metrics
  // Closed and completed projects are excluded from the Projects & Planner
  // Summary — that module is meant to surface what's still active and in progress.
  const openProjects = useMemo(() => {
    return events.filter(ev => {
      if (ev.status === 'closed' || (ev as any).status === 'closed') return false;
      if (ev.status === 'completed' || (ev as any).status === 'completed') return false;
      if (ev.closedAt) return false;
      return true;
    });
  }, [events]);
  const totalProjects = openProjects.length;
  const allTasks = useMemo(() => {
    return openProjects.flatMap(e => e.tasks || []);
  }, [openProjects]);
  const completedTasksCount = allTasks.filter(t => t.completed).length;
  const pendingTasksCount = allTasks.length - completedTasksCount;
  const overallTaskProgress = allTasks.length > 0 ? Math.round((completedTasksCount / allTasks.length) * 100) : 0;

  const totalSavingsGoalTarget = savingGoals.reduce((acc, g) => acc + (g.targetAmount || 0), 0);
  const totalSavingsGoalCurrent = savingGoals.reduce((acc, g) => acc + (g.currentAmount || 0), 0);
  const savingsProgressPct = totalSavingsGoalTarget > 0 ? Math.min(100, Math.round((totalSavingsGoalCurrent / totalSavingsGoalTarget) * 100)) : 0;

  const totalInvestmentGoalTarget = investmentGoals.reduce((acc, g) => acc + (g.targetAmount || 0), 0);
  const totalInvestmentGoalCurrent = investmentGoals.reduce((acc, g) => acc + (g.currentAmount || 0), 0);
  const investmentProgressPct = totalInvestmentGoalTarget > 0 ? Math.min(100, Math.round((totalInvestmentGoalCurrent / totalInvestmentGoalTarget) * 100)) : 0;

  const upcomingCalendarItems = useMemo(() => {
    const now = new Date();
    return [...calendarItems]
      .filter(item => !hasCalendarEventPassed(item, now))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 3);
  }, [calendarItems]);

  const upcomingFinancialCommitments = useMemo(() => {
    const bills = unpaidBills.map(b => ({
      id: b.id,
      title: b.description,
      amount: b.remainingAmount,
      date: b.nextDueDate,
      isIncome: false,
      category: b.category,
    }));
    const incomes = unconfirmedIncomes.map(i => ({
      id: i.id,
      title: i.description,
      amount: i.remainingAmount,
      date: i.nextConfirmationDate,
      isIncome: true,
      category: i.category,
    }));
    return [...bills, ...incomes]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
  }, [unpaidBills, unconfirmedIncomes]);

  const filteredFinancialLogs = useMemo(() => {
    return financialLogs.filter(log => {
      // Type matching
      if (logFilter === 'expense') {
        const text = (log.action + ' ' + (log.details || '')).toLowerCase();
        if (!text.includes('expense') && !text.includes('paid') && !text.includes('outflow') && !text.includes('-')) return false;
      } else if (logFilter === 'income') {
        const text = (log.action + ' ' + (log.details || '')).toLowerCase();
        if (!text.includes('income') && !text.includes('inflow') && !text.includes('received') && !text.includes('+')) return false;
      } else if (logFilter === 'recurring') {
        const text = (log.action + ' ' + (log.details || '')).toLowerCase();
        if (!text.includes('recurring') && !text.includes('bill') && !text.includes('commitment')) return false;
      } else if (logFilter === 'budget') {
        const text = (log.action + ' ' + (log.details || '')).toLowerCase();
        if (!text.includes('budget') && !text.includes('limit') && !text.includes('allocation')) return false;
      }

      // Search query matching
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        const matchesAction = log.action.toLowerCase().includes(q);
        const matchesDetails = (log.details || '').toLowerCase().includes(q);
        const matchesUser = (log.username || '').toLowerCase().includes(q);
        const matchesDate = log.timestamp.toLowerCase().includes(q);
        if (!matchesAction && !matchesDetails && !matchesUser && !matchesDate) return false;
      }

      return true;
    });
  }, [financialLogs, logFilter, logSearch]);

  const handleCopyLogsTrail = () => {
    const text = filteredFinancialLogs.map(l => 
      `[${new Date(l.timestamp).toLocaleString()}] [${l.username || 'System'}] ${l.action}${l.details ? ` | ${l.details}` : ''}`
    ).join('\n');

    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleExportLogsCSV = () => {
    const headers = ['ID', 'Timestamp', 'User', 'Type', 'Action', 'Details'];
    const rows = filteredFinancialLogs.map(l => [
      `"${l.id}"`,
      `"${new Date(l.timestamp).toISOString()}"`,
      `"${l.username || 'System'}"`,
      `"${l.type || 'transaction'}"`,
      `"${(l.action || '').replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_transaction_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLogBadge = (action: string, details?: string) => {
    const text = (action + ' ' + (details || '')).toLowerCase();
    if (text.includes('budget') || text.includes('allocation') || text.includes('limit')) {
      return {
        label: 'Budget Limit',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        iconBg: 'bg-amber-500 text-white shadow-amber-200',
        rowAccent: 'border-l-amber-500',
        dotColor: 'bg-amber-500',
        icon: <Sliders size={13} className="stroke-[2.5]" />
      };
    }
    if (text.includes('transfer') || text.includes('reallocation')) {
      return {
        label: 'Transfer',
        badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        iconBg: 'bg-cyan-600 text-white shadow-cyan-200',
        rowAccent: 'border-l-cyan-500',
        dotColor: 'bg-cyan-500',
        icon: <ArrowLeftRight size={13} className="stroke-[2.5]" />
      };
    }
    if (text.includes('income') || text.includes('inflow') || text.includes('received') || text.includes('deposit') || text.includes('+') || text.includes('+$')) {
      return {
        label: 'Inflow (+)',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        iconBg: 'bg-emerald-600 text-white shadow-emerald-200',
        rowAccent: 'border-l-emerald-500',
        dotColor: 'bg-emerald-500',
        icon: <ArrowUpRight size={14} className="stroke-[3]" />
      };
    }
    if (text.includes('recurring') || text.includes('bill') || text.includes('commitment') || text.includes('subscription')) {
      return {
        label: 'Recurring',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        iconBg: 'bg-indigo-600 text-white shadow-indigo-200',
        rowAccent: 'border-l-indigo-500',
        dotColor: 'bg-indigo-500',
        icon: <RefreshCw size={13} className="stroke-[2.5]" />
      };
    }
    return {
      label: 'Expense (-)',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      iconBg: 'bg-rose-600 text-white shadow-rose-200',
      rowAccent: 'border-l-rose-500',
      dotColor: 'bg-rose-500',
      icon: <ArrowDownRight size={14} className="stroke-[3]" />
    };
  };

  return (
    <div className="ffpro-dashboard space-y-4 animate-in fade-in duration-500 pb-24 print:p-0">
      <div className="hidden print:block border-b-2 border-stone-900 pb-6 mb-8">
        <h1 className="text-2xl font-light text-stone-900 uppercase tracking-wider">Financial Audit Statement</h1>
      </div>

      {/* Executive vs Detailed View Mode Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#091728] p-4 rounded-2xl border border-[#1a3854]">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
            viewMode === 'executive' 
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
              : 'bg-[#07121f] text-slate-400 border-[#1a3854]'
          }`}>
            {viewMode === 'executive' ? <Layers size={18} /> : <BarChart3 size={18} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-stone-900 tracking-tight">
                {viewMode === 'executive' ? 'Executive Briefing' : 'Detailed Financial Analysis'}
              </h2>
              <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full border ${
                viewMode === 'executive' 
                  ? 'bg-stone-100 text-stone-800 border-stone-200' 
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                {viewMode === 'executive' ? 'High-Level Overview' : 'Granular Ledger & Analytics'}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 font-medium mt-0.5">
              {viewMode === 'executive' 
                ? 'Strategic snapshot across Net Worth, Cash Margin, Active Suites, Commitments & Inbox.' 
                : 'Full breakdown of institutional accounts, cashflow intelligence, objectives & immutable audit logs.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-[#07121f] p-1 rounded-xl border border-[#1a3854] self-stretch sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => handleSetViewMode('executive')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'executive' 
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' 
                : 'text-slate-500 hover:text-white'
            }`}
          >
            <Layers size={14} />
            <span>Executive Briefing</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('detailed')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'detailed' 
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' 
                : 'text-slate-500 hover:text-white'
            }`}
          >
            <BarChart3 size={14} />
            <span>Detailed View</span>
          </button>
        </div>
      </div>

      {viewMode === 'executive' ? (
        /* Executive High-Level Summary View */
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Executive Hero KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {/* Card 1: Total Net Worth */}
            <div className="executive-card executive-card-interactive p-5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-stone-400 mb-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Total Net Worth</span>
                  <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center border border-stone-200">
                    <Wallet size={15} />
                  </div>
                </div>
                <h3 className="font-tabular text-2xl font-bold text-stone-900 tracking-tight privacy-sensitive">${netWorth.toLocaleString()}</h3>
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-stone-500 font-medium">Liquid Cash:</span>
                <span className="font-tabular font-semibold text-stone-900 bg-stone-100 px-2 py-0.5 rounded-md privacy-sensitive">${liquidFunds.toLocaleString()}</span>
              </div>
            </div>

            {/* Card 2: Cashflow Balance */}
            <div className="executive-card executive-card-interactive p-5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-stone-400 mb-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Monthly Margin</span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${netMargin >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' : 'bg-rose-50 text-rose-700 border-rose-200/80'}`}>
                    {netMargin >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  </div>
                </div>
                <h3 className={`font-tabular text-2xl font-bold tracking-tight privacy-sensitive ${netMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {netMargin >= 0 ? '+' : ''}${netMargin.toLocaleString()}
                </h3>
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-tabular">
                <span className="text-emerald-700 font-semibold privacy-sensitive">+${totalActualIncome.toLocaleString()}</span>
                <span className="text-stone-300">/</span>
                <span className="text-rose-700 font-semibold privacy-sensitive">-${totalActualExpenses.toLocaleString()}</span>
              </div>
            </div>

            {/* Card 3: Projects & Workspaces */}
            <div className="executive-card executive-card-interactive p-5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-stone-400 mb-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Project Suites</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/80">
                    <Zap size={15} />
                  </div>
                </div>
                <h3 className="font-tabular text-2xl font-bold text-stone-900 tracking-tight">
                  {totalProjects} <span className="text-xs font-medium text-stone-400">Active</span>
                </h3>
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-stone-500 font-medium">{completedTasksCount}/{allTasks.length} Tasks</span>
                <span className="font-tabular font-bold text-amber-700">{overallTaskProgress}%</span>
              </div>
            </div>

            {/* Card 4: Upcoming Schedule & Commitments */}
            <div className="executive-card executive-card-interactive p-5 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-stone-400 mb-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Commitments</span>
                  <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center border border-cyan-200/80">
                    <Calendar size={15} />
                  </div>
                </div>
                <h3 className="font-tabular text-2xl font-bold text-stone-900 tracking-tight">
                  {upcomingCalendarItems.length + upcomingFinancialCommitments.length} <span className="text-xs font-medium text-stone-400">Due</span>
                </h3>
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-stone-500 font-medium">Next:</span>
                <span className="font-semibold text-cyan-700 truncate max-w-[120px]">
                  {upcomingFinancialCommitments[0]?.title || upcomingCalendarItems[0]?.title || 'All Clear'}
                </span>
              </div>
            </div>

            {/* Card 5: Unread Emails */}
            <div 
              className="executive-card executive-card-interactive p-5 rounded-2xl flex flex-col justify-between cursor-pointer group"
              onClick={() => {
                if (activeUnreadEmails.length > 0) {
                  setSelectedEmailModal(activeUnreadEmails[0]);
                } else if (!gmailConnected) {
                  handleConnectGmail();
                }
              }}
            >
              <div>
                <div className="flex items-center justify-between text-stone-400 mb-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Unread Inbox</span>
                  <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center border border-stone-200 group-hover:bg-stone-900 group-hover:text-white transition">
                    <Mail size={15} />
                  </div>
                </div>
                <h3 className="font-tabular text-2xl font-bold text-stone-900 tracking-tight">
                  {unreadCount} <span className="text-xs font-medium text-stone-400">Briefing</span>
                </h3>
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-stone-500 font-medium">Status:</span>
                <span className={`font-semibold px-2 py-0.5 rounded-md ${
                  gmailConnected ? 'text-stone-800 bg-stone-100' : 'text-amber-800 bg-amber-50'
                }`}>
                  {gmailConnected ? (unreadCount > 0 ? `${unreadCount} New` : 'All Clear') : 'Connect'}
                </span>
              </div>
            </div>
          </div>

          {/* 2-Column High-Level Overview Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Module 1: Projects & Planner High-Level Overview */}
            <section className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                      <Zap size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-stone-900">Projects & Planner Summary</h3>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Milestone Progress & Checklists</p>
                    </div>
                  </div>
                  {onNavigateToPlanner && (
                    <button
                      type="button"
                      onClick={onNavigateToPlanner}
                      className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 transition"
                    >
                      <span>Open Planner</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>

                {openProjects.length > 0 ? (
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {openProjects.map((ev) => {
                      const tasks = ev.tasks || [];
                      const done = tasks.filter(t => t.completed).length;
                      const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
                      const totalSpent = ev.ledger?.reduce((acc, l) => acc + l.amount, 0) || 0;
                      const projectName = ev.name || (ev as any).title || 'Untitled Project';
                      const targetBudget = ev.projectedBudget || (ev as any).budget || 0;

                      return (
                        <div 
                          key={ev.id} 
                          onClick={() => onNavigateToTask && onNavigateToTask(ev.id, ev.id)}
                          className="p-4 bg-stone-50 rounded-xl border border-stone-200/80 hover:border-amber-300 hover:bg-amber-50/20 transition cursor-pointer group"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded border ${
                                ev.eventType === 'trip' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' :
                                ev.eventType === 'startup' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}>
                                {ev.eventType === 'trip' ? '✈️ Trip' : ev.eventType === 'startup' ? '🚀 Startup' : '📋 General'}
                              </span>
                              <h4 className="text-xs font-bold text-stone-800 group-hover:text-amber-700 transition">{projectName}</h4>
                            </div>
                            <span className="text-[10px] font-extrabold text-stone-600">{pct}% Done</span>
                          </div>

                          <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden mb-2">
                            <div 
                              className="bg-amber-500 h-full transition-all duration-300 rounded-full" 
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-semibold text-stone-500">
                            <span>{done}/{tasks.length} Tasks Completed</span>
                            <span>Spent: <span className="font-tabular privacy-sensitive">${totalSpent.toLocaleString()}</span> / Target: <span className="font-tabular privacy-sensitive">${targetBudget.toLocaleString()}</span></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-stone-400 text-xs font-medium">
                    No active project suites found.
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-bold text-stone-600">
                <span>Active Projects: {openProjects.length}</span>
                <span>Pending Tasks: {pendingTasksCount}</span>
              </div>
            </section>

            {/* Module 2: Calendar & Upcoming Commitments Summary */}
            <section className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-100">
                      <Calendar size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-stone-900">Schedule & Calendar Highlights</h3>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Upcoming Meetings & Due Dates</p>
                    </div>
                  </div>
                  {onNavigateToCalendar && (
                    <button
                      type="button"
                      onClick={onNavigateToCalendar}
                      className="flex items-center gap-1 text-xs font-bold text-cyan-600 hover:text-cyan-700 transition"
                    >
                      <span>Open Calendar</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {upcomingCalendarItems.length > 0 || upcomingFinancialCommitments.length > 0 ? (
                    <>
                      {upcomingCalendarItems.map(ci => (
                        <div key={ci.id} className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-700 font-bold text-xs flex flex-col items-center justify-center shrink-0">
                              <span>{new Date(ci.date + 'T00:00:00').getDate()}</span>
                              <span className="text-[8px] uppercase">{new Date(ci.date + 'T00:00:00').toLocaleDateString('default', { month: 'short' })}</span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-stone-800">{ci.title}</p>
                              <p className="text-[10px] text-stone-400 font-medium">{ci.category || 'Event'} • {ci.time || 'All Day'}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 text-[9px] font-extrabold uppercase rounded border border-cyan-200">
                            Calendar
                          </span>
                        </div>
                      ))}

                      {upcomingFinancialCommitments.map(fc => (
                        <div key={fc.id} className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg font-bold text-xs flex flex-col items-center justify-center shrink-0 ${
                              fc.isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              <span>{new Date(fc.date + 'T00:00:00').getDate()}</span>
                              <span className="text-[8px] uppercase">{new Date(fc.date + 'T00:00:00').toLocaleDateString('default', { month: 'short' })}</span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-stone-800">{fc.title}</p>
                              <p className="text-[10px] text-stone-400 font-medium">{fc.category} • Due {new Date(fc.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded border font-tabular privacy-sensitive ${
                            fc.isIncome ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {fc.isIncome ? `+$${fc.amount.toFixed(2)}` : `-$${fc.amount.toFixed(2)}`}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="py-8 text-center text-stone-400 text-xs font-medium">
                      No upcoming meetings or financial commitments scheduled.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-bold text-stone-600">
                <span>Calendar Events: {calendarItems.length}</span>
                <span>Unpaid Bills: {unpaidBills.length}</span>
              </div>
            </section>

            {/* Module 3: Financial Objectives & Targets Summary */}
            <section className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-2xs">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                    <Target size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">Financial Objectives Progress</h3>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Savings & Investment Goals</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-bold text-stone-800">Saving Goals ({savingGoals.length})</span>
                    <span className="text-xs font-extrabold text-indigo-600 font-tabular privacy-sensitive">${totalSavingsGoalCurrent.toLocaleString()} / ${totalSavingsGoalTarget.toLocaleString()} ({savingsProgressPct}%)</span>
                  </div>
                  <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full transition-all duration-300 rounded-full" style={{ width: `${savingsProgressPct}%` }} />
                  </div>
                </div>

                <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-bold text-stone-800">Investment Goals ({investmentGoals.length})</span>
                    <span className="text-xs font-extrabold text-emerald-600 font-tabular privacy-sensitive">${totalInvestmentGoalCurrent.toLocaleString()} / ${totalInvestmentGoalTarget.toLocaleString()} ({investmentProgressPct}%)</span>
                  </div>
                  <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full transition-all duration-300 rounded-full" style={{ width: `${investmentProgressPct}%` }} />
                  </div>
                </div>
              </div>
            </section>

            {/* Module 4: High Level Quick Actions & Status */}
            <section className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                      <Activity size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-stone-900">Command Quick Actions</h3>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">High-Level Operations</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {onOpenTransactionForm && (
                    <button
                      type="button"
                      onClick={onOpenTransactionForm}
                      className="p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl border border-indigo-200/80 text-left transition flex flex-col justify-between"
                    >
                      <Plus size={16} className="text-indigo-600 mb-2" />
                      <div>
                        <p className="text-xs font-bold">New Entry</p>
                        <p className="text-[10px] text-indigo-500 font-medium">Record Transaction</p>
                      </div>
                    </button>
                  )}

                  {onNavigateToPlanner && (
                    <button
                      type="button"
                      onClick={onNavigateToPlanner}
                      className="p-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl border border-amber-200/80 text-left transition flex flex-col justify-between"
                    >
                      <Zap size={16} className="text-amber-600 mb-2" />
                      <div>
                        <p className="text-xs font-bold">Project Suite</p>
                        <p className="text-[10px] text-amber-600 font-medium">Planner Checklists</p>
                      </div>
                    </button>
                  )}

                  {onNavigateToCalendar && (
                    <button
                      type="button"
                      onClick={onNavigateToCalendar}
                      className="p-3 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 rounded-xl border border-cyan-200/80 text-left transition flex flex-col justify-between"
                    >
                      <Calendar size={16} className="text-cyan-600 mb-2" />
                      <div>
                        <p className="text-xs font-bold">Schedule Event</p>
                        <p className="text-[10px] text-cyan-600 font-medium">Calendar & Meetings</p>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSetViewMode('detailed')}
                    className="p-3 bg-stone-50 hover:bg-stone-100 text-stone-800 rounded-xl border border-stone-200/80 text-left transition flex flex-col justify-between"
                  >
                    <BarChart3 size={16} className="text-stone-600 mb-2" />
                    <div>
                      <p className="text-xs font-bold">Deep Analytics</p>
                      <p className="text-[10px] text-stone-500 font-medium">Full Ledger & Audit</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-bold text-stone-500">
                <span>Accounts Connected: {bankConnections.length}</span>
                <span>Audit Logs Recorded: {financialLogs.length}</span>
              </div>
            </section>

            {/* Module 5: Unread Inbox & Emails Briefing */}
            <section className="executive-card p-5 rounded-2xl flex flex-col justify-between lg:col-span-2">
              <div>
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
                      <Mail size={15} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-stone-900 tracking-tight">Executive Inbox Briefing</h3>
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                        {gmailConnected ? `${unreadCount} Unread Messages Pending Review` : 'Gmail Integration Offline'}
                      </p>
                    </div>
                  </div>
                  {gmailConnected ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fetchGmail(false)}
                        disabled={gmailLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl border border-stone-200/80 transition"
                        title="Sync Inbox with Gmail"