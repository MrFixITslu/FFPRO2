import React, { useState, useMemo } from 'react';
import {
  Building2,
  DollarSign,
  Calendar,
  Percent,
  Clock,
  ShieldCheck,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  StartupPlanDetails,
  LoanParameters,
  PaymentFrequency,
  CurrencyCode,
  LoanAmortizationSummary
} from '../../types';
import {
  calculateLoanAmortizationSchedule,
  roundCurrency
} from '../../services/startupFinancialsService';
import { formatCurrencyAmount } from '../../services/currencyService';

interface LoanAmortizationPanelProps {
  startupDetails: StartupPlanDetails;
  onChange: (updatedDetails: StartupPlanDetails) => void;
  currency: CurrencyCode;
  exchangeRate: number;
  year1Ebitda?: number;
}

export const LoanAmortizationPanel: React.FC<LoanAmortizationPanelProps> = ({
  startupDetails,
  onChange,
  currency,
  exchangeRate,
  year1Ebitda = 0
}) => {
  const loanParams: LoanParameters = startupDetails.loanParameters || {
    enabled: false,
    loanAmount: 120000,
    annualInterestRate: 7.0,
    termYears: 5,
    paymentFrequency: 'monthly',
    negotiationFee: 0,
    insuranceFee: 0,
    includeFeesInLoan: false,
    gracePeriodMonths: 0,
    startDate: new Date().toISOString().split('T')[0]
  };

  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'schedule' | 'settings'>('schedule');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllRows, setShowAllRows] = useState(false);

  // Live Loan Schedule calculation
  const loanSummary: LoanAmortizationSummary | null = useMemo(() => {
    return calculateLoanAmortizationSchedule(loanParams, currency, exchangeRate, year1Ebitda);
  }, [loanParams, currency, exchangeRate, year1Ebitda]);

  const updateLoanParams = (updates: Partial<LoanParameters>) => {
    const updatedParams: LoanParameters = {
      ...loanParams,
      ...updates
    };
    onChange({
      ...startupDetails,
      loanParameters: updatedParams
    });
  };

  const toggleLoanEnabled = () => {
    updateLoanParams({ enabled: !loanParams.enabled });
  };

  // Export Amortization Schedule to CSV
  const exportToCSV = () => {
    if (!loanSummary) return;
    const headers = ['Period No.', 'Payment Date', 'Beginning Balance', 'Interest Paid', 'Principal Repaid', 'Payment Amount', 'Ending Balance', 'Cumulative Interest'];
    const rows = loanSummary.schedule.map(r => [
      r.period,
      r.paymentDate,
      r.beginningBalance.toFixed(2),
      r.interestPaid.toFixed(2),
      r.principalPaid.toFixed(2),
      r.paymentAmount.toFixed(2),
      r.endingBalance.toFixed(2),
      r.cumulativeInterest.toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Loan_Amortization_Schedule_${loanParams.loanAmount}_${currency}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredSchedule = useMemo(() => {
    if (!loanSummary) return [];
    if (!searchTerm) return showAllRows ? loanSummary.schedule : loanSummary.schedule.slice(0, 18);
    return loanSummary.schedule.filter(r =>
      r.period.toString().includes(searchTerm) ||
      r.paymentDate.includes(searchTerm) ||
      r.paymentAmount.toString().includes(searchTerm)
    );
  }, [loanSummary, searchTerm, showAllRows]);

  return (
    <div id="loan-amortization-section" className="bg-white rounded-2xl border border-stone-200/90 shadow-sm overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="p-5 bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-indigo-500/20 backdrop-blur-md rounded-xl border border-indigo-400/30 text-indigo-200">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">Bank Debt Financing & Loan Amortization Schedule</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Bank & Underwriter Mode
              </span>
            </div>
            <p className="text-xs text-indigo-200/80 mt-0.5">
              Calculate commercial bank repayments, debt service coverage ratio (DSCR), and bank interest income.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={loanParams.enabled}
              onChange={toggleLoanEnabled}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            <span className="ml-2.5 text-xs font-semibold text-white">
              {loanParams.enabled ? 'Loan Active' : 'Enable Loan'}
            </span>
          </label>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-white/10 rounded-lg text-indigo-200 transition"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isExpanded && (
        <div className="p-6 space-y-6">
          {!loanParams.enabled ? (
            <div className="text-center py-10 bg-stone-50 rounded-xl border border-dashed border-stone-200">
              <Building2 className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-stone-700">No Bank Loan Currently Included</h4>
              <p className="text-xs text-stone-500 max-w-md mx-auto mt-1 mb-4">
                Toggle "Enable Loan" above to model bank debt, calculate periodic repayments, and auto-generate the bank amortization schedule for your reports.
              </p>
              <button
                type="button"
                onClick={toggleLoanEnabled}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
              >
                <Building2 className="w-4 h-4" />
                Add Bank Loan Facility
              </button>
            </div>
          ) : (
            <>
              {/* Quick Input Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Principal Loan Amount ({currency})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-stone-400">
                      {currency === 'XCD' ? 'EC$' : '$'}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={loanParams.loanAmount}
                      onChange={(e) => updateLoanParams({ loanAmount: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full pl-9 pr-3 py-1.5 text-xs font-bold text-stone-900 bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    {[50000, 120000, 250000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => updateLoanParams({ loanAmount: preset })}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium border transition ${
                          loanParams.loanAmount === preset
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-300 font-bold'
                            : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        {preset >= 1000000 ? `${preset / 1000000}M` : `${preset / 1000}k`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Annual Interest Rate (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={30}
                      step={0.25}
                      value={loanParams.annualInterestRate}
                      onChange={(e) => updateLoanParams({ annualInterestRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full px-3 py-1.5 text-xs font-bold text-stone-900 bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none pr-8"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-stone-400">%</span>
                  </div>
                  <p className="text-[10px] text-stone-500 mt-1">Standard commercial rates range from 6.0% to 9.5%</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Loan Term (Years)
                  </label>
                  <select
                    value={loanParams.termYears}
                    onChange={(e) => updateLoanParams({ termYears: parseInt(e.target.value) || 5 })}
                    className="w-full px-3 py-1.5 text-xs font-bold text-stone-900 bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5, 7, 10, 15, 20].map((yr) => (
                      <option key={yr} value={yr}>
                        {yr} {yr === 1 ? 'Year' : 'Years'} ({yr * (loanParams.paymentFrequency === 'monthly' ? 12 : loanParams.paymentFrequency === 'fortnightly' ? 26 : 52)} payments)
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-stone-500 mt-1">Typical business development loans: 3–7 years</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Payment Frequency
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-stone-300">
                    {(['monthly', 'fortnightly', 'weekly'] as PaymentFrequency[]).map((freq) => (
                      <button
                        key={freq}
                        type="button"
                        onClick={() => updateLoanParams({ paymentFrequency: freq })}
                        className={`text-[11px] py-1 capitalize font-bold rounded transition ${
                          loanParams.paymentFrequency === freq
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        {freq === 'fortnightly' ? 'F/Night' : freq}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-stone-500 mt-1">
                    {loanParams.paymentFrequency === 'monthly' ? '12 payments / year' : loanParams.paymentFrequency === 'fortnightly' ? '26 payments / year' : '52 payments / year'}
                  </p>
                </div>
              </div>

              {/* Bank Underwriter Metric Display Cards */}
              {loanSummary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Periodic Payment */}
                  <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-xl border border-amber-200/80 shadow-xs">
                    <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Calculated Payment</span>
                      <span className="capitalize text-amber-600">({loanParams.paymentFrequency})</span>
                    </div>
                    <div className="text-xl font-extrabold text-amber-950 mt-1">
                      {formatCurrencyAmount(loanSummary.periodicPayment, currency)}
                    </div>
                    <div className="text-[11px] font-semibold text-amber-700 mt-1">
                      {formatCurrencyAmount(loanSummary.monthlyDebtService, currency)} / month equivalent
                    </div>
                  </div>

                  {/* Total Interest Cost (Bank Profit) */}
                  <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-xl border border-indigo-200/80 shadow-xs">
                    <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
                      Total Interest Expense
                    </div>
                    <div className="text-xl font-extrabold text-indigo-950 mt-1">
                      {formatCurrencyAmount(loanSummary.totalInterestPaid, currency)}
                    </div>
                    <div className="text-[11px] font-semibold text-indigo-700 mt-1">
                      Bank Profit over {loanParams.termYears} years
                    </div>
                  </div>

                  {/* Total Repayment */}
                  <div className="p-4 bg-gradient-to-br from-slate-50 to-stone-50 rounded-xl border border-stone-200/80 shadow-xs">
                    <div className="text-[11px] font-bold text-stone-700 uppercase tracking-wider">
                      Total Repayment Amount
                    </div>
                    <div className="text-xl font-extrabold text-stone-900 mt-1">
                      {formatCurrencyAmount(loanSummary.totalRepaymentAmount, currency)}
                    </div>
                    <div className="text-[11px] font-semibold text-stone-600 mt-1">
                      Principal ({formatCurrencyAmount(loanSummary.effectiveLoanAmount, currency)}) + Interest
                    </div>
                  </div>

                  {/* DSCR (Debt Service Coverage Ratio) */}
                  <div className={`p-4 rounded-xl border shadow-xs transition ${
                    loanSummary.dscrStatus === 'strong'
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                      : loanSummary.dscrStatus === 'adequate'
                      ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                      : loanSummary.dscrStatus === 'tight'
                      ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                      : 'bg-rose-50/80 border-rose-200 text-rose-950'
                  }`}>
                    <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Debt Service Ratio (DSCR)</span>
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-xl font-extrabold mt-1">
                      {loanSummary.dscrYear1 > 50 ? 'N/A' : `${loanSummary.dscrYear1.toFixed(2)}x`}
                    </div>
                    <div className="text-[11px] font-semibold mt-1">
                      {loanSummary.dscrStatus === 'strong' && '🟢 Strong (EBITDA covers debt > 1.5x)'}
                      {loanSummary.dscrStatus === 'adequate' && '🔵 Adequate (Covers debt 1.25x - 1.5x)'}
                      {loanSummary.dscrStatus === 'tight' && '🟡 Tight (Covers debt 1.0x - 1.25x)'}
                      {loanSummary.dscrStatus === 'insufficient' && '🔴 Insufficient Operating Cashflow'}
                    </div>
                  </div>
                </div>
              )}

              {/* Fees & Grace Period Fine-Tuning */}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-600" />
                    Bank Fees, Grace Period & Fee Capitalization
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      Upfront Negotiation Fee ({currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={loanParams.negotiationFee || 0}
                      onChange={(e) => updateLoanParams({ negotiationFee: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      Loan Insurance / Legal Fee ({currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={loanParams.insuranceFee || 0}
                      onChange={(e) => updateLoanParams({ insuranceFee: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      Interest-Only Grace Period
                    </label>
                    <select
                      value={loanParams.gracePeriodMonths || 0}
                      onChange={(e) => updateLoanParams({ gracePeriodMonths: parseInt(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value={0}>None (Immediate Repayment)</option>
                      <option value={3}>3 Months Moratorium</option>
                      <option value={6}>6 Months Moratorium</option>
                      <option value={12}>12 Months Moratorium</option>
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-stone-700">
                      <input
                        type="checkbox"
                        checked={loanParams.includeFeesInLoan || false}
                        onChange={(e) => updateLoanParams({ includeFeesInLoan: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      Add fees to loan principal
                    </label>
                  </div>
                </div>
              </div>

              {/* Amortization Schedule Table */}
              {loanSummary && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        Complete Loan Repayment Ledger ({loanSummary.schedule.length} Periods)
                      </h4>
                      <p className="text-[11px] text-stone-500">
                        Detailed breakdown showing the exact interest earned by the bank and principal amortized each period.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search period or date..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-2.5 py-1 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none w-44"
                      />

                      <button
                        type="button"
                        onClick={exportToCSV}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto border border-stone-200 rounded-xl max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-800 text-white sticky top-0 z-10 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">No.</th>
                          <th className="py-2.5 px-3">Payment Date</th>
                          <th className="py-2.5 px-3 text-right">Beginning Balance</th>
                          <th className="py-2.5 px-3 text-right text-amber-300">Interest Paid</th>
                          <th className="py-2.5 px-3 text-right text-emerald-300">Principal Repaid</th>
                          <th className="py-2.5 px-3 text-right text-indigo-300">Payment Amount</th>
                          <th className="py-2.5 px-3 text-right">Ending Balance</th>
                          <th className="py-2.5 px-3 text-right text-stone-300">Cumulative Interest</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200/80 bg-white font-medium text-stone-800">
                        {filteredSchedule.map((row) => (
                          <tr key={row.period} className="hover:bg-slate-50/80 transition">
                            <td className="py-2 px-3 font-bold text-stone-500">{row.period}</td>
                            <td className="py-2 px-3 text-stone-600 font-mono text-[11px]">{row.paymentDate}</td>
                            <td className="py-2 px-3 text-right font-mono">{formatCurrencyAmount(row.beginningBalance, currency)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">{formatCurrencyAmount(row.interestPaid, currency)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">{formatCurrencyAmount(row.principalPaid, currency)}</td>
                            <td className="py-2 px-3 text-right font-mono font-extrabold text-indigo-900">{formatCurrencyAmount(row.paymentAmount, currency)}</td>
                            <td className="py-2 px-3 text-right font-mono text-stone-600">{formatCurrencyAmount(row.endingBalance, currency)}</td>
                            <td className="py-2 px-3 text-right font-mono text-stone-400">{formatCurrencyAmount(row.cumulativeInterest, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {loanSummary.schedule.length > 18 && !searchTerm && (
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAllRows(!showAllRows)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                      >
                        {showAllRows ? 'Show Fewer Rows' : `Show All ${loanSummary.schedule.length} Periods`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
