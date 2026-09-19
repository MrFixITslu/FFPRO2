import React from 'react';
import { TrendingUp, Target } from 'lucide-react';
import { GoodsProduct, ServiceOffering, ServiceCapacityPlan, ServiceDirectCosts, StartupBusinessModelType } from '../../types';
import {
  calculateGoodsMonthlyResult,
  calculateServicesMonthlyResult,
  calculateHybridMonthlyResult,
  calculateGoodsBreakEven,
  calculateServicesBreakEven
} from '../../services/startupFinancialsService';

interface Props {
  businessModelType: StartupBusinessModelType;
  products: GoodsProduct[];
  offerings: ServiceOffering[];
  capacity: ServiceCapacityPlan | undefined;
  directCosts: ServiceDirectCosts | undefined;
  monthlyFixedCosts: number;
}

const Row: React.FC<{ label: string; value: string; bold?: boolean; positive?: boolean }> = ({ label, value, bold, positive }) => (
  <div className={`flex justify-between py-1.5 ${bold ? 'border-t border-stone-200 mt-1 pt-2' : ''}`}>
    <span className={`text-xs ${bold ? 'font-bold text-stone-800' : 'text-stone-500'}`}>{label}</span>
    <span className={`text-xs font-bold ${positive ? 'text-emerald-600' : 'text-stone-800'}`}>{value}</span>
  </div>
);

export const StartupFinancialSummary: React.FC<Props> = ({
  businessModelType,
  products,
  offerings,
  capacity,
  directCosts,
  monthlyFixedCosts
}) => {
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (businessModelType === 'goods') {
    const result = calculateGoodsMonthlyResult(products);
    const breakEven = calculateGoodsBreakEven(products, monthlyFixedCosts);
    return (
      <div className="bg-white border border-stone-150 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-emerald-600" /> Goods P&amp;L Summary
        </h3>
        <div>
          <Row label="Revenue" value={fmt(result.monthlyRevenue)} />
          <Row label="Cost of Goods Sold" value={`(${fmt(result.monthlyCOGS)})`} />
          <Row label="Gross Profit" value={fmt(result.monthlyGrossProfit)} bold positive />
          <Row label="Gross Margin" value={`${result.grossMarginPercent}%`} />
        </div>
        <BreakEvenCard label={breakEven.driverLabel} value={breakEven.driverValuePerMonth} achievable={breakEven.isAchievable} note={breakEven.note} />
      </div>
    );
  }

  if (businessModelType === 'services') {
    const result = calculateServicesMonthlyResult(offerings, directCosts, capacity);
    const primary = offerings[0];
    const breakEven = primary ? calculateServicesBreakEven(primary, directCosts, monthlyFixedCosts) : null;
    return (
      <div className="bg-white border border-stone-150 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-emerald-600" /> Services P&amp;L Summary
        </h3>
        <div>
          <Row label="Service Revenue" value={fmt(result.monthlyRevenue)} />
          <Row label="Direct Cost of Service Delivery" value={`(${fmt(result.monthlyDirectCost)})`} />
          <Row label="Gross Profit" value={fmt(result.monthlyGrossProfit)} bold positive />
          <Row label="Gross Margin" value={`${result.grossMarginPercent}%`} />
        </div>
        {breakEven && <BreakEvenCard label={breakEven.driverLabel} value={breakEven.driverValuePerMonth} achievable={breakEven.isAchievable} note={breakEven.note} />}
      </div>
    );
  }

  // hybrid
  const result = calculateHybridMonthlyResult(products, offerings, directCosts, capacity);
  return (
    <div className="bg-white border border-stone-150 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
        <TrendingUp className="w-4 h-4 text-emerald-600" /> Combined P&amp;L Summary
      </h3>
      <div>
        <Row label="Revenue from Goods" value={fmt(result.goods.monthlyRevenue)} />
        <Row label="Revenue from Services" value={fmt(result.services.monthlyRevenue)} />
        <Row label="Total Revenue" value={fmt(result.combinedRevenue)} bold />
      </div>
      <div>
        <Row label="Cost of Goods Sold" value={`(${fmt(result.goods.monthlyCOGS)})`} />
        <Row label="Direct Cost of Services" value={`(${fmt(result.services.monthlyDirectCost)})`} />
        <Row label="Combined Gross Profit" value={fmt(result.combinedGrossProfit)} bold positive />
        <Row label="Combined Gross Margin" value={`${result.combinedGrossMarginPercent}%`} />
      </div>
    </div>
  );
};

const BreakEvenCard: React.FC<{ label: string; value: number; achievable: boolean; note?: string }> = ({ label, value, achievable, note }) => (
  <div className={`rounded-xl p-3 border ${achievable ? 'bg-stone-50 border-stone-150' : 'bg-red-50 border-red-200'}`}>
    <div className="flex items-center gap-1.5 mb-1">
      <Target className="w-3.5 h-3.5 text-stone-400" />
      <span className="text-[9px] font-bold text-stone-400 uppercase">Break-even</span>
    </div>
    {achievable ? (
      <div className="text-sm font-bold text-stone-800">
        {value.toLocaleString()} <span className="text-xs font-medium text-stone-500">{label}</span>
      </div>
    ) : (
      <div className="text-xs text-red-700">{note || 'Break-even is not currently reachable with these assumptions.'}</div>
    )}
  </div>
);

export default StartupFinancialSummary;
