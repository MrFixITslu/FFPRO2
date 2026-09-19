import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  PieChart,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Wrench,
  Package,
  Repeat
} from 'lucide-react';
import { StartupPlanDetails } from '../../types';
import { generateStartupFinancialForecast } from '../../services/startupFinancialsService';

interface StartupFinancialSummaryProps {
  startupDetails?: StartupPlanDetails;
}

export const StartupFinancialSummary: React.FC<StartupFinancialSummaryProps> = ({
  startupDetails
}) => {
  const [forecastView, setForecastView] = useState<'pnl' | 'cashflow' | 'both'>('pnl');

  const forecast = generateStartupFinancialForecast(startupDetails);
  const { monthlyYear1, yearlyProjections, breakEven, totalsYear1 } = forecast;

  const isProfitableYear1 = totalsYear1.netProfit > 0;
  const isCashPositiveYear1 = totalsYear1.endingCash > 0;

  return (
    <div className="space-y-6">
      {/* Top Level Metric Badges */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Year 1 Revenue
          </div>
          <div className="text-lg font-extrabold text-stone-900 mt-1">
            ${totalsYear1.revenue.toLocaleString()}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            12-Month Projected Gross Sales
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Gross Margin
          </div>
          <div className="text-lg font-extrabold text-emerald-800 mt-1">
            ${totalsYear1.grossProfit.toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
            {totalsYear1.revenue > 0 ? ((totalsYear1.grossProfit / totalsYear1.revenue) * 100).toFixed(1) : 0}% margin
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Year 1 Net Profit
          </div>
          <div className={`text-lg font-extrabold mt-1 ${isProfitableYear1 ? 'text-emerald-800' : 'text-rose-600'}`}>
            ${totalsYear1.netProfit.toLocaleString()}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            After OpEx & Depreciation
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Equipment Capital
          </div>
          <div className="text-lg font-extrabold text-blue-800 mt-1">
            ${totalsYear1.equipmentCapitalOutlay.toLocaleString()}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            Deprec: ${totalsYear1.depreciation.toLocaleString()}/yr
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Year 1 Ending Cash
          </div>
          <div className={`text-lg font-extrabold mt-1 ${isCashPositiveYear1 ? 'text-emerald-800' : 'text-amber-600'}`}>
            ${totalsYear1.endingCash.toLocaleString()}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            Month 12 Closing Liquidity
          </div>
        </div>
      </div>

      {/* Model-Appropriate Break-Even Analysis Card (Decision 4) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70">
              Decision 4: Operational Break-Even Analysis
            </span>
            <h3 className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-700" />
              <span>Commercial Break-Even & Safety Thresholds</span>
            </h3>
          </div>
          <div className="text-xs font-semibold text-stone-500">
            Safety Margin: <strong className={breakEven.safetyMarginPercent > 0 ? 'text-emerald-800' : 'text-amber-600'}>
              {breakEven.safetyMarginPercent.toFixed(1)}%
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
            <div className="text-[11px] font-semibold text-stone-500">Monthly Fixed Costs</div>
            <div className="text-base font-extrabold text-stone-900">
              ${breakEven.monthlyFixedCosts.toLocaleString()}/mo
            </div>
            <div className="text-[10.5px] text-stone-400">
              Recurring OpEx + Monthly Equipment Depreciation
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
            <div className="text-[11px] font-semibold text-stone-500">Break-Even Sales Volume</div>
            <div className="text-base font-extrabold text-emerald-800">
              {breakEven.breakEvenUnitsMonthly.toLocaleString()} <span className="text-xs font-semibold text-stone-600">{breakEven.breakEvenMetricLabel}/mo</span>
            </div>
            <div className="text-[10.5px] text-stone-400">
              Minimum commercial volume to cover all fixed costs
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
            <div className="text-[11px] font-semibold text-stone-500">Break-Even Revenue</div>
            <div className="text-base font-extrabold text-stone-900">
              ${breakEven.breakEvenRevenueMonthly.toLocaleString()}/mo
            </div>
            <div className="text-[10.5px] text-stone-400">
              Monthly turnover required to achieve $0.00 Net Profit
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
            <div className="text-[11px] font-semibold text-stone-500">Unit Contribution Margin</div>
            <div className="text-base font-extrabold text-stone-900">
              ${breakEven.unitContributionMargin.toFixed(2)} ({breakEven.averageContributionMarginPercent.toFixed(0)}%)
            </div>
            <div className="text-[10.5px] text-stone-400">
              Price (${breakEven.unitPrice.toFixed(2)}) minus variable cost (${breakEven.unitVariableCost.toFixed(2)})
            </div>
          </div>
        </div>
      </div>

      {/* 12-Month Year 1 Interactive Forecast Table (Decision 3) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-150 pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200/70">
              Decision 3: 12-Month Forecast Engine
            </span>
            <h3 className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-2">
              <Calendar size={16} className="text-blue-700" />
              <span>Year 1 Monthly Financial Projections</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Detailed monthly progression isolating equipment cash outlays from non-cash straight-line depreciation.
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200/60 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setForecastView('pnl')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                forecastView === 'pnl' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Profit & Loss (P&L)
            </button>
            <button
              type="button"
              onClick={() => setForecastView('cashflow')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                forecastView === 'cashflow' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Cash Flow & Liquidity
            </button>
            <button
              type="button"
              onClick={() => setForecastView('both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                forecastView === 'both' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Combined View
            </button>
          </div>
        </div>

        {/* Scrollable Month Table */}
        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100/80 text-stone-700 font-bold border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 bg-stone-100/95 z-10 min-w-[170px]">
                  Financial Line Item
                </th>
                {monthlyYear1.map((m) => (
                  <th key={m.month} className="py-2.5 px-2.5 text-right min-w-[70px]">
                    {m.monthName}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right bg-emerald-50/90 text-emerald-950 font-extrabold min-w-[90px]">
                  Year 1 Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150">
              {/* P&L SECTION */}
              {(forecastView === 'pnl' || forecastView === 'both') && (
                <>
                  <tr className="bg-stone-50/60 font-bold text-stone-900">
                    <td className="py-2 px-3 sticky left-0 bg-stone-50 z-10" colSpan={14}>
                      Profit & Loss Statement (Accrual Accounting)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 sticky left-0 bg-white z-10 font-semibold text-stone-800">
                      Total Revenue
                    </td>
                    {monthlyYear1.map((m) => (
                      <td key={m.month} className="py-2 px-2.5 text-right font-medium text-stone-900">
                        ${m.revenue.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-extrabold text-emerald-900 bg-emerald-50/40">
                      ${totalsYear1.revenue.toLocaleString()}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2 px-3 sticky left-0 bg-white z-10 text-stone-600 pl-6">
                      Cost of Goods / Direct Costs
                    </td>
                    {monthlyYear1.map((m) => (
                      <td key={m.month} className="py-2 px-2.5 text-right text-stone-600">
                        ${m.cogs.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-bold text-stone-700 bg-emerald-50/40">
                      ${totalsYear1.cogs.toLocaleString()}
                    </td>
                  </tr>

                  <tr className="bg-emerald-50/30 font-semibold">
                    <td className="py-2 px-3 sticky left-0 bg-emerald-50/50 z-10 text-emerald-950">
                      Gross Profit
                    </td>
                    {monthlyYear1.map((m) => (
                      <td key={m.month} className="py-2 px-2.5 text-right text-emerald-900">
                        ${m.grossProfit.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-extrabold text-emerald-950 bg-emerald-50/60">
                      ${totalsYear1.grossProfit.toLocaleString()}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2 px-3 sticky left-0 bg-white z-10 text-stone-600 pl-6">
                      Operating Expenses (Recurring + Setup)
                    </td>
                    {monthlyYear1.map((m) => (
                      <td key={m.month} className="py-2 px-2.5 text-right text-stone-600">
                        ${m.operatingExpenses.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-bold text-stone-700 bg-emerald-50/40">
                      ${totalsYear1.operatingExpenses.toLocaleString()}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2 px-3 sticky left-0 bg-white z-10 text-blue-800 pl-6">
                      Depreciation (Straight-Line)
                    </td>
                    {monthlyYear1.map((m) => (
                      <td key={m.month} className="py-2 px-2.5 text-right text-blue-700">
                        ${m.depreciation.toFixed(0)}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-bold text-blue-900 bg-emerald-50/40">
                      ${totalsYear1.depreciation.toLocaleString()}
                    </td>
                  </tr>

                  <tr className="bg-stone-100/90 font-bold border-t-2 border-stone-300">
                    <td className="py-2.5 px-3 sticky left-0 bg-stone-100 z-10 text-stone-900">
                      Net Profit (P&L)
                    </td>
                    {monthlyYear1.map((m) => (
                      <td
                        key={m.month}
                        className={`py-2.5 px-2.5 text-right font-extrabold ${
                          m.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-600'
                        }`}
                      >
                        ${m.netProfit.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-extrabold text-emerald-950 bg-emerald-100">
                      ${totalsYear1.netProfit.toLocaleString()}
                    </td>
                  </tr>
                </>
              )}

              {/* CASH FLOW SECTION */}
              {(forecastView === 'cashflow' || forecastView === 'both') && (
                <>
                  <tr className="bg-stone-50/60 font-bold text-stone-900">
                    <td className="py-2 px-3 sticky left-0 bg-stone-50 z-10" colSpan={14}>
                      Cash Flow & Liquidity Progression (Cash Accounting)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 sticky left-0 bg-white z-10 text-stone-600 pl-6">
                      Equipment Purchases (Cash Hit)
                    </td>
                    {monthlyYear1.map((m) => (
                      <td key={m.month} className="py-2 px-2.5 text-right text-blue-700 font-medium">
                        ${m.cashPurchasesEquipment.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-bold text-blue-900 bg-emerald-50/40">
                      ${totalsYear1.equipmentCapitalOutlay.toLocaleString()}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2 px-3 sticky left-0 bg-white z-10 text-stone-600 pl-6">
                      Stock Purchases Outlay
                    </td>
                    {monthlyYear1.map((m) => (
                      <td key={m.month} className="py-2 px-2.5 text-right text-stone-600">
                        ${m.cashPurchasesStock.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-bold text-stone-700 bg-emerald-50/40">
                      ${monthlyYear1.reduce((sum, m) => sum + m.cashPurchasesStock, 0).toLocaleString()}
                    </td>
                  </tr>

                  <tr className="bg-stone-50/40 font-semibold">
                    <td className="py-2 px-3 sticky left-0 bg-stone-50/60 z-10 text-stone-800">
                      Net Monthly Cash Flow
                    </td>
                    {monthlyYear1.map((m) => (
                      <td
                        key={m.month}
                        className={`py-2 px-2.5 text-right font-bold ${
                          m.cashFlow >= 0 ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        ${m.cashFlow.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-extrabold text-stone-900 bg-emerald-50/60">
                      ${totalsYear1.netCashFlow.toLocaleString()}
                    </td>
                  </tr>

                  <tr className="bg-emerald-50/60 font-bold border-t border-emerald-200">
                    <td className="py-2.5 px-3 sticky left-0 bg-emerald-50 z-10 text-emerald-950">
                      Closing Cash Balance
                    </td>
                    {monthlyYear1.map((m) => (
                      <td
                        key={m.month}
                        className={`py-2.5 px-2.5 text-right font-extrabold ${
                          m.endingCashBalance >= 0 ? 'text-emerald-900' : 'text-rose-600'
                        }`}
                      >
                        ${m.endingCashBalance.toLocaleString()}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-black text-emerald-950 bg-emerald-100">
                      ${monthlyYear1[11].endingCashBalance.toLocaleString()}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5-Year Projections Annual Summary */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="border-b border-stone-150 pb-3">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-700" />
            <span>5-Year Annual Expansion Projections</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Macro outlook incorporating Year 3 and Year 5 compound expansion rates.
          </p>
        </div>

        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-3">Forecast Metric</th>
                <th className="py-2.5 px-3 text-right">Year 1</th>
                <th className="py-2.5 px-3 text-right">Year 2</th>
                <th className="py-2.5 px-3 text-right">Year 3</th>
                <th className="py-2.5 px-3 text-right">Year 4</th>
                <th className="py-2.5 px-3 text-right">Year 5</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150">
              <tr>
                <td className="py-2 px-3 font-semibold text-stone-800">Gross Revenue</td>
                {yearlyProjections.map((y) => (
                  <td key={y.year} className="py-2 px-3 text-right font-medium text-stone-900">
                    ${y.revenue.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-3 text-stone-600">Cost of Goods / Direct Costs</td>
                {yearlyProjections.map((y) => (
                  <td key={y.year} className="py-2 px-3 text-right text-stone-600">
                    ${y.cogs.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr className="bg-emerald-50/30 font-semibold">
                <td className="py-2 px-3 text-emerald-950">Gross Profit</td>
                {yearlyProjections.map((y) => (
                  <td key={y.year} className="py-2 px-3 text-right text-emerald-900">
                    ${y.grossProfit.toLocaleString()} ({y.grossMarginPercent.toFixed(0)}%)
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-3 text-stone-600">Operating Expenses</td>
                {yearlyProjections.map((y) => (
                  <td key={y.year} className="py-2 px-3 text-right text-stone-600">
                    ${y.operatingExpenses.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-3 text-blue-800">Depreciation</td>
                {yearlyProjections.map((y) => (
                  <td key={y.year} className="py-2 px-3 text-right text-blue-700">
                    ${y.depreciation.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr className="bg-stone-100 font-bold">
                <td className="py-2 px-3 text-stone-900">Net Profit</td>
                {yearlyProjections.map((y) => (
                  <td
                    key={y.year}
                    className={`py-2 px-3 text-right font-extrabold ${
                      y.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-600'
                    }`}
                  >
                    ${y.netProfit.toLocaleString()} ({y.netMarginPercent.toFixed(0)}%)
                  </td>
                ))}
              </tr>
              <tr className="bg-emerald-50/70 font-black">
                <td className="py-2 px-3 text-emerald-950">Year-End Cash Position</td>
                {yearlyProjections.map((y) => (
                  <td key={y.year} className="py-2 px-3 text-right text-emerald-950">
                    ${y.endingCashBalance.toLocaleString()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
