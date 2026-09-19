import React, { useState } from 'react';
import { Plus, Trash2, Briefcase, Users, AlertTriangle } from 'lucide-react';
import { ServiceOffering, ServiceRevenueModel, ServiceCapacityPlan, ServiceDirectCosts } from '../../types';
import {
  calculateServiceOfferingRevenue,
  calculateServicesMonthlyResult
} from '../../services/startupFinancialsService';

interface Props {
  allowedRevenueModels: ServiceRevenueModel[];
  offerings: ServiceOffering[];
  onOfferingsChange: (offerings: ServiceOffering[]) => void;
  capacity: ServiceCapacityPlan | undefined;
  onCapacityChange: (capacity: ServiceCapacityPlan) => void;
  directCosts: ServiceDirectCosts | undefined;
  onDirectCostsChange: (costs: ServiceDirectCosts) => void;
}

const REVENUE_MODEL_LABELS: Record<ServiceRevenueModel, string> = {
  hourly: 'Hourly / Daily',
  fixed_project: 'Fixed-price Project',
  package: 'Package',
  retainer: 'Retainer',
  subscription: 'Subscription',
  per_transaction: 'Per Transaction',
  other: 'Other'
};

const inputCls =
  'w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 text-stone-800 rounded outline-none font-semibold text-xs focus:ring-1 focus:ring-emerald-500 focus:bg-white';
const labelCls = 'text-[9px] font-bold text-stone-400 uppercase block mb-1';

const NumberField: React.FC<{ label: string; value: number | undefined; onChange: (v: number) => void; prefix?: string; suffix?: string }> = ({
  label,
  value,
  onChange,
  prefix,
  suffix
}) => (
  <div>
    <label className={labelCls}>{label}</label>
    <div className="relative">
      {prefix && <span className="absolute left-2.5 top-1.5 text-stone-400 text-xs">{prefix}</span>}
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className={`${inputCls} ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''}`}
      />
      {suffix && <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">{suffix}</span>}
    </div>
  </div>
);

const newOffering = (models: ServiceRevenueModel[]): ServiceOffering => ({
  id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  revenueModels: models.length === 1 ? [models[0]] : [],
  isRecurringRevenue: models.some((m) => m === 'retainer' || m === 'subscription')
});

export const ServicesWorkflowPanel: React.FC<Props> = ({
  allowedRevenueModels,
  offerings,
  onOfferingsChange,
  capacity,
  onCapacityChange,
  directCosts,
  onDirectCostsChange
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(offerings[0]?.id || null);

  const update = (id: string, patch: Partial<ServiceOffering>) => {
    onOfferingsChange(offerings.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const toggleModel = (offering: ServiceOffering, model: ServiceRevenueModel) => {
    const has = offering.revenueModels.includes(model);
    update(offering.id, {
      revenueModels: has ? offering.revenueModels.filter((m) => m !== model) : [...offering.revenueModels, model]
    });
  };

  const remove = (id: string) => {
    onOfferingsChange(offerings.filter((o) => o.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const addOffering = () => {
    const o = newOffering(allowedRevenueModels);
    onOfferingsChange([...offerings, o]);
    setExpandedId(o.id);
  };

  const summary = calculateServicesMonthlyResult(offerings, directCosts, capacity);
  const usesHourly = allowedRevenueModels.includes('hourly');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-emerald-600" /> Services Offered
        </h3>
        <button
          type="button"
          onClick={addOffering}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Service
        </button>
      </div>

      {offerings.length === 0 && (
        <div className="text-center py-8 text-stone-400 text-xs border border-dashed border-stone-200 rounded-xl">
          No services yet — add one above to start building your revenue model.
        </div>
      )}

      {offerings.map((offering) => {
        const revLine = calculateServiceOfferingRevenue(offering);
        const isOpen = expandedId === offering.id;
        return (
          <div key={offering.id} className="border border-stone-150 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : offering.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors"
            >
              <div className="text-left">
                <div className="text-xs font-bold text-stone-800">{offering.name || 'Untitled service'}</div>
                <div className="text-[10px] text-stone-400">
                  {offering.revenueModels.map((m) => REVENUE_MODEL_LABELS[m]).join(', ') || 'No revenue model selected'} · Est. $
                  {revLine.monthlyRevenue.toFixed(2)}/mo
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(offering.id);
                }}
                className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </button>

            {isOpen && (
              <div className="p-4 space-y-4">
                <div>
                  <label className={labelCls}>Service Name</label>
                  <input
                    type="text"
                    value={offering.name}
                    onChange={(e) => update(offering.id, { name: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. Managed IT Support"
                  />
                </div>

                <div>
                  <label className={labelCls}>Revenue Model(s)</label>
                  <div className="flex flex-wrap gap-2">
                    {allowedRevenueModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleModel(offering, m)}
                        className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold transition-colors ${
                          offering.revenueModels.includes(m)
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-stone-200 text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        {REVENUE_MODEL_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {offering.revenueModels.includes('hourly') && (
                    <>
                      <NumberField label="Hourly / Daily Rate" prefix="$" value={offering.hourlyRate} onChange={(v) => update(offering.id, { hourlyRate: v })} />
                      <NumberField label="Expected Billable Hours / Month" value={offering.expectedBillableHoursPerMonth} onChange={(v) => update(offering.id, { expectedBillableHoursPerMonth: v })} />
                    </>
                  )}
                  {offering.revenueModels.includes('fixed_project') && (
                    <>
                      <NumberField label="Average Project Fee" prefix="$" value={offering.averageProjectFee} onChange={(v) => update(offering.id, { averageProjectFee: v })} />
                      <NumberField label="Expected Projects / Month" value={offering.expectedProjectsPerMonth} onChange={(v) => update(offering.id, { expectedProjectsPerMonth: v })} />
                    </>
                  )}
                  {offering.revenueModels.includes('package') && (
                    <>
                      <NumberField label="Package Price" prefix="$" value={offering.packagePrice} onChange={(v) => update(offering.id, { packagePrice: v })} />
                      <NumberField label="Expected Packages / Month" value={offering.expectedPackagesPerMonth} onChange={(v) => update(offering.id, { expectedPackagesPerMonth: v })} />
                    </>
                  )}
                  {offering.revenueModels.includes('retainer') && (
                    <>
                      <NumberField label="Monthly Retainer Fee" prefix="$" value={offering.monthlyRetainerFee} onChange={(v) => update(offering.id, { monthlyRetainerFee: v })} />
                      <NumberField label="Expected Retainer Clients" value={offering.expectedRetainerClients} onChange={(v) => update(offering.id, { expectedRetainerClients: v })} />
                    </>
                  )}
                  {offering.revenueModels.includes('subscription') && (
                    <>
                      <NumberField label="Subscription Price" prefix="$" value={offering.subscriptionPrice} onChange={(v) => update(offering.id, { subscriptionPrice: v })} />
                      <NumberField label="Expected Subscribers" value={offering.expectedSubscribers} onChange={(v) => update(offering.id, { expectedSubscribers: v })} />
                    </>
                  )}
                  {offering.revenueModels.includes('per_transaction') && (
                    <>
                      <NumberField label="Avg Revenue / Transaction" prefix="$" value={offering.averageRevenuePerTransaction} onChange={(v) => update(offering.id, { averageRevenuePerTransaction: v })} />
                      <NumberField label="Expected Transactions / Month" value={offering.expectedTransactionsPerMonth} onChange={(v) => update(offering.id, { expectedTransactionsPerMonth: v })} />
                    </>
                  )}
                </div>

                <div className="bg-stone-50 rounded-xl p-3 text-center">
                  <div className="text-[9px] text-stone-400 uppercase font-bold">Estimated Monthly Revenue</div>
                  <div className="text-sm font-bold text-stone-800">${revLine.monthlyRevenue.toFixed(2)}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {usesHourly && (
        <div className="border-t border-stone-100 pt-4 space-y-3">
          <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-600" /> Capacity Planning
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Staff / Contractors" value={capacity?.staffCount} onChange={(v) => onCapacityChange({ ...capacity, staffCount: v })} />
            <NumberField label="Available Hours / Staff / Week" value={capacity?.availableHoursPerStaffPerWeek} onChange={(v) => onCapacityChange({ ...capacity, availableHoursPerStaffPerWeek: v })} />
            <NumberField label="Utilisation" suffix="%" value={capacity?.utilisationPercent} onChange={(v) => onCapacityChange({ ...capacity, utilisationPercent: v })} />
            <NumberField label="Cost / Staff (salary or contractor)" prefix="$" value={capacity?.salaryOrContractorCostPerStaff} onChange={(v) => onCapacityChange({ ...capacity, salaryOrContractorCostPerStaff: v })} />
          </div>
          <div className="bg-stone-50 rounded-xl p-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-[9px] text-stone-400 uppercase font-bold">Billable Capacity</div>
              <div className="text-sm font-bold text-stone-800">{summary.capacity.billableCapacityHoursPerMonth.toFixed(0)} hrs/mo</div>
            </div>
            <div>
              <div className="text-[9px] text-stone-400 uppercase font-bold">Hours Demanded by Forecast</div>
              <div className="text-sm font-bold text-stone-800">{summary.capacity.billableHoursDemanded.toFixed(0)} hrs/mo</div>
            </div>
          </div>
          {summary.capacity.isOverCapacity && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Your forecast demands more billable hours than your current staff can deliver. Increase staff/hours or
              reduce the forecast to keep this achievable.
            </div>
          )}
        </div>
      )}

      <div className="border-t border-stone-100 pt-4 space-y-3">
        <h4 className="text-xs font-bold text-stone-700">Direct Service Delivery Costs</h4>
        <p className="text-[10px] text-stone-400">
          Costs directly tied to delivering the service — kept separate from general operating expenses.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Direct Employee Labour" prefix="$" value={directCosts?.directEmployeeLabour} onChange={(v) => onDirectCostsChange({ ...directCosts, directEmployeeLabour: v })} />
          <NumberField label="Contractors / Subcontractors" prefix="$" value={directCosts?.contractorSubcontractorCosts} onChange={(v) => onDirectCostsChange({ ...directCosts, contractorSubcontractorCosts: v })} />
          <NumberField label="Travel" prefix="$" value={directCosts?.travel} onChange={(v) => onDirectCostsChange({ ...directCosts, travel: v })} />
          <NumberField label="Project-specific Materials" prefix="$" value={directCosts?.projectSpecificMaterials} onChange={(v) => onDirectCostsChange({ ...directCosts, projectSpecificMaterials: v })} />
          <NumberField label="Service Delivery Software" prefix="$" value={directCosts?.serviceDeliverySoftware} onChange={(v) => onDirectCostsChange({ ...directCosts, serviceDeliverySoftware: v })} />
          <NumberField label="Payment Processing" suffix="% of revenue" value={directCosts?.paymentProcessingPercent} onChange={(v) => onDirectCostsChange({ ...directCosts, paymentProcessingPercent: v })} />
        </div>
      </div>

      {offerings.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Service Revenue</div>
            <div className="text-sm font-bold text-emerald-800">${summary.monthlyRevenue.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Direct Service Cost</div>
            <div className="text-sm font-bold text-emerald-800">${summary.monthlyDirectCost.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Gross Profit</div>
            <div className="text-sm font-bold text-emerald-800">${summary.monthlyGrossProfit.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-emerald-700/70 uppercase font-bold">Gross Margin</div>
            <div className="text-sm font-bold text-emerald-800">{summary.grossMarginPercent}%</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesWorkflowPanel;
