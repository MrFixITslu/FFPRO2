import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell, 
  PieChart, 
  Pie, 
  Legend 
} from 'recharts';
import { 
  Transaction, 
  RecurringExpense, 
  RecurringIncome, 
  CATEGORIES 
} from '../types';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  ChevronLeft,
  Search,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  Sparkles,
  PieChart as PieIcon,
  BarChart3,
  Layers,
  ShieldAlert,
  Edit2,
  Check,
  X,
  Plus,
  RefreshCw,
  ExternalLink,
  Target,
  Zap,
  Info,
  Sliders,
  ChevronDown,
  Trash2,
  ListFilter
} from 'lucide-react';
import {
  TimePeriodType,
  ComparisonType,
  computePeriodComparison,
  calculateFinancialIntelligence,
  CategoryMetric,
  FinancialInsightItem,
  AnomalyItem,
  CashflowPoint,
  parseDateSafe,
  formatDateISO
} from '../utils/financialAnalytics';

interface Props {
  transactions: Transaction[];
  recurringExpenses?: RecurringExpense[];
  recurringIncomes?: RecurringIncome[];
  categoryBudgets: Record<string, number>;
  onUpdateCategoryBudget?: (category: string, amount: number) => void;
  onEditTransaction?: (t: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onOpenTransactionForm?: () => void;
}

type SectionViewMode = 'all' | 'spending' | 'cashflow' | 'matrix' | 'insights' | 'forecast';
type MatrixSortKey = 'amount' | 'amount_asc' | 'change_desc' | 'change_asc' | 'budget_desc' | 'count_desc';

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f59e0b',
  Transport: '#3b82f6',
  Housing: '#6366f1',
  Entertainment: '#ec4899',
  Utilities: '#06b6d4',
  Health: '#10b981',
  Shopping: '#8b5cf6',
  Education: '#14b8a6',
  Personal: '#f97316',
  Other: '#64748b',
  Savings: '#059669',
  Investments: '#4f46e5',
  Income: '#10b981',
  Transfer: '#64748b'
};

export const SpendingCashflowIntelligence: React.FC<Props> = ({
  transactions,
  recurringExpenses = [],
  recurringIncomes = [],
  categoryBudgets,
  onUpdateCategoryBudget,
  onEditTransaction,
  onDeleteTransaction,
  onOpenTransactionForm
}) => {
  // --- Time Controls State ---
  const [periodType, setPeriodType] = useState<TimePeriodType>('month');
  const [comparisonType, setComparisonType] = useState<ComparisonType>('previous_period');
  const [referenceDateOffset, setReferenceDateOffset] = useState<number>(0);
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({
    start: formatDateISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    end: formatDateISO(new Date())
  });

  // --- View Mode & Matrix Settings ---
  const [viewMode, setViewMode] = useState<SectionViewMode>('all');
  const [trajectoryGranularity, setTrajectoryGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [matrixSort, setMatrixSort] = useState<MatrixSortKey>('amount');
  const [selectedCategoryForTrend, setSelectedCategoryForTrend] = useState<string | null>(null);

  // --- Inline Budget Editing ---
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editBudgetValue, setEditBudgetValue] = useState<string>('');

  // --- Drilldown Modal State ---
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownTransactionIds, setDrilldownTransactionIds] = useState<string[]>([]);
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [drilldownTypeFilter, setDrilldownTypeFilter] = useState<'all' | 'expense' | 'income'>('all');

  // Compute reference date from offset
  const referenceDate = useMemo(() => {
    const d = new Date();
    if (referenceDateOffset === 0) return d;
    if (periodType === 'week') {
      d.setDate(d.getDate() + referenceDateOffset * 7);
    } else if (periodType === 'month') {
      d.setMonth(d.getMonth() + referenceDateOffset);
    } else if (periodType === 'year') {
      d.setFullYear(d.getFullYear() + referenceDateOffset);
    }
    return d;
  }, [referenceDateOffset, periodType]);

  // Compute Period & Comparison Windows
  const periodComparison = useMemo(() => {
    return computePeriodComparison(periodType, comparisonType, referenceDate, customRange);
  }, [periodType, comparisonType, referenceDate, customRange]);

  // Compute Full Financial Intelligence Engine
  const analytics = useMemo(() => {
    return calculateFinancialIntelligence(transactions, categoryBudgets, periodComparison);
  }, [transactions, categoryBudgets, periodComparison]);

  const {
    summaryMetrics,
    categoryMatrix,
    trajectoryPoints,
    insights,
    anomalies,
    forecast,
    intelligence,
    currentTransactions
  } = analytics;

  // Sorted Category Matrix
  const sortedCategories = useMemo(() => {
    const list = [...categoryMatrix];
    switch (matrixSort) {
      case 'amount':
        return list.sort((a, b) => b.amount - a.amount);
      case 'amount_asc':
        return list.sort((a, b) => a.amount - b.amount);
      case 'change_desc':
        return list.sort((a, b) => b.dollarChange - a.dollarChange);
      case 'change_asc':
        return list.sort((a, b) => a.dollarChange - b.dollarChange);
      case 'budget_desc':
        return list.sort((a, b) => b.budgetUsagePercent - a.budgetUsagePercent);
      case 'count_desc':
        return list.sort((a, b) => b.transactionCount - a.transactionCount);
      default:
        return list;
    }
  }, [categoryMatrix, matrixSort]);

  // Pie chart data for Category Composition
  const pieChartData = useMemo(() => {
    return sortedCategories
      .filter(c => c.amount > 0)
      .map(c => ({
        name: c.name,
        value: c.amount,
        color: CATEGORY_COLORS[c.name] || '#6366f1'
      }));
  }, [sortedCategories]);

  // Selected Category Trend Data
  const activeCategoryTrend = useMemo(() => {
    const catName = selectedCategoryForTrend || (sortedCategories[0] ? sortedCategories[0].name : null);
    if (!catName) return null;
    const cat = categoryMatrix.find(c => c.name === catName);
    return cat ? { name: cat.name, points: cat.trendPoints, current: cat.amount, budget: cat.budget } : null;
  }, [selectedCategoryForTrend, sortedCategories, categoryMatrix]);

  // Drilldown Transactions
  const drilldownTransactions = useMemo(() => {
    let txs = transactions.filter(t => drilldownTransactionIds.includes(t.id));
    if (drilldownTypeFilter !== 'all') {
      txs = txs.filter(t => t.type === drilldownTypeFilter);
    }
    if (drilldownSearch.trim()) {
      const q = drilldownSearch.toLowerCase();
      txs = txs.filter(t => 
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.vendor && t.vendor.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.institution && t.institution.toLowerCase().includes(q))
      );
    }
    return txs.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, drilldownTransactionIds, drilldownSearch, drilldownTypeFilter]);

  // Handlers for Drilldown
  const openDrilldown = (title: string, txIds: string[]) => {
    setDrilldownTitle(title);
    setDrilldownTransactionIds(txIds);
    setDrilldownSearch('');
    setDrilldownTypeFilter('all');
    setDrilldownModalOpen(true);
  };

  const openCategoryDrilldown = (catName: string) => {
    const catTxs = currentTransactions.filter(t => t.category === catName);
    openDrilldown(`Transactions for ${catName} (${periodComparison.label})`, catTxs.map(t => t.id));
  };

  const openChartPointDrilldown = (point: CashflowPoint) => {
    openDrilldown(`Transactions on ${point.label}`, point.transactionIds);
  };

  // Inline Budget Limit Edit
  const startEditCategoryBudget = (category: string, currentBudget: number) => {
    setEditingCategory(category);
    setEditBudgetValue(currentBudget > 0 ? currentBudget.toString() : '');
  };

  const saveCategoryBudget = (category: string) => {
    if (onUpdateCategoryBudget) {
      const val = parseFloat(editBudgetValue);
      onUpdateCategoryBudget(category, isNaN(val) || val < 0 ? 0 : val);
    }
    setEditingCategory(null);
    setEditBudgetValue('');
  };

  // Export Drilldown CSV
  const handleExportDrilldownCSV = () => {
    if (drilldownTransactions.length === 0) return;
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Institution', 'Notes'];
    const rows = drilldownTransactions.map(t => [
      t.date,
      t.type,
      `"${t.category.replace(/"/g, '""')}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount,
      `"${(t.institution || '').replace(/"/g, '""')}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_drilldown_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="unified-spending-cashflow-intelligence" className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* Unified Section Header & Time Controls                        */}
      {/* ------------------------------------------------------------- */}
      <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <Sparkles size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Spending, Cashflow & Insights
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wider">
                    Unified Intel
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Real-time cashflow trajectory, category spend matrices, behavioural anomalies, and forward projections
                </p>
              </div>
            </div>
          </div>

          {/* Unified Time Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Period Type Toggles */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              {(['week', 'month', 'year', 'custom'] as TimePeriodType[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setPeriodType(t);
                    setReferenceDateOffset(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    periodType === t
                      ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Comparison Mode Selector */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <span className="text-[9px] font-bold uppercase text-slate-600 mr-1.5">Compare:</span>
              <select
                value={comparisonType}
                onChange={e => setComparisonType(e.target.value as ComparisonType)}
                className="bg-transparent text-[10px] font-black text-slate-700 outline-hidden cursor-pointer"
              >
                <option value="previous_period">Prior Period</option>
                <option value="previous_year">Prior Year</option>
                <option value="none">None</option>
              </select>
            </div>

            {/* Navigation Buttons (Prev / Today / Next) */}
            {periodType !== 'custom' && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setReferenceDateOffset(prev => prev - 1)}
                  className="w-7 h-7 rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center text-xs shadow-xs border border-slate-200 transition"
                  title="Previous Period"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setReferenceDateOffset(0)}
                  disabled={referenceDateOffset === 0}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                    referenceDateOffset === 0 
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                      : 'bg-white text-slate-700 hover:bg-slate-50 shadow-xs border border-slate-200'
                  }`}
                >
                  Current
                </button>
                <button
                  onClick={() => setReferenceDateOffset(prev => prev + 1)}
                  className="w-7 h-7 rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center text-xs shadow-xs border border-slate-200 transition"
                  title="Next Period"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sub-Header: Active Window Banner & Perspective Navigation */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              <Calendar size={13} className="inline mr-1.5 text-indigo-600" />
              {periodComparison.label}
            </span>
            {comparisonType !== 'none' && (
              <span className="text-[11px] font-semibold text-slate-500">
                vs <strong className="text-slate-700 font-bold">{periodComparison.comparisonLabel}</strong>
              </span>
            )}
            {periodComparison.currentEnd > new Date() && (
              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                Month-to-Date / Active
              </span>
            )}
          </div>

          {/* Perspective Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'all', label: 'All-in-One' },
              { id: 'spending', label: 'Spending Breakdown' },
              { id: 'cashflow', label: 'Cashflow Trajectory' },
              { id: 'matrix', label: 'Category Matrix' },
              { id: 'insights', label: `Insights (${insights.length + anomalies.length})` },
              { id: 'forecast', label: 'Forecast' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as SectionViewMode)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                  viewMode === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Top KPI Cards with Comparative Indicators                     */}
        {/* ------------------------------------------------------------- */}
        <div className="p-5 sm:p-6 grid grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/30">
          {/* Card 1: Total Spending */}
          <div 
            onClick={() => openDrilldown(`Outflows for ${periodComparison.label}`, currentTransactions.filter(t => t.type === 'expense').map(t => t.id))}
            className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Total Spending</span>
              <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown size={13} />
              </div>
            </div>
            <h3 className="text-lg font-black text-slate-900">
              ${summaryMetrics.totalSpending.toLocaleString()}
            </h3>
            {comparisonType !== 'none' && (
              <div className="mt-2 flex items-center gap-1 text-[10px] font-bold">
                {summaryMetrics.spendingDollarChange <= 0 ? (
                  <span className="text-emerald-600 flex items-center">
                    <ArrowDownRight size={13} className="mr-0.5" />
                    -${Math.abs(summaryMetrics.spendingDollarChange).toLocaleString()} ({Math.abs(summaryMetrics.spendingPercentChange).toFixed(1)}%)
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center">
                    <ArrowUpRight size={13} className="mr-0.5" />
                    +${summaryMetrics.spendingDollarChange.toLocaleString()} (+{summaryMetrics.spendingPercentChange.toFixed(1)}%)
                  </span>
                )}
                <span className="text-slate-600 font-normal">vs prior</span>
              </div>
            )}
          </div>

          {/* Card 2: Total Income */}
          <div 
            onClick={() => openDrilldown(`Inflows for ${periodComparison.label}`, currentTransactions.filter(t => t.type === 'income').map(t => t.id))}
            className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Total Inflow</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp size={13} />
              </div>
            </div>
            <h3 className="text-lg font-black text-slate-900">
              ${summaryMetrics.totalIncome.toLocaleString()}
            </h3>
            {comparisonType !== 'none' && (
              <div className="mt-2 flex items-center gap-1 text-[10px] font-bold">
                {summaryMetrics.incomeDollarChange >= 0 ? (
                  <span className="text-emerald-600 flex items-center">
                    <ArrowUpRight size={13} className="mr-0.5" />
                    +${summaryMetrics.incomeDollarChange.toLocaleString()} (+{summaryMetrics.incomePercentChange.toFixed(1)}%)
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center">
                    <ArrowDownRight size={13} className="mr-0.5" />
                    -${Math.abs(summaryMetrics.incomeDollarChange).toLocaleString()} (-{Math.abs(summaryMetrics.incomePercentChange).toFixed(1)}%)
                  </span>
                )}
                <span className="text-slate-600 font-normal">vs prior</span>
              </div>
            )}
          </div>

          {/* Card 3: Net Cashflow */}
          <div 
            onClick={() => setViewMode('cashflow')}
            className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Net Cashflow</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                summaryMetrics.netCashflow >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {summaryMetrics.netCashflow >= 0 ? 'Surplus' : 'Deficit'}
              </span>
            </div>
            <h3 className={`text-lg font-black ${summaryMetrics.netCashflow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {summaryMetrics.netCashflow >= 0 ? '+' : ''}${summaryMetrics.netCashflow.toLocaleString()}
            </h3>
            <p className="mt-2 text-[10px] text-slate-600 font-medium truncate">
              {summaryMetrics.cashflowHealth.ratioPercent.toFixed(1)}% margin of inflow
            </p>
          </div>

          {/* Card 4: Daily Safe Spend / Run Rate */}
          <div 
            onClick={() => setViewMode('spending')}
            className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Daily Avg Outlay</span>
              <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Clock size={13} />
              </div>
            </div>
            <h3 className="text-lg font-black text-slate-900">
              ${summaryMetrics.averageDailySpending.toFixed(2)}
              <span className="text-xs font-normal text-slate-600">/day</span>
            </h3>
            <p className="mt-2 text-[10px] text-slate-600 font-medium">
              {summaryMetrics.transactionCount} transactions ({summaryMetrics.daysElapsed} days logged)
            </p>
          </div>
        </div>

        {/* Cashflow Health Context Banner */}
        <div className={`px-6 py-3 border-t border-slate-100 flex items-center justify-between gap-4 ${
          summaryMetrics.netCashflow >= 0 ? 'bg-emerald-50/40 text-emerald-950' : 'bg-rose-50/40 text-rose-950'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${summaryMetrics.netCashflow >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></div>
            <p className="text-xs font-semibold">
              <strong>{summaryMetrics.cashflowHealth.headline}:</strong> {summaryMetrics.cashflowHealth.description}
            </p>
          </div>
          <button
            onClick={() => setViewMode('insights')}
            className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 flex items-center gap-1 shrink-0"
          >
            <span>Review Insights</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* Perspective A: Cashflow Trajectory & Trend Visualizer          */}
      {/* ------------------------------------------------------------- */}
      {(viewMode === 'all' || viewMode === 'cashflow') && (
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                  Cashflow Trajectory
                </h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {trajectoryPoints.length} Data Points
                </span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                Dynamic Inflow vs Outflow curves with interactive transaction drill-down
              </p>
            </div>

            {/* Trajectory Granularity Toggles */}
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(['daily', 'weekly', 'monthly'] as ('daily' | 'weekly' | 'monthly')[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setTrajectoryGranularity(g)}
                    className={`px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                      trajectoryGranularity === g
                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-100'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {onOpenTransactionForm && (
                <button
                  onClick={onOpenTransactionForm}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1"
                >
                  <Plus size={12} />
                  <span>Add Tx</span>
                </button>
              )}
            </div>
          </div>

          {/* Area / Net Chart */}
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={trajectoryPoints}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload[0]) {
                    const point = e.activePayload[0].payload as CashflowPoint;
                    if (point && point.transactionIds && point.transactionIds.length > 0) {
                      openChartPointDrilldown(point);
                    }
                  }
                }}
              >
                <defs>
                  <linearGradient id="colorIncomeUnified" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorExpenseUnified" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as CashflowPoint;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[160px]">
                          <p className="font-bold text-indigo-300 uppercase tracking-wider text-[10px]">{data.label}</p>
                          <div className="flex justify-between items-center text-emerald-400 font-bold">
                            <span>Inflow:</span>
                            <span>+${data.inflow.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-rose-400 font-bold">
                            <span>Outflow:</span>
                            <span>-${data.outflow.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-800 font-black">
                            <span>Net Cashflow:</span>
                            <span className={data.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {data.net >= 0 ? '+' : ''}${data.net.toLocaleString()}
                            </span>
                          </div>
                          {data.transactionIds.length > 0 && (
                            <p className="text-[9px] text-slate-400 pt-1 text-center italic">
                              Click point to inspect {data.transactionIds.length} txs
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingBottom: '10px' }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="inflow" 
                  stroke="#10b981" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorIncomeUnified)" 
                  name="Inflow (Deposits)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="outflow" 
                  stroke="#ef4444" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorExpenseUnified)" 
                  name="Outflow (Spending)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Perspective B: Spending Breakdown & Period Intelligence        */}
      {/* ------------------------------------------------------------- */}
      {(viewMode === 'all' || viewMode === 'spending') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Week-over-Week & Month-over-Month Intelligence Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Period Intelligence
                </span>
                <span className="text-[10px] font-bold text-slate-600 uppercase">
                  {periodComparison.comparisonLabel}
                </span>
              </div>
              <h4 className="text-sm font-black text-slate-900 leading-snug">
                {intelligence.headline}
              </h4>
              <p className="text-xs text-slate-600 font-medium mt-2 leading-relaxed">
                {intelligence.summary}
              </p>

              {/* Driver Categories List */}
              {intelligence.topDrivers.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Top Variance Drivers:</p>
                  {intelligence.topDrivers.map((d, i) => (
                    <div 
                      key={i}
                      onClick={() => openCategoryDrilldown(d.category)}
                      className="p-2 bg-slate-50 hover:bg-indigo-50/50 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs cursor-pointer transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[d.category] || '#6366f1' }}></span>
                        <span className="font-bold text-slate-800">{d.category}</span>
                      </div>
                      <span className={`font-black ${d.dollarDiff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {d.dollarDiff > 0 ? '+' : ''}${d.dollarDiff.toLocaleString()} ({d.percentDiff > 0 ? '+' : ''}{d.percentDiff.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => openDrilldown(`Contributing Transactions (${periodComparison.label})`, intelligence.contributingTransactionIds)}
              className="mt-6 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>View All Contributing Transactions</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Category Composition Donut / Distribution */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                  Category Spending Composition
                </h3>
                <p className="text-[11px] text-slate-600 font-medium">
                  Relative distribution of all expenditures across active categories
                </p>
              </div>
              <span className="text-xs font-black text-slate-900">
                ${summaryMetrics.totalSpending.toLocaleString()} Total
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center flex-1">
              {/* Donut Chart */}
              <div className="h-[220px] w-full">
                {pieChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color} 
                            className="cursor-pointer hover:opacity-80 transition"
                            onClick={() => openCategoryDrilldown(entry.name)}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Spent']}
                        contentStyle={{ borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 font-bold uppercase text-xs">
                    No Expenses in Selected Range
                  </div>
                )}
              </div>

              {/* Category Ranking List */}
              <div className="space-y-2.5 overflow-y-auto max-h-[220px] custom-scrollbar pr-2">
                {sortedCategories.slice(0, 6).map((cat, idx) => (
                  <div 
                    key={idx}
                    onClick={() => openCategoryDrilldown(cat.name)}
                    className="group cursor-pointer p-1.5 rounded-lg hover:bg-slate-50 transition"
                  >
                    <div className="flex justify-between items-center text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat.name] || '#6366f1' }}></span>
                        <span className="font-bold text-slate-800">{cat.name}</span>
                        <span className="text-[10px] text-slate-600 font-medium">({cat.transactionCount} txs)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-900">${cat.amount.toLocaleString()}</span>
                        <span className="text-[10px] font-bold text-slate-600 ml-1.5">
                          ({cat.percentOfTotalSpending.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-700"
                        style={{ 
                          width: `${cat.percentOfTotalSpending}%`,
                          backgroundColor: CATEGORY_COLORS[cat.name] || '#6366f1' 
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Perspective C: Category Spend Matrix & Inline Budgets          */}
      {/* ------------------------------------------------------------- */}
      {(viewMode === 'all' || viewMode === 'matrix') && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                  Category Spend Matrix & Budget Control
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  {sortedCategories.length} Categories
                </span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                Full ledger breakdown with variance analysis, budget tracking, and inline limit adjustments
              </p>
            </div>

            {/* Matrix Sorting Controls */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-slate-600 flex items-center gap-1">
                <ListFilter size={12} /> Sort By:
              </span>
              <select
                value={matrixSort}
                onChange={e => setMatrixSort(e.target.value as MatrixSortKey)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 outline-hidden cursor-pointer"
              >
                <option value="amount">Highest Spending</option>
                <option value="amount_asc">Lowest Spending</option>
                <option value="change_desc">Largest Increase ($)</option>
                <option value="change_asc">Largest Decrease ($)</option>
                <option value="budget_desc">Budget Usage (%)</option>
                <option value="count_desc">Transaction Volume</option>
              </select>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[9px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4 min-w-[140px]">Category</th>
                  <th className="py-3 px-4 text-right">Current Spend</th>
                  <th className="py-3 px-4 text-right">Prior Spend</th>
                  <th className="py-3 px-4 text-right">Variance ($ / %)</th>
                  <th className="py-3 px-4 min-w-[150px]">Budget Limit & Progress</th>
                  <th className="py-3 px-4 text-right">Daily Avg</th>
                  <th className="py-3 px-4 text-right">% of Total</th>
                  <th className="py-3 px-4 text-center">Tx Count</th>
                  <th className="py-3 px-4 text-right">Avg / Tx</th>
                  <th className="py-3 px-4 text-right w-16">Drilldown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {sortedCategories.map((cat, idx) => {
                  const isEditing = editingCategory === cat.name;
                  const catColor = CATEGORY_COLORS[cat.name] || '#6366f1';

                  return (
                    <tr 
                      key={idx}
                      className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                      onClick={() => openCategoryDrilldown(cat.name)}
                    >
                      {/* Category Name & Color Dot */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: catColor }}></span>
                          <span className="font-bold text-slate-900">{cat.name}</span>
                        </div>
                      </td>

                      {/* Current Spend */}
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        ${cat.amount.toLocaleString()}
                      </td>

                      {/* Prior Spend */}
                      <td className="py-3 px-4 text-right font-semibold text-slate-500">
                        ${cat.previousAmount.toLocaleString()}
                      </td>

                      {/* Variance */}
                      <td className="py-3 px-4 text-right font-bold">
                        {cat.previousAmount > 0 ? (
                          <span className={cat.dollarChange > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {cat.dollarChange > 0 ? '+' : ''}${cat.dollarChange.toLocaleString()}
                            <span className="text-[10px] ml-1">
                              ({cat.percentChange > 0 ? '+' : ''}{cat.percentChange.toFixed(0)}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-600 font-normal">—</span>
                        )}
                      </td>

                      {/* Budget Limit & Inline Edit */}
                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            {isEditing ? (
                              <div className="flex items-center gap-1 animate-in fade-in">
                                <input
                                  type="number"
                                  autoFocus
                                  value={editBudgetValue}
                                  onChange={e => setEditBudgetValue(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && saveCategoryBudget(cat.name)}
                                  placeholder="Limit"
                                  className="w-16 h-5 bg-white border border-indigo-300 rounded px-1.5 text-[10px] font-bold outline-hidden focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                  onClick={() => saveCategoryBudget(cat.name)}
                                  className="w-5 h-5 bg-indigo-600 text-white rounded flex items-center justify-center text-[9px] hover:bg-indigo-700"
                                >
                                  <Check size={10} />
                                </button>
                                <button
                                  onClick={() => setEditingCategory(null)}
                                  className="w-5 h-5 bg-slate-200 text-slate-600 rounded flex items-center justify-center text-[9px] hover:bg-slate-300"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-700">
                                  {cat.budget > 0 ? `$${cat.budget.toLocaleString()}` : 'Uncapped'}
                                </span>
                                {onUpdateCategoryBudget && (
                                  <button
                                    onClick={() => startEditCategoryBudget(cat.name, cat.budget)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition"
                                    title="Edit budget limit"
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                )}
                              </div>
                            )}

                            <span className={`font-bold ${
                              cat.status === 'exceeded' ? 'text-rose-600' : cat.status === 'approaching' ? 'text-amber-600' : 'text-slate-400'
                            }`}>
                              {cat.budget > 0 ? `${cat.budgetUsagePercent.toFixed(0)}%` : ''}
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-700 ${
                                cat.status === 'exceeded' 
                                  ? 'bg-rose-500' 
                                  : cat.status === 'approaching' 
                                  ? 'bg-amber-500' 
                                  : 'bg-indigo-500'
                              }`}
                              style={{ width: `${Math.min(100, cat.budget > 0 ? cat.budgetUsagePercent : 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Daily Avg */}
                      <td className="py-3 px-4 text-right font-semibold text-slate-700">
                        ${cat.dailyAverage.toFixed(2)}
                      </td>

                      {/* % of Total */}
                      <td className="py-3 px-4 text-right font-bold text-slate-800">
                        {cat.percentOfTotalSpending.toFixed(1)}%
                      </td>

                      {/* Transaction Count */}
                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        {cat.transactionCount}
                      </td>

                      {/* Average Amount per Tx */}
                      <td className="py-3 px-4 text-right font-semibold text-slate-600">
                        ${cat.averageTransactionAmount.toFixed(2)}
                      </td>

                      {/* Action Drilldown */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openCategoryDrilldown(cat.name)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          title="Drill into transactions"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Perspective D: Insights & Spending Behaviour Anomalies        */}
      {/* ------------------------------------------------------------- */}
      {(viewMode === 'all' || viewMode === 'insights') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Automated Financial Insights */}
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles size={14} />
                </div>
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                  Automated Financial Insights
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-600 uppercase">
                {insights.length} Signals
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[350px] custom-scrollbar pr-1">
              {insights.length > 0 ? (
                insights.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.transactionIds && item.transactionIds.length > 0) {
                        openDrilldown(item.title, item.transactionIds);
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      item.type === 'alert'
                        ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300'
                        : item.type === 'warning'
                        ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                        : item.type === 'positive'
                        ? 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-300'
                        : 'bg-slate-50 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-2">
                        {item.type === 'alert' || item.type === 'warning' ? (
                          <AlertTriangle size={15} className={item.type === 'alert' ? 'text-rose-600' : 'text-amber-600'} />
                        ) : item.type === 'positive' ? (
                          <CheckCircle size={15} className="text-emerald-600" />
                        ) : (
                          <Zap size={15} className="text-indigo-600" />
                        )}
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                          <p className="text-[11px] text-slate-600 mt-0.5">{item.description}</p>
                        </div>
                      </div>
                      {item.metricValue && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-white border border-slate-200 shadow-2xs whitespace-nowrap">
                          {item.metricValue}
                        </span>
                      )}
                    </div>
                    {item.transactionIds && item.transactionIds.length > 0 && (
                      <div className="mt-2 text-right">
                        <span className="text-[10px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-0.5">
                          <span>{item.actionLabel || 'Inspect Transactions'}</span>
                          <ChevronRight size={11} />
                        </span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="py-12 text-center text-slate-600 font-bold uppercase text-xs">
                  All metrics operating within normal baseline bounds
                </p>
              )}
            </div>
          </section>

          {/* Spending Behaviour & Anomalies */}
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <ShieldAlert size={14} />
                </div>
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                  Spending Behaviour & Anomalies
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-600 uppercase">
                {anomalies.length} Detected
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[350px] custom-scrollbar pr-1">
              {anomalies.length > 0 ? (
                anomalies.map((anom) => (
                  <div
                    key={anom.id}
                    onClick={() => openDrilldown(anom.title, anom.transactionIds)}
                    className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 transition-all cursor-pointer group"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                            anom.severity === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {anom.type.replace('_', ' ')}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900">{anom.title}</h4>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1">{anom.detail}</p>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                        <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center space-y-1">
                  <CheckCircle size={22} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800">No Anomalies Flagged</p>
                  <p className="text-[11px] text-slate-600">No outlier charges or potential duplicate entries detected in this timeframe.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Perspective E: Run-Rate Forecasting & Projections             */}
      {/* ------------------------------------------------------------- */}
      {(viewMode === 'all' || viewMode === 'forecast') && (
        <section className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <Target size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-sm uppercase tracking-wider text-white">
                    Period-End Forecast & Run-Rate Projections
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-widest">
                    Estimate
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Extrapolating active daily run rates across the remaining {forecast.daysRemaining} days in this period
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Projected Net Cashflow</span>
              <h4 className={`text-base font-black ${forecast.projectedPeriodNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {forecast.projectedPeriodNet >= 0 ? '+' : ''}${forecast.projectedPeriodNet.toLocaleString()}
              </h4>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-1">
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Projected Total Outflow</span>
              <h4 className="text-base font-black text-white">${forecast.projectedPeriodSpending.toLocaleString()}</h4>
              <p className="text-[10px] text-slate-400">Current: ${summaryMetrics.totalSpending.toLocaleString()} + ${(forecast.spendingRunRateDaily * forecast.daysRemaining).toLocaleString()} est.</p>
            </div>

            <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-1">
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Projected Total Inflow</span>
              <h4 className="text-base font-black text-emerald-400">${forecast.projectedPeriodIncome.toLocaleString()}</h4>
              <p className="text-[10px] text-slate-400">Based on active inflow rate of ${forecast.incomeRunRateDaily.toFixed(0)}/day</p>
            </div>

            <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-1">
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Budget Health Warning</span>
              <h4 className={`text-base font-black ${forecast.categoriesAtRiskOfOverBudget.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {forecast.categoriesAtRiskOfOverBudget.length === 0 
                  ? 'All Budgets on Track' 
                  : `${forecast.categoriesAtRiskOfOverBudget.length} Categories at Risk`}
              </h4>
              <p className="text-[10px] text-slate-400">
                {forecast.categoriesAtRiskOfOverBudget.length > 0 
                  ? forecast.categoriesAtRiskOfOverBudget.map(c => c.name).join(', ') 
                  : 'Spending pace is sustainable'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Interactive Transaction Drill-Down Modal                       */}
      {/* ------------------------------------------------------------- */}
      {drilldownModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/80">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900">{drilldownTitle}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    {drilldownTransactions.length} {drilldownTransactions.length === 1 ? 'transaction' : 'transactions'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Total Value: <strong className="text-slate-900">${drilldownTransactions.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportDrilldownCSV}
                  disabled={drilldownTransactions.length === 0}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40"
                  title="Export filtered CSV"
                >
                  <Download size={13} />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
                <button
                  onClick={() => setDrilldownModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Search & Filter Bar */}
            <div className="p-3.5 bg-white border-b border-slate-100 flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by description, vendor, category..."
                  value={drilldownSearch}
                  onChange={e => setDrilldownSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(['all', 'expense', 'income'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setDrilldownTypeFilter(type)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                      drilldownTypeFilter === type
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Transaction Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
              {drilldownTransactions.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100 text-[9px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-xs">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Account</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      {(onEditTransaction || onDeleteTransaction) && (
                        <th className="py-2.5 px-4 text-right w-16">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {drilldownTransactions.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-slate-600 whitespace-nowrap">
                          {t.date}
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-bold text-slate-900">{t.description}</p>
                          {t.vendor && <p className="text-[10px] text-slate-600">{t.vendor}</p>}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: CATEGORY_COLORS[t.category] || '#6366f1' }}
                          >
                            {t.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-600 whitespace-nowrap">
                          {t.institution || 'Cash in Hand'}
                        </td>
                        <td className={`py-2.5 px-4 text-right font-black whitespace-nowrap ${
                          t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'
                        }`}>
                          {t.type === 'income' ? '+' : ''}${t.amount.toLocaleString()}
                        </td>
                        {(onEditTransaction || onDeleteTransaction) && (
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {onEditTransaction && (
                                <button
                                  onClick={() => {
                                    setDrilldownModalOpen(false);
                                    onEditTransaction(t);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition"
                                  title="Edit Transaction"
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                              {onDeleteTransaction && (
                                <button
                                  onClick={() => onDeleteTransaction(t.id)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                  title="Delete Transaction"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-16 text-center space-y-1">
                  <p className="text-sm font-bold text-slate-700">No Transactions Found</p>
                  <p className="text-xs text-slate-600">No records match the current filter or search criteria.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setDrilldownModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-xs"
              >
                Close Drilldown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpendingCashflowIntelligence;
