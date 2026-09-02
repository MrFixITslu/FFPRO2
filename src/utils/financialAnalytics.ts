import { Transaction, CATEGORIES } from '../types';

export type TimePeriodType = 'week' | 'month' | 'year' | 'custom';
export type ComparisonType = 'previous_period' | 'previous_year' | 'none';
export type Granularity = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface PeriodComparison {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
  label: string;
  comparisonLabel: string;
}

export interface CategoryMetric {
  name: string;
  amount: number;
  previousAmount: number;
  dollarChange: number;
  percentChange: number;
  budget: number;
  remainingBudget: number;
  budgetUsagePercent: number;
  percentOfTotalSpending: number;
  transactionCount: number;
  previousTransactionCount: number;
  averageTransactionAmount: number;
  dailyAverage: number;
  status: 'under' | 'approaching' | 'exceeded' | 'uncapped';
  trendPoints: { label: string; amount: number }[];
}

export interface CashflowPoint {
  label: string;
  dateKey: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulativeNet: number;
  transactionIds: string[];
}

export interface FinancialInsightItem {
  id: string;
  title: string;
  description: string;
  category?: string;
  type: 'positive' | 'warning' | 'neutral' | 'trend' | 'alert';
  metricValue?: string;
  delta?: string;
  transactionIds?: string[];
  actionLabel?: string;
}

export interface AnomalyItem {
  id: string;
  type: 'large_transaction' | 'rapid_increase' | 'possible_duplicate' | 'high_spend_day' | 'concentration_risk';
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  amount?: number;
  date?: string;
  category?: string;
  transactionIds: string[];
}

export interface FinancialSummaryMetrics {
  totalSpending: number;
  previousSpending: number;
  spendingDollarChange: number;
  spendingPercentChange: number;

  totalIncome: number;
  previousIncome: number;
  incomeDollarChange: number;
  incomePercentChange: number;

  netCashflow: number;
  previousNetCashflow: number;
  netCashflowChange: number;

  averageDailySpending: number;
  previousAverageDailySpending: number;

  largestCategory: { name: string; amount: number; percentOfTotal: number; changePercent: number } | null;

  transactionCount: number;
  previousTransactionCount: number;
  transactionCountChange: number;

  averageTransactionValue: number;
  previousAverageTransactionValue: number;
  averageTransactionValueChange: number;

  cashflowHealth: {
    status: 'positive' | 'negative' | 'neutral';
    headline: string;
    description: string;
    ratioPercent: number;
  };

  daysInPeriod: number;
  daysElapsed: number;
}

export interface ForecastMetrics {
  projectedPeriodSpending: number;
  projectedPeriodIncome: number;
  projectedPeriodNet: number;
  spendingRunRateDaily: number;
  incomeRunRateDaily: number;
  daysRemaining: number;
  isProjected: boolean;
  categoriesAtRiskOfOverBudget: { name: string; current: number; projected: number; budget: number; overage: number }[];
}

export interface PeriodOverPeriodIntelligence {
  type: 'week' | 'month' | 'year';
  headline: string;
  summary: string;
  spentCurrent: number;
  spentPrevious: number;
  difference: number;
  percentChange: number;
  isIncrease: boolean;
  topDrivers: { category: string; dollarDiff: number; percentDiff: number; current: number; previous: number }[];
  isPartialPeriod: boolean;
  contributingTransactionIds: string[];
}

// ---------------------------------------------------------------------------
// Helper: Safe Date parsing
// ---------------------------------------------------------------------------
export function parseDateSafe(dateInput: string | Date): Date {
  if (dateInput instanceof Date) return new Date(dateInput);
  if (!dateInput) return new Date();
  if (dateInput.includes('T')) return new Date(dateInput);
  const parts = dateInput.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  return new Date(dateInput);
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Date Range & Comparison Calculations
// ---------------------------------------------------------------------------
export function computePeriodComparison(
  periodType: TimePeriodType,
  comparisonType: ComparisonType,
  referenceDate: Date = new Date(),
  customRange?: { start: string; end: string }
): PeriodComparison {
  const now = new Date(referenceDate);
  let currentStart: Date;
  let currentEnd: Date;
  let label = '';

  if (periodType === 'week') {
    // Start on Monday of current week
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // Monday
    currentStart = new Date(now);
    currentStart.setDate(now.getDate() + diff);
    currentStart.setHours(0, 0, 0, 0);

    currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);
    currentEnd.setHours(23, 59, 59, 999);

    label = `Week of ${currentStart.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`;
  } else if (periodType === 'month') {
    currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    label = now.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  } else if (periodType === 'year') {
    currentStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    label = `Year ${now.getFullYear()}`;
  } else {
    // Custom
    if (customRange && customRange.start && customRange.end) {
      currentStart = parseDateSafe(customRange.start);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd = parseDateSafe(customRange.end);
      currentEnd.setHours(23, 59, 59, 999);
      label = `${currentStart.toLocaleDateString('default', { month: 'short', day: 'numeric' })} – ${currentEnd.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      label = 'Custom Range';
    }
  }

  let previousStart: Date | null = null;
  let previousEnd: Date | null = null;
  let comparisonLabel = 'None';

  if (comparisonType === 'previous_period') {
    if (periodType === 'week') {
      previousStart = new Date(currentStart);
      previousStart.setDate(currentStart.getDate() - 7);
      previousEnd = new Date(currentEnd);
      previousEnd.setDate(currentEnd.getDate() - 7);
      comparisonLabel = `Previous Week (${previousStart.toLocaleDateString('default', { month: 'short', day: 'numeric' })})`;
    } else if (periodType === 'month') {
      previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1, 0, 0, 0, 0);
      previousEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), 0, 23, 59, 59, 999);
      comparisonLabel = previousStart.toLocaleDateString('default', { month: 'short', year: 'numeric' });
    } else if (periodType === 'year') {
      previousStart = new Date(currentStart.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      previousEnd = new Date(currentStart.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      comparisonLabel = `Year ${previousStart.getFullYear()}`;
    } else {
      // Custom: shift back by duration of custom range
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      previousEnd = new Date(currentStart.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - durationMs);
      comparisonLabel = 'Previous Period';
    }
  } else if (comparisonType === 'previous_year') {
    previousStart = new Date(currentStart);
    previousStart.setFullYear(currentStart.getFullYear() - 1);
    previousEnd = new Date(currentEnd);
    previousEnd.setFullYear(currentEnd.getFullYear() - 1);
    comparisonLabel = `Same Period Last Year (${previousStart.getFullYear()})`;
  }

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    label,
    comparisonLabel,
  };
}

// ---------------------------------------------------------------------------
// Core Analytics Computation
// ---------------------------------------------------------------------------
export function calculateFinancialIntelligence(
  transactions: Transaction[],
  categoryBudgets: Record<string, number>,
  periodComparison: PeriodComparison
) {
  const { currentStart, currentEnd, previousStart, previousEnd } = periodComparison;
  const currentStartTime = currentStart.getTime();
  const currentEndTime = currentEnd.getTime();
  const prevStartTime = previousStart ? previousStart.getTime() : null;
  const prevEndTime = previousEnd ? previousEnd.getTime() : null;

  // Filter transactions
  const currentTxs: Transaction[] = [];
  const previousTxs: Transaction[] = [];

  for (const t of transactions) {
    const tTime = parseDateSafe(t.date).getTime();
    if (tTime >= currentStartTime && tTime <= currentEndTime) {
      currentTxs.push(t);
    } else if (prevStartTime !== null && prevEndTime !== null && tTime >= prevStartTime && tTime <= prevEndTime) {
      previousTxs.push(t);
    }
  }

  // --- Current Period Totals ---
  const currentExpenses = currentTxs.filter(t => t.type === 'expense');
  const currentIncomes = currentTxs.filter(t => t.type === 'income');
  const previousExpenses = previousTxs.filter(t => t.type === 'expense');
  const previousIncomes = previousTxs.filter(t => t.type === 'income');

  const totalSpending = currentExpenses.reduce((acc, t) => acc + t.amount, 0);
  const previousSpending = previousExpenses.reduce((acc, t) => acc + t.amount, 0);
  const spendingDollarChange = totalSpending - previousSpending;
  const spendingPercentChange = previousSpending > 0 ? ((totalSpending - previousSpending) / previousSpending) * 100 : (totalSpending > 0 ? 100 : 0);

  const totalIncome = currentIncomes.reduce((acc, t) => acc + t.amount, 0);
  const previousIncome = previousIncomes.reduce((acc, t) => acc + t.amount, 0);
  const incomeDollarChange = totalIncome - previousIncome;
  const incomePercentChange = previousIncome > 0 ? ((totalIncome - previousIncome) / previousIncome) * 100 : (totalIncome > 0 ? 100 : 0);

  const netCashflow = totalIncome - totalSpending;
  const previousNetCashflow = previousIncome - previousSpending;
  const netCashflowChange = netCashflow - previousNetCashflow;

  // Days in period & elapsed calculation
  const totalDaysInPeriod = Math.max(1, Math.ceil((currentEndTime - currentStartTime) / (1000 * 60 * 60 * 24)));
  const nowTime = Date.now();
  const effectiveEndTime = Math.min(nowTime, currentEndTime);
  const daysElapsed = Math.max(1, Math.min(totalDaysInPeriod, Math.ceil((effectiveEndTime - currentStartTime) / (1000 * 60 * 60 * 24))));

  const averageDailySpending = totalSpending / daysElapsed;
  const prevDays = previousStart && previousEnd ? Math.max(1, Math.ceil((prevEndTime! - prevStartTime!) / (1000 * 60 * 60 * 24))) : totalDaysInPeriod;
  const previousAverageDailySpending = previousSpending / prevDays;

  const transactionCount = currentExpenses.length;
  const previousTransactionCount = previousExpenses.length;
  const transactionCountChange = transactionCount - previousTransactionCount;

  const averageTransactionValue = transactionCount > 0 ? totalSpending / transactionCount : 0;
  const previousAverageTransactionValue = previousTransactionCount > 0 ? previousSpending / previousTransactionCount : 0;
  const averageTransactionValueChange = averageTransactionValue - previousAverageTransactionValue;

  // --- Category Breakdown & Spend Matrix ---
  const currentCatSpend: Record<string, { total: number; count: number; txs: Transaction[] }> = {};
  const prevCatSpend: Record<string, { total: number; count: number }> = {};

  // Initialize from existing known categories & budget keys
  const categoryNamesSet = new Set<string>([
    ...CATEGORIES.filter(c => !['Income', 'Transfer', 'Savings', 'Investments'].includes(c)),
    ...Object.keys(categoryBudgets),
  ]);

  for (const t of currentExpenses) {
    categoryNamesSet.add(t.category);
    if (!currentCatSpend[t.category]) {
      currentCatSpend[t.category] = { total: 0, count: 0, txs: [] };
    }
    currentCatSpend[t.category].total += t.amount;
    currentCatSpend[t.category].count += 1;
    currentCatSpend[t.category].txs.push(t);
  }

  for (const t of previousExpenses) {
    categoryNamesSet.add(t.category);
    if (!prevCatSpend[t.category]) {
      prevCatSpend[t.category] = { total: 0, count: 0 };
    }
    prevCatSpend[t.category].total += t.amount;
    prevCatSpend[t.category].count += 1;
  }

  // Pre-calculate last 6 monthly trends per category for mini-sparklines
  const last6MonthsTrend: Record<string, { label: string; amount: number }[]> = {};
  categoryNamesSet.forEach(cat => {
    last6MonthsTrend[cat] = [];
  });

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0, 0).getTime();
    const mEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const monthLabel = monthDate.toLocaleDateString('default', { month: 'short' });

    const monthCategoryTotals: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === 'expense') {
        const tTime = parseDateSafe(t.date).getTime();
        if (tTime >= mStart && tTime <= mEnd) {
          monthCategoryTotals[t.category] = (monthCategoryTotals[t.category] || 0) + t.amount;
        }
      }
    }

    categoryNamesSet.forEach(cat => {
      last6MonthsTrend[cat].push({
        label: monthLabel,
        amount: monthCategoryTotals[cat] || 0,
      });
    });
  }

  const categoryMatrix: CategoryMetric[] = Array.from(categoryNamesSet)
    .filter(name => !['Income', 'Transfer', 'Savings', 'Investments'].includes(name))
    .map(name => {
      const cur = currentCatSpend[name] || { total: 0, count: 0, txs: [] };
      const prev = prevCatSpend[name] || { total: 0, count: 0 };
      const budget = categoryBudgets[name] || 0;
      const dollarChange = cur.total - prev.total;
      const percentChange = prev.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : (cur.total > 0 ? 100 : 0);
      const remainingBudget = budget > 0 ? budget - cur.total : 0;
      const budgetUsagePercent = budget > 0 ? (cur.total / budget) * 100 : 0;
      const percentOfTotalSpending = totalSpending > 0 ? (cur.total / totalSpending) * 100 : 0;
      const averageTransactionAmount = cur.count > 0 ? cur.total / cur.count : 0;
      const dailyAverage = cur.total / daysElapsed;

      let status: CategoryMetric['status'] = 'uncapped';
      if (budget > 0) {
        if (cur.total > budget) status = 'exceeded';
        else if (budgetUsagePercent >= 80) status = 'approaching';
        else status = 'under';
      }

      return {
        name,
        amount: cur.total,
        previousAmount: prev.total,
        dollarChange,
        percentChange,
        budget,
        remainingBudget,
        budgetUsagePercent,
        percentOfTotalSpending,
        transactionCount: cur.count,
        previousTransactionCount: prev.count,
        averageTransactionAmount,
        dailyAverage,
        status,
        trendPoints: last6MonthsTrend[name] || [],
      };
    })
    .sort((a, b) => b.amount - a.amount || b.budget - a.budget);

  // Largest category
  const activeCategories = categoryMatrix.filter(c => c.amount > 0);
  const largestCategory = activeCategories.length > 0 ? {
    name: activeCategories[0].name,
    amount: activeCategories[0].amount,
    percentOfTotal: activeCategories[0].percentOfTotalSpending,
    changePercent: activeCategories[0].percentChange,
  } : null;

  // Cashflow Health
  const cashflowRatio = totalIncome > 0 ? (netCashflow / totalIncome) * 100 : (netCashflow >= 0 ? 0 : -100);
  let healthStatus: 'positive' | 'negative' | 'neutral' = 'neutral';
  let healthHeadline = 'Balanced Cashflow';
  let healthDesc = 'Inflow and Outflow are closely aligned within safe operating limits.';

  if (netCashflow > 50) {
    healthStatus = 'positive';
    healthHeadline = 'Positive Cashflow Trajectory';
    healthDesc = `Inflow ($${totalIncome.toLocaleString()}) exceeds Outflow ($${totalSpending.toLocaleString()}) by $${netCashflow.toLocaleString()} (${cashflowRatio.toFixed(1)}% retained margin).`;
  } else if (netCashflow < -50) {
    healthStatus = 'negative';
    healthHeadline = 'Negative Cashflow (Deficit)';
    healthDesc = `Spending ($${totalSpending.toLocaleString()}) outpaced Inflow ($${totalIncome.toLocaleString()}) by $${Math.abs(netCashflow).toLocaleString()}. Funds were drawn from reserves.`;
  }

  const summaryMetrics: FinancialSummaryMetrics = {
    totalSpending,
    previousSpending,
    spendingDollarChange,
    spendingPercentChange,
    totalIncome,
    previousIncome,
    incomeDollarChange,
    incomePercentChange,
    netCashflow,
    previousNetCashflow,
    netCashflowChange,
    averageDailySpending,
    previousAverageDailySpending,
    largestCategory,
    transactionCount,
    previousTransactionCount,
    transactionCountChange,
    averageTransactionValue,
    previousAverageTransactionValue,
    averageTransactionValueChange,
    cashflowHealth: {
      status: healthStatus,
      headline: healthHeadline,
      description: healthDesc,
      ratioPercent: cashflowRatio,
    },
    daysInPeriod: totalDaysInPeriod,
    daysElapsed,
  };

  // --- Cashflow Trajectory Chart Points ---
  const trajectoryPoints: CashflowPoint[] = computeTrajectoryPoints(currentTxs, currentStart, currentEnd);

  // --- Automated Insights & Behavioral Detection ---
  const insights: FinancialInsightItem[] = generateFinancialInsights(
    summaryMetrics,
    categoryMatrix,
    currentTxs,
    previousTxs,
    periodComparison
  );

  const anomalies: AnomalyItem[] = detectSpendingAnomalies(currentTxs, previousTxs, categoryMatrix);

  // --- Run-Rate Forecasting ---
  const forecast: ForecastMetrics = computeRunRateForecast(summaryMetrics, categoryMatrix, totalDaysInPeriod, daysElapsed);

  // --- Week-over-Week & Month-over-Month Intelligence ---
  const intelligence: PeriodOverPeriodIntelligence = computePeriodIntelligence(
    summaryMetrics,
    categoryMatrix,
    currentTxs,
    periodComparison
  );

  return {
    summaryMetrics,
    categoryMatrix,
    trajectoryPoints,
    insights,
    anomalies,
    forecast,
    intelligence,
    currentTransactions: currentTxs,
    previousTransactions: previousTxs,
  };
}

// ---------------------------------------------------------------------------
// Trajectory Generation (Daily, Weekly, Monthly)
// ---------------------------------------------------------------------------
function computeTrajectoryPoints(
  transactions: Transaction[],
  startDate: Date,
  endDate: Date
): CashflowPoint[] {
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const pointsMap = new Map<string, { label: string; inflow: number; outflow: number; txIds: string[] }>();

  if (durationDays <= 35) {
    // Daily points
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = formatDateISO(d);
      const label = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      pointsMap.set(key, { label, inflow: 0, outflow: 0, txIds: [] });
    }

    transactions.forEach(t => {
      const key = t.date;
      if (pointsMap.has(key)) {
        const p = pointsMap.get(key)!;
        if (t.type === 'income') p.inflow += t.amount;
        else if (t.type === 'expense') p.outflow += t.amount;
        p.txIds.push(t.id);
      }
    });
  } else if (durationDays <= 180) {
    // Weekly points
    let weekIndex = 1;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 7)) {
      const key = `W${weekIndex}_${formatDateISO(d)}`;
      const label = `Wk ${weekIndex} (${d.toLocaleDateString('default', { month: 'short', day: 'numeric' })})`;
      pointsMap.set(key, { label, inflow: 0, outflow: 0, txIds: [] });
      weekIndex++;
    }

    transactions.forEach(t => {
      const tDate = parseDateSafe(t.date);
      const daysFromStart = Math.floor((tDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const targetWeek = Math.max(1, Math.floor(daysFromStart / 7) + 1);
      const keys = Array.from(pointsMap.keys());
      const matchingKey = keys[targetWeek - 1] || keys[keys.length - 1];
      if (matchingKey) {
        const p = pointsMap.get(matchingKey)!;
        if (t.type === 'income') p.inflow += t.amount;
        else if (t.type === 'expense') p.outflow += t.amount;
        p.txIds.push(t.id);
      }
    });
  } else {
    // Monthly points
    for (let d = new Date(startDate.getFullYear(), startDate.getMonth(), 1); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('default', { month: 'short', year: '2-digit' });
      pointsMap.set(key, { label, inflow: 0, outflow: 0, txIds: [] });
    }

    transactions.forEach(t => {
      const tDate = parseDateSafe(t.date);
      const key = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
      if (pointsMap.has(key)) {
        const p = pointsMap.get(key)!;
        if (t.type === 'income') p.inflow += t.amount;
        else if (t.type === 'expense') p.outflow += t.amount;
        p.txIds.push(t.id);
      }
    });
  }

  let cumulative = 0;
  const result: CashflowPoint[] = [];

  pointsMap.forEach((val, dateKey) => {
    const net = val.inflow - val.outflow;
    cumulative += net;
    result.push({
      dateKey,
      label: val.label,
      inflow: val.inflow,
      outflow: val.outflow,
      net,
      cumulativeNet: cumulative,
      transactionIds: val.txIds,
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// Automated Insights Generator
// ---------------------------------------------------------------------------
function generateFinancialInsights(
  metrics: FinancialSummaryMetrics,
  categories: CategoryMetric[],
  currentTxs: Transaction[],
  previousTxs: Transaction[],
  periodComp: PeriodComparison
): FinancialInsightItem[] {
  const insights: FinancialInsightItem[] = [];

  // 1. Overall Spend Direction Insight
  if (metrics.previousSpending > 0) {
    if (metrics.spendingDollarChange < 0) {
      insights.push({
        id: 'spend_decrease',
        title: 'Spending is Down vs Prior Period',
        description: `Total outlays are $${Math.abs(metrics.spendingDollarChange).toLocaleString()} (${Math.abs(metrics.spendingPercentChange).toFixed(1)}%) lower than ${periodComp.comparisonLabel}.`,
        type: 'positive',
        metricValue: `-$${Math.abs(metrics.spendingDollarChange).toLocaleString()}`,
        delta: `-${Math.abs(metrics.spendingPercentChange).toFixed(1)}%`,
        actionLabel: 'View Current Outflows',
        transactionIds: currentTxs.filter(t => t.type === 'expense').map(t => t.id),
      });
    } else if (metrics.spendingDollarChange > 0) {
      insights.push({
        id: 'spend_increase',
        title: 'Spending Increased vs Prior Period',
        description: `Total spending increased by $${metrics.spendingDollarChange.toLocaleString()} (+${metrics.spendingPercentChange.toFixed(1)}%) compared to ${periodComp.comparisonLabel}.`,
        type: 'warning',
        metricValue: `+$${metrics.spendingDollarChange.toLocaleString()}`,
        delta: `+${metrics.spendingPercentChange.toFixed(1)}%`,
        actionLabel: 'Inspect Outflows',
        transactionIds: currentTxs.filter(t => t.type === 'expense').map(t => t.id),
      });
    }
  }

  // 2. Net Cashflow Performance Insight
  if (metrics.netCashflow >= 0) {
    insights.push({
      id: 'cashflow_positive',
      title: 'Healthy Positive Operating Margin',
      description: `Inflows outpace expenditures with a retained cashflow of +$${metrics.netCashflow.toLocaleString()}.`,
      type: 'positive',
      metricValue: `+$${metrics.netCashflow.toLocaleString()}`,
      actionLabel: 'View Cashflow',
    });
  } else {
    insights.push({
      id: 'cashflow_negative',
      title: 'Operating Deficit in Current Window',
      description: `Current spending exceeds income by $${Math.abs(metrics.netCashflow).toLocaleString()}. Review high-spending categories to reduce burn rate.`,
      type: 'warning',
      metricValue: `-$${Math.abs(metrics.netCashflow).toLocaleString()}`,
      actionLabel: 'View Deficit Drivers',
      transactionIds: currentTxs.filter(t => t.type === 'expense').map(t => t.id),
    });
  }

  // 3. Category Driver Insight
  const topSpendersWithIncrease = categories
    .filter(c => c.dollarChange > 30 && c.amount > 0)
    .sort((a, b) => b.dollarChange - a.dollarChange);

  if (topSpendersWithIncrease.length > 0) {
    const top = topSpendersWithIncrease[0];
    const catTxs = currentTxs.filter(t => t.category === top.name && t.type === 'expense');
    insights.push({
      id: `driver_${top.name}`,
      title: `${top.name} Spending Surged +${top.percentChange.toFixed(0)}%`,
      description: `${top.name} expanded by $${top.dollarChange.toLocaleString()} and represents ${top.percentOfTotalSpending.toFixed(1)}% of total outlays this period.`,
      category: top.name,
      type: 'trend',
      metricValue: `$${top.amount.toLocaleString()}`,
      delta: `+$${top.dollarChange.toLocaleString()}`,
      actionLabel: `View ${top.name} (${catTxs.length})`,
      transactionIds: catTxs.map(t => t.id),
    });
  }

  // 4. Budget Risk Warnings
  const overBudgetCats = categories.filter(c => c.status === 'exceeded');
  if (overBudgetCats.length > 0) {
    const names = overBudgetCats.map(c => c.name).join(', ');
    const totalOverage = overBudgetCats.reduce((sum, c) => sum + (c.amount - c.budget), 0);
    const overTxs = currentTxs.filter(t => overBudgetCats.some(o => o.name === t.category));
    insights.push({
      id: 'budget_overage',
      title: `${overBudgetCats.length} ${overBudgetCats.length === 1 ? 'Category Over Limit' : 'Categories Over Limit'}`,
      description: `Budget limits exceeded in ${names} by a combined $${totalOverage.toLocaleString()}.`,
      type: 'alert',
      metricValue: `$${totalOverage.toLocaleString()} over`,
      actionLabel: 'Inspect Overages',
      transactionIds: overTxs.map(t => t.id),
    });
  } else {
    const approachingCats = categories.filter(c => c.status === 'approaching');
    if (approachingCats.length > 0) {
      const names = approachingCats.map(c => c.name).join(', ');
      insights.push({
        id: 'budget_approaching',
        title: `Approaching Limit: ${names}`,
        description: `${names} has utilized >80% of its allocation with remaining days in the period.`,
        type: 'warning',
        actionLabel: 'Review Limits',
      });
    }
  }

  // 5. Transaction Velocity / Average Size
  if (metrics.previousAverageTransactionValue > 0 && Math.abs(metrics.averageTransactionValueChange) > 5) {
    const isHigher = metrics.averageTransactionValueChange > 0;
    insights.push({
      id: 'ticket_size',
      title: `Average Transaction Size ${isHigher ? 'Increased' : 'Decreased'}`,
      description: `Average purchase amount moved from $${metrics.previousAverageTransactionValue.toFixed(2)} to $${metrics.averageTransactionValue.toFixed(2)} (${isHigher ? '+' : ''}${((metrics.averageTransactionValueChange / metrics.previousAverageTransactionValue) * 100).toFixed(1)}%).`,
      type: 'neutral',
      metricValue: `$${metrics.averageTransactionValue.toFixed(2)}/tx`,
    });
  }

  // 6. Category Concentration Insight
  const sorted = [...categories].filter(c => c.amount > 0);
  if (sorted.length >= 3 && metrics.totalSpending > 0) {
    const top3Share = ((sorted.slice(0, 3).reduce((sum, c) => sum + c.amount, 0)) / metrics.totalSpending) * 100;
    if (top3Share > 65) {
      insights.push({
        id: 'concentration',
        title: `High Spending Concentration (${top3Share.toFixed(0)}%)`,
        description: `Top 3 categories (${sorted.slice(0, 3).map(c => c.name).join(', ')}) account for ${top3Share.toFixed(1)}% of all spending.`,
        type: 'neutral',
        metricValue: `${top3Share.toFixed(0)}% in top 3`,
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Anomaly & Behavioral Detection
// ---------------------------------------------------------------------------
function detectSpendingAnomalies(
  currentTxs: Transaction[],
  previousTxs: Transaction[],
  categories: CategoryMetric[]
): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];
  const expenses = currentTxs.filter(t => t.type === 'expense');

  if (expenses.length === 0) return anomalies;

  const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
  const avgAmount = totalExpense / expenses.length;

  // 1. Unusually large transactions (> 3x average and > $100)
  const largeThreshold = Math.max(100, avgAmount * 2.8);
  const largeTxs = expenses.filter(t => t.amount >= largeThreshold);
  largeTxs.forEach(t => {
    anomalies.push({
      id: `anomaly_large_${t.id}`,
      type: 'large_transaction',
      severity: t.amount > avgAmount * 4 ? 'high' : 'medium',
      title: `Large Outlay: $${t.amount.toLocaleString()} in ${t.category}`,
      detail: `"${t.description}" is ${ (t.amount / Math.max(1, avgAmount)).toFixed(1) }x higher than your average purchase size ($${avgAmount.toFixed(0)}).`,
      amount: t.amount,
      date: t.date,
      category: t.category,
      transactionIds: [t.id],
    });
  });

  // 2. High-spending single days
  const dailySums: Record<string, { total: number; count: number; txs: Transaction[] }> = {};
  expenses.forEach(t => {
    if (!dailySums[t.date]) dailySums[t.date] = { total: 0, count: 0, txs: [] };
    dailySums[t.date].total += t.amount;
    dailySums[t.date].count += 1;
    dailySums[t.date].txs.push(t);
  });

  const dayEntries = Object.entries(dailySums);
  if (dayEntries.length > 2) {
    const avgDaily = totalExpense / dayEntries.length;
    dayEntries.forEach(([dateStr, dayData]) => {
      if (dayData.total > avgDaily * 2.5 && dayData.total > 150) {
        anomalies.push({
          id: `anomaly_day_${dateStr}`,
          type: 'high_spend_day',
          severity: 'medium',
          title: `High Spending Day: $${dayData.total.toLocaleString()} on ${dateStr}`,
          detail: `${dayData.count} transactions totaling $${dayData.total.toLocaleString()} (${(dayData.total / avgDaily).toFixed(1)}x daily average).`,
          amount: dayData.total,
          date: dateStr,
          transactionIds: dayData.txs.map(t => t.id),
        });
      }
    });
  }

  // 3. Potential duplicate transactions (same amount + category within 3 days)
  const sortedTxs = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sortedTxs.length; i++) {
    for (let j = i + 1; j < sortedTxs.length; j++) {
      const t1 = sortedTxs[i];
      const t2 = sortedTxs[j];
      const d1 = parseDateSafe(t1.date).getTime();
      const d2 = parseDateSafe(t2.date).getTime();
      const diffDays = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24);

      if (diffDays > 3) break; // sorted by date

      if (
        t1.amount === t2.amount &&
        t1.category === t2.category &&
        t1.amount > 10 &&
        (t1.description.toLowerCase().trim() === t2.description.toLowerCase().trim() || diffDays <= 1)
      ) {
        anomalies.push({
          id: `anomaly_dup_${t1.id}_${t2.id}`,
          type: 'possible_duplicate',
          severity: 'low',
          title: `Potential Duplicate: $${t1.amount.toLocaleString()} in ${t1.category}`,
          detail: `Two matching charges of $${t1.amount.toLocaleString()} detected for "${t1.description}" and "${t2.description}" within ${diffDays === 0 ? 'the same day' : `${diffDays.toFixed(0)} days`}.`,
          amount: t1.amount,
          date: t1.date,
          category: t1.category,
          transactionIds: [t1.id, t2.id],
        });
      }
    }
  }

  return anomalies.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Run-Rate Forecasting
// ---------------------------------------------------------------------------
function computeRunRateForecast(
  metrics: FinancialSummaryMetrics,
  categories: CategoryMetric[],
  totalDays: number,
  daysElapsed: number
): ForecastMetrics {
  const daysRemaining = Math.max(0, totalDays - daysElapsed);
  const spendingRunRateDaily = metrics.averageDailySpending;
  const incomeRunRateDaily = metrics.totalIncome / daysElapsed;

  const projectedPeriodSpending = metrics.totalSpending + (spendingRunRateDaily * daysRemaining);
  const projectedPeriodIncome = metrics.totalIncome + (incomeRunRateDaily * daysRemaining);
  const projectedPeriodNet = projectedPeriodIncome - projectedPeriodSpending;

  // Categories at risk of exceeding budget based on daily run rate
  const categoriesAtRiskOfOverBudget = categories
    .filter(c => c.budget > 0)
    .map(c => {
      const catDailyRate = c.amount / daysElapsed;
      const projected = c.amount + (catDailyRate * daysRemaining);
      const overage = projected - c.budget;
      return {
        name: c.name,
        current: c.amount,
        projected,
        budget: c.budget,
        overage: Math.max(0, overage),
      };
    })
    .filter(item => item.overage > 0)
    .sort((a, b) => b.overage - a.overage);

  return {
    projectedPeriodSpending,
    projectedPeriodIncome,
    projectedPeriodNet,
    spendingRunRateDaily,
    incomeRunRateDaily,
    daysRemaining,
    isProjected: daysRemaining > 0,
    categoriesAtRiskOfOverBudget,
  };
}

// ---------------------------------------------------------------------------
// Period-over-Period Intelligence (WoW / MoM / YoY)
// ---------------------------------------------------------------------------
function computePeriodIntelligence(
  metrics: FinancialSummaryMetrics,
  categories: CategoryMetric[],
  currentTxs: Transaction[],
  periodComp: PeriodComparison
): PeriodOverPeriodIntelligence {
  const isIncrease = metrics.spendingDollarChange > 0;
  const diff = Math.abs(metrics.spendingDollarChange);
  const pct = Math.abs(metrics.spendingPercentChange);

  // Top category contributors to the change
  const topDrivers = categories
    .map(c => ({
      category: c.name,
      dollarDiff: c.dollarChange,
      percentDiff: c.percentChange,
      current: c.amount,
      previous: c.previousAmount,
    }))
    .sort((a, b) => (isIncrease ? b.dollarDiff - a.dollarDiff : a.dollarDiff - b.dollarDiff))
    .filter(d => Math.abs(d.dollarDiff) > 1)
    .slice(0, 3);

  let headline = '';
  let summary = '';

  if (metrics.previousSpending === 0) {
    headline = `Total Outflows: $${metrics.totalSpending.toLocaleString()}`;
    summary = `Recorded ${metrics.transactionCount} transactions in this period. No prior comparison baseline available.`;
  } else if (isIncrease) {
    headline = `You spent $${diff.toLocaleString()} more (+${pct.toFixed(1)}%) than ${periodComp.comparisonLabel}.`;
    if (topDrivers.length > 0) {
      const driverDesc = topDrivers
        .map(d => `${d.category} (+${d.dollarDiff > 0 ? '$' + d.dollarDiff.toLocaleString() : '-$' + Math.abs(d.dollarDiff).toLocaleString()})`)
        .join(', ');
      summary = `Primary drivers: ${driverDesc}.`;
    } else {
      summary = `Outflows scaled upward across active budgetary categories.`;
    }
  } else {
    headline = `You spent $${diff.toLocaleString()} less (-${pct.toFixed(1)}%) than ${periodComp.comparisonLabel}.`;
    if (topDrivers.length > 0) {
      const driverDesc = topDrivers
        .map(d => `${d.category} (-$${Math.abs(d.dollarDiff).toLocaleString()})`)
        .join(', ');
      summary = `Primary reductions: ${driverDesc}.`;
    } else {
      summary = `Expenditures remained contained across all major budget groups.`;
    }
  }

  const isPartialPeriod = metrics.daysElapsed < metrics.daysInPeriod;

  return {
    type: 'month',
    headline,
    summary,
    spentCurrent: metrics.totalSpending,
    spentPrevious: metrics.previousSpending,
    difference: metrics.spendingDollarChange,
    percentChange: metrics.spendingPercentChange,
    isIncrease,
    topDrivers,
    isPartialPeriod,
    contributingTransactionIds: currentTxs.filter(t => t.type === 'expense').map(t => t.id),
  };
}
