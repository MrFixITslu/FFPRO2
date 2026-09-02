
import React, { useMemo, useState, useEffect } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, BarChart, Bar, Cell } from 'recharts';
import { Transaction, RecurringExpense, RecurringIncome, InvestmentAccount, MarketPrice, BankConnection, InvestmentGoal, SavingGoal, EventLog, BudgetEvent, CalendarItem } from '../types';
import { SpendingCashflowIntelligence } from './SpendingCashflowIntelligence';
import { UnifiedNotificationHub } from './UnifiedNotificationHub';
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
  ArrowLeftRight
} from 'lucide-react';
import { motion } from 'framer-motion';

interface InstitutionalBalance {
  balance: number;
  type: string;
  available: boolean;
  holdings?: any[];
  isCash?: boolean;
}

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
}

type Timeframe = 'daily' | 'monthly' | 'yearly';

const Dashboard: React.FC<Props> = ({ 
  transactions, investments, marketPrices, bankConnections, recurringExpenses, recurringIncomes, categoryBudgets, cashOpeningBalance, savingGoals, investmentGoals, financialLogs = [], currentUser = 'nsv', userEmail, events = [], calendarItems = [], onPayRecurring, onReceiveRecurringIncome, onUpdateCategoryBudget, onOpenTransactionForm, onDeleteFinancialLog, onNavigateToPlannerLogs, onNavigateToTask, onNavigateToPlanner, onEdit, onDelete
}) => {
  const [searchTerm, setSearchTerm] = useState("");

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
    <div className="space-y-6 animate-in fade-in duration-500 pb-24 print:p-0">
      <div className="hidden print:block border-b-2 border-slate-900 pb-6 mb-8">
        <h1 className="text-2xl font-light text-slate-900 uppercase tracking-wider">Financial Audit Statement</h1>
      </div>

      {/* Unified Notification & Planning Intelligence Hub */}
      <UnifiedNotificationHub
        userEmail={userEmail}
        events={events}
        calendarItems={calendarItems}
        unpaidBills={unpaidBills}
        unconfirmedIncomes={unconfirmedIncomes}
        categoryBudgets={categoryBudgets}
        transactions={transactions}
        bankConnections={bankConnections}
        onNavigateToTask={onNavigateToTask}
        onNavigateToPlanner={onNavigateToPlanner}
        onPayRecurring={onPayRecurring}
        onReceiveRecurringIncome={onReceiveRecurringIncome}
        onOpenTransactionForm={onOpenTransactionForm}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1 text-center">Rollover</p>
           <h3 className="text-xs font-bold text-slate-600 text-center">${cycleRollover.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1 text-center">Inflow</p>
           <h3 className="text-xs font-bold text-emerald-600 text-center">+${totalActualIncome.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1 text-center">Outflow</p>
           <h3 className="text-xs font-bold text-rose-600 text-center">-${totalActualExpenses.toLocaleString()}</h3>
        </div>
        <div className={`p-4 rounded-xl border shadow-sm flex flex-col justify-center ${netMargin >= 0 ? 'bg-emerald-50/40 border-emerald-200' : 'bg-rose-50/40 border-rose-200'}`}>
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1 text-center">Net Margin</p>
           <h3 className={`text-xs font-bold text-center ${netMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
             {netMargin >= 0 ? '+' : ''}${netMargin.toLocaleString()}
           </h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1 text-center">Cash On Hand</p>
           <h3 className="text-xs font-bold text-indigo-600 text-center">${liquidFunds.toLocaleString()}</h3>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-sm flex flex-col justify-center text-center">
           <p className="text-emerald-600/80 text-[8px] font-bold uppercase tracking-wider mb-1">Safe Spend</p>
           <h3 className="text-sm font-bold text-emerald-700">${dailySafeSpend.toFixed(0)}<span className="text-[8px] text-emerald-600/60 uppercase">/Day</span></h3>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl shadow-sm flex flex-col justify-center text-center">
           <p className="text-indigo-600/80 text-[8px] font-bold uppercase tracking-wider mb-1">Days left</p>
           <h3 className="text-sm font-bold text-indigo-700">{daysUntilNextCycle} <span className="text-[8px] text-indigo-600/60 uppercase">Days</span></h3>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-sm text-white flex flex-col justify-center text-center">
           <p className="text-white/50 text-[8px] font-bold uppercase tracking-wider mb-1">Net Worth</p>
           <h3 className="text-xs font-semibold text-white">${netWorth.toLocaleString()}</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1">Traditional Bank</p>
           <h3 className="text-sm font-semibold text-slate-800">${bankTotal.toLocaleString()}</h3>
           <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-600" style={{ width: `${netWorth > 0 ? (bankTotal / netWorth) * 100 : 0}%` }}></div>
           </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1">Credit Union</p>
           <h3 className="text-sm font-semibold text-slate-800">${cuTotal.toLocaleString()}</h3>
           <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-600" style={{ width: `${netWorth > 0 ? (cuTotal / netWorth) * 100 : 0}%` }}></div>
           </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1">Crypto (Digital)</p>
           <h3 className="text-sm font-semibold text-slate-800">${cryptoTotal.toLocaleString()}</h3>
           <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-600" style={{ width: `${netWorth > 0 ? (cryptoTotal / netWorth) * 100 : 0}%` }}></div>
           </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mb-1">Other Investments</p>
           <h3 className="text-sm font-semibold text-slate-800">${vanguardTotal.toLocaleString()}</h3>
           <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-600" style={{ width: `${netWorth > 0 ? (vanguardTotal / netWorth) * 100 : 0}%` }}></div>
           </div>
        </div>
      </div>

      {/* Unified Spending, Cashflow & Financial Insights Section */}
      <SpendingCashflowIntelligence
        transactions={transactions}
        recurringExpenses={recurringExpenses}
        recurringIncomes={recurringIncomes}
        categoryBudgets={categoryBudgets}
        onUpdateCategoryBudget={onUpdateCategoryBudget}
        onEditTransaction={onEdit}
        onDeleteTransaction={onDelete}
        onOpenTransactionForm={onOpenTransactionForm}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <h3 className="font-bold text-slate-800 uppercase text-xs tracking-wider mb-6">Financial Objectives</h3>
          <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-1">
            {savingGoals.length > 0 || investmentGoals.length > 0 ? (
              <>
                {savingGoals.map(goal => (
                  <div key={goal.id} className="space-y-2">
                    <div className="flex justify-between items-end px-1">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{goal.name}</p>
                        <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-wider">{goal.institution}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-900">${goal.currentAmount.toLocaleString()} / ${goal.targetAmount.toLocaleString()}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Savings Target</p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 transition-all duration-1000" 
                        style={{ width: `${Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
                {investmentGoals.map(goal => {
                  const currentVal = institutionalBalances[goal.provider]?.balance || 0;
                  const progress = (currentVal / goal.targetAmount) * 100;
                  return (
                    <div key={goal.id} className="space-y-2">
                      <div className="flex justify-between items-end px-1">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{goal.name}</p>
                          <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-wider">{goal.provider} Portfolio</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-900">${currentVal.toLocaleString()} / ${goal.targetAmount.toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Asset Target</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-600 transition-all duration-1000" 
                          style={{ width: `${Math.min(100, progress)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <p className="py-10 text-center text-slate-300 font-bold uppercase text-[9px] tracking-wider">No Active Objectives</p>
            )}
          </div>
        </section>

        <section className="bg-slate-900 p-6 rounded-xl text-white shadow-sm overflow-hidden flex flex-col">
          <h3 className="font-bold uppercase text-xs tracking-wider text-indigo-400 mb-6">Market Pulse</h3>
          <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
            {marketPrices.slice(0, 4).map(p => (
              <div key={p.symbol} className="p-3.5 bg-white/5 border border-white/10 rounded-lg flex flex-col justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{p.symbol}</span>
                <h4 className="text-sm font-semibold mt-1.5">${p.price.toLocaleString()}</h4>
                <div className={`text-[9px] font-bold mt-1 ${p.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {p.change24h > 0 ? '+' : ''}{p.change24h.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Financial Transaction Activity Log & Audit Trail Section */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div 
          onClick={() => setIsLogsSectionOpen(prev => !prev)}
          className="p-5 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <Activity size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight">Financial Transaction Activity Log</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    {financialLogs.length} {financialLogs.length === 1 ? 'record' : 'records'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    {isLogsSectionOpen ? 'Expanded' : 'Collapsed'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Real-time immutable audit trail of payments, inflow records, and ledger adjustments</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-center" onClick={(e) => e.stopPropagation()}>
            {isLogsSectionOpen && (
              <>
                {/* Search Input */}
                <div className="relative min-w-[180px] sm:min-w-[200px]">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                  {logSearch && (
                    <button 
                      onClick={() => setLogSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <i className="fas fa-times text-[10px]"></i>
                    </button>
                  )}
                </div>

                {/* Quick Add Transaction */}
                {onOpenTransactionForm && (
                  <button
                    type="button"
                    onClick={onOpenTransactionForm}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm whitespace-nowrap"
                  >
                    <Plus size={13} />
                    <span className="hidden sm:inline">Add Record</span>
                  </button>
                )}

                {/* Export CSV */}
                <button
                  type="button"
                  onClick={handleExportLogsCSV}
                  disabled={filteredFinancialLogs.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition disabled:opacity-40 whitespace-nowrap"
                  title="Download CSV report"
                >
                  <Download size={13} />
                  <span className="hidden sm:inline">Export</span>
                </button>

                {/* Copy Log Trail */}
                <button
                  type="button"
                  onClick={handleCopyLogsTrail}
                  disabled={filteredFinancialLogs.length === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border ${copiedLogs ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'} disabled:opacity-40 whitespace-nowrap`}
                  title="Copy to clipboard"
                >
                  {copiedLogs ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span className="hidden sm:inline">{copiedLogs ? 'Copied' : 'Copy'}</span>
                </button>

                {/* Full Audit in Planner Logs */}
                {onNavigateToPlannerLogs && (
                  <button
                    type="button"
                    onClick={onNavigateToPlannerLogs}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-sm whitespace-nowrap"
                    title="Open in comprehensive Project Logs Manager"
                  >
                    <ExternalLink size={13} />
                    <span className="hidden md:inline">Planner Audit</span>
                  </button>
                )}
              </>
            )}

            {/* Expand / Collapse Toggle Button */}
            <button
              type="button"
              onClick={() => setIsLogsSectionOpen(prev => !prev)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
              title={isLogsSectionOpen ? 'Collapse log section' : 'Expand log section'}
            >
              <span>{isLogsSectionOpen ? 'Hide Logs' : 'View Logs'}</span>
              {isLogsSectionOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {/* Collapsible Content */}
        {isLogsSectionOpen && (
          <div>
            {/* Filter Tabs */}
            <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                  <Filter size={11} /> Filter:
                </span>
                {[
                  { id: 'all', label: 'All Transactions' },
                  { id: 'expense', label: 'Expenses & Outflows' },
                  { id: 'income', label: 'Inflows & Deposits' },
                  { id: 'recurring', label: 'Recurring Commitments' },
                  { id: 'budget', label: 'Budget Allocations' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setLogFilter(tab.id as any)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${logFilter === tab.id ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">
                Showing {filteredFinancialLogs.length} of {financialLogs.length}
              </span>
            </div>

        {/* Logs Table / List */}
        <div className="overflow-x-auto">
          {filteredFinancialLogs.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">Type</th>
                  <th className="py-3 px-4 min-w-[220px]">Transaction & Action</th>
                  <th className="py-3 px-4 min-w-[180px]">Context & Details</th>
                  <th className="py-3 px-4 w-28">Author</th>
                  <th className="py-3 px-4 w-36">Timestamp</th>
                  <th className="py-3 px-4 w-16 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredFinancialLogs.map((log) => {
                  const badge = getLogBadge(log.action, log.details);
                  const isExpanded = expandedLogId === log.id;
                  const logDate = new Date(log.timestamp);
                  const formattedDate = !isNaN(logDate.getTime())
                    ? logDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })
                    : log.timestamp;
                  const formattedTime = !isNaN(logDate.getTime())
                    ? logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';

                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        className={`hover:bg-slate-50/80 transition-colors group cursor-pointer border-l-4 ${badge.rowAccent} ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      >
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg shadow-2xs ${badge.iconBg}`} title={badge.label}>
                            {badge.icon}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 leading-snug">{log.action}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider inline-flex items-center gap-1 ${badge.badgeClass}`}>
                              <span className={`w-1 h-1 rounded-full ${badge.dotColor}`}></span>
                              {badge.label}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="text-slate-500 text-[11px] truncate max-w-xs font-medium">
                            {log.details || '—'}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 font-bold text-[9px] flex items-center justify-center uppercase">
                              {(log.username || 'S').charAt(0)}
                            </div>
                            <span className="text-[11px] font-semibold text-slate-700">{log.username || 'System'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-[11px] font-semibold text-slate-700">{formattedDate}</div>
                          {formattedTime && (
                            <div className="text-[9px] text-slate-400 font-medium">{formattedTime}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                              title="Toggle details"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {onDeleteFinancialLog && (
                              <button
                                type="button"
                                onClick={() => onDeleteFinancialLog(log.id)}
                                className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition opacity-0 group-hover:opacity-100"
                                title="Delete log entry"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-b border-indigo-100">
                          <td colSpan={6} className="p-4 px-6">
                            <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs shadow-inner">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                <span className="font-bold text-slate-800">Log ID: <span className="font-mono text-slate-500 text-[10px]">{log.id}</span></span>
                                <span className="text-[10px] text-slate-400">Timestamp: {new Date(log.timestamp).toISOString()}</span>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Action Statement</p>
                                <p className="text-slate-800 font-medium mt-0.5">{log.action}</p>
                              </div>
                              {log.details && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Extended Ledger Details</p>
                                  <p className="text-slate-700 font-mono text-[11px] mt-0.5 bg-slate-50 p-2 rounded border border-slate-150 whitespace-pre-wrap">{log.details}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-12 px-6 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Activity size={18} />
              </div>
              <p className="text-sm font-semibold text-slate-700">No Transaction Activity Logs Found</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {logSearch || logFilter !== 'all' 
                  ? 'No activity records match your current filter criteria. Try clearing search or selecting All.' 
                  : 'Financial actions performed on the dashboard (adding transactions, clearing bills, recording income, updating budget limits) will automatically generate an immutable audit log here.'}
              </p>
              {onOpenTransactionForm && (
                <button
                  type="button"
                  onClick={onOpenTransactionForm}
                  className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  <span>Log First Transaction</span>
                </button>
              )}
            </div>
          )}
        </div>
        </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
