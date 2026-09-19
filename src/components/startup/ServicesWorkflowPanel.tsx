import React, { useState } from 'react';
import {
  Briefcase,
  Plus,
  Trash2,
  TrendingUp,
  Clock,
  Users,
  Wrench,
  DollarSign,
  HelpCircle,
  Sparkles,
  Repeat,
  Check
} from 'lucide-react';
import {
  ServiceOffering,
  ServiceCapacityPlan,
  ServiceRevenueModel,
  StartupCostItem
} from '../../types';
import { SharedCostItemList } from './SharedCostItemList';
import { SharedCostItemForm } from './SharedCostItemForm';
import { calculateServiceCapacity, roundCurrency } from '../../services/startupFinancialsService';

interface ServicesWorkflowPanelProps {
  services: ServiceOffering[];
  capacityPlan?: ServiceCapacityPlan;
  costItems: StartupCostItem[];
  startingCash?: number;
  onUpdateServices: (services: ServiceOffering[]) => void;
  onUpdateCapacityPlan: (plan: ServiceCapacityPlan) => void;
  onUpdateCostItems: (items: StartupCostItem[]) => void;
  onUpdateStartingCash: (cash: number) => void;
}

export const ServicesWorkflowPanel: React.FC<ServicesWorkflowPanelProps> = ({
  services,
  capacityPlan: initialCapacityPlan,
  costItems,
  startingCash = 10000,
  onUpdateServices,
  onUpdateCapacityPlan,
  onUpdateCostItems,
  onUpdateStartingCash
}) => {
  const capacityPlan: ServiceCapacityPlan = initialCapacityPlan || {
    resourceType: 'staff',
    resourceCount: 2,
    availableTimePerResource: 160,
    targetUtilisationPercent: 75,
    hourlyOrDailyRate: 75
  };
  const [editingItem, setEditingItem] = useState<StartupCostItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [showAddService, setShowAddService] = useState(false);

  // New service form state
  const [newServiceName, setNewServiceName] = useState('');
  const [newRevenueModel, setNewRevenueModel] = useState<ServiceRevenueModel>('project');
  const [newRate, setNewRate] = useState('250.00');
  const [newVolume, setNewVolume] = useState('15');
  const [newDirectCost, setNewDirectCost] = useState('25.00');
  const [newGrowth, setNewGrowth] = useState('2.0');

  const capacityCalc = calculateServiceCapacity(capacityPlan);

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;

    const newService: ServiceOffering = {
      id: `service-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: newServiceName.trim(),
      revenueModel: newRevenueModel,
      rate: Math.max(0.01, parseFloat(newRate) || 100),
      expectedVolume: Math.max(1, parseInt(newVolume) || 10),
      directCostPerUnitOrJob: Math.max(0, parseFloat(newDirectCost) || 0),
      monthlyGrowthRatePercent: parseFloat(newGrowth) || 0,
      annualGrowthRatePercent: 15
    };

    onUpdateServices([...services, newService]);
    setNewServiceName('');
    setNewRate('250.00');
    setNewVolume('15');
    setNewDirectCost('25.00');
    setShowAddService(false);
  };

  const handleRemoveService = (id: string) => {
    onUpdateServices(services.filter((s) => s.id !== id));
  };

  const handleUpdateServiceField = (id: string, field: keyof ServiceOffering, value: any) => {
    const updated = services.map((s) => {
      if (s.id === id) {
        return { ...s, [field]: value };
      }
      return s;
    });
    onUpdateServices(updated);
  };

  // Cost items handlers
  const handleSaveCostItem = (item: StartupCostItem) => {
    const exists = costItems.some((i) => i.id === item.id);
    if (exists) {
      onUpdateCostItems(costItems.map((i) => (i.id === item.id ? item : i)));
    } else {
      onUpdateCostItems([...costItems, item]);
    }
    setEditingItem(null);
    setIsAddingItem(false);
  };

  const handleDeleteCostItem = (itemId: string) => {
    onUpdateCostItems(costItems.filter((i) => i.id !== itemId));
  };

  const equipmentItems = costItems.filter((i) => i.classification === 'equipment');

  // Total projected monthly services revenue
  const totalMonthlyServiceRevenue = services.reduce(
    (sum, s) => sum + (s.expectedVolume || 1) * s.rate,
    0
  );

  const getModelLabel = (model: ServiceRevenueModel) => {
    switch (model) {
      case 'hourly':
        return 'Hourly Billing';
      case 'project':
        return 'Fixed Project Fee';
      case 'retainer':
        return 'Monthly Retainer';
      case 'subscription':
        return 'Recurring Subscription';
      case 'rental':
        return 'Equipment / Facility Rental';
      case 'commission':
        return 'Commission / Success Fee';
    }
  };

  const getUnitName = (model: ServiceRevenueModel) => {
    switch (model) {
      case 'hourly':
        return 'hours';
      case 'project':
        return 'projects';
      case 'retainer':
        return 'retainers';
      case 'subscription':
        return 'subscribers';
      case 'rental':
        return 'rental days';
      case 'commission':
        return 'deals';
    }
  };

  return (
    <div className="space-y-6">
      {/* Starting Cash Balance Banner */}
      <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
            Initial Capitalization & Liquidity
          </div>
          <div className="text-sm font-semibold text-emerald-50">
            Starting Cash in Bank (Month 1 Reserve)
          </div>
          <div className="text-[11px] text-emerald-200/80">
            Available working capital to fund software, tooling, setup deposits, and initial operations.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-2 text-xs text-stone-400 font-bold">$</span>
            <input
              type="number"
              min="0"
              step="100"
              value={startingCash}
              onChange={(e) => onUpdateStartingCash(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-36 pl-7 pr-3 py-1.5 text-xs font-bold bg-white text-stone-900 rounded-xl border border-emerald-300/40 focus:ring-2 focus:ring-emerald-400 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Decision 2: Generalised Capacity Planner (Staff or Equipment) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200/70">
              Capacity Engine (Decision 2)
            </span>
            <h4 className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-2">
              <Clock size={16} className="text-blue-700" />
              <span>Service Delivery Capacity & Resource Plan</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              Generalised resource model for billable staff or rental equipment assets.
            </p>
          </div>

          {/* Resource Type Switcher */}
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200/60 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onUpdateCapacityPlan({ ...capacityPlan, resourceType: 'staff' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                capacityPlan.resourceType === 'staff'
                  ? 'bg-white text-blue-800 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Users size={13} />
              <span>Staff / Billable Team</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateCapacityPlan({ ...capacityPlan, resourceType: 'equipment' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                capacityPlan.resourceType === 'equipment'
                  ? 'bg-white text-blue-800 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Wrench size={13} />
              <span>Equipment / Fleet Assets</span>
            </button>
          </div>
        </div>

        {/* Capacity Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-stone-700">
              {capacityPlan.resourceType === 'staff' ? 'Billable Staff Members' : 'Active Equipment Units'}
            </label>
            <input
              type="number"
              min="1"
              value={capacityPlan.resourceCount}
              onChange={(e) =>
                onUpdateCapacityPlan({ ...capacityPlan, resourceCount: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="w-full px-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-stone-700">
              {capacityPlan.resourceType === 'staff' ? 'Available Hours / Staff / Mo' : 'Available Days / Unit / Mo'}
            </label>
            <input
              type="number"
              min="1"
              value={capacityPlan.availableTimePerResource}
              onChange={(e) =>
                onUpdateCapacityPlan({
                  ...capacityPlan,
                  availableTimePerResource: Math.max(1, parseInt(e.target.value) || 1)
                })
              }
              className="w-full px-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50 focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-stone-700">
              Target Utilisation Rate (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                value={capacityPlan.targetUtilisationPercent}
                onChange={(e) =>
                  onUpdateCapacityPlan({
                    ...capacityPlan,
                    targetUtilisationPercent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                  })
                }
                className="w-full px-3 pr-7 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50 focus:bg-white"
              />
              <span className="absolute right-2.5 top-1.5 text-xs text-stone-400">%</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-stone-700">
              Benchmark Hourly / Daily Rate ($)
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={capacityPlan.hourlyOrDailyRate || 75}
                onChange={(e) =>
                  onUpdateCapacityPlan({
                    ...capacityPlan,
                    hourlyOrDailyRate: Math.max(0, parseFloat(e.target.value) || 0)
                  })
                }
                className="w-full pl-6 pr-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-stone-50 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Live Capacity Output Strip */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-blue-700" />
            <span className="font-bold text-stone-900">Calculated Capacity Benchmark:</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <span>
              Total Available: <strong>{capacityCalc.totalCapacityUnits} {capacityPlan.resourceType === 'staff' ? 'hrs' : 'days'}/mo</strong>
            </span>
            <span className="text-stone-300">|</span>
            <span className="text-blue-900">
              Effective Billable: <strong>{capacityCalc.effectiveCapacityUnits} {capacityPlan.resourceType === 'staff' ? 'hrs' : 'days'}/mo</strong>
            </span>
            <span className="text-stone-300">|</span>
            <span className="text-emerald-800">
              Max Potential: <strong>${capacityCalc.monthlyRevenuePotential.toLocaleString()}/mo</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Service Offerings Catalog */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-3">
          <div>
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Briefcase size={16} className="text-emerald-700" />
              <span>Service Offerings & Revenue Models</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              Define your client engagement models: hourly contracts, project milestones, retainers, subscriptions, or rentals.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddService(!showAddService)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus size={13} />
            <span>Add Service</span>
          </button>
        </div>

        {/* Add Service Inline Form */}
        {showAddService && (
          <form onSubmit={handleAddService} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
            <div className="text-xs font-bold text-stone-900">Add New Service Offering</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Marketing Retainer"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Commercial Revenue Model</label>
                <select
                  value={newRevenueModel}
                  onChange={(e) => setNewRevenueModel(e.target.value as ServiceRevenueModel)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                >
                  <option value="project">Fixed Project Fee</option>
                  <option value="hourly">Hourly Billing</option>
                  <option value="retainer">Monthly Retainer</option>
                  <option value="subscription">Recurring Subscription</option>
                  <option value="rental">Equipment / Space Rental</option>
                  <option value="commission">Commission Fee</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Billing Rate / Price ($)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    className="w-full pl-6 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Initial Monthly Volume ({getUnitName(newRevenueModel)})
                </label>
                <input
                  type="number"
                  min="1"
                  value={newVolume}
                  onChange={(e) => setNewVolume(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Direct Cost per Job/Unit ($)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-stone-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newDirectCost}
                    onChange={(e) => setNewDirectCost(e.target.value)}
                    className="w-full pl-6 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">MoM Growth Rate (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newGrowth}
                    onChange={(e) => setNewGrowth(e.target.value)}
                    className="w-full px-3 pr-6 py-1.5 text-xs border border-stone-200 bg-white rounded-lg"
                  />
                  <span className="absolute right-2 top-1.5 text-xs text-stone-400">%</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddService(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-stone-500 hover:bg-stone-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
              >
                Save Service Offering
              </button>
            </div>
          </form>
        )}

        {/* Service Offerings List */}
        <div className="space-y-2.5">
          {services.map((service) => {
            const monthlyRev = service.rate * (service.expectedVolume || 1);
            return (
              <div
                key={service.id}
                className="bg-stone-50/70 border border-stone-200/90 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-900">{service.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-stone-200/80 text-stone-700">
                      {getModelLabel(service.revenueModel)}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 flex items-center gap-3">
                    <span>Rate: <strong>${service.rate.toFixed(2)}</strong></span>
                    <span>•</span>
                    <span>Volume: <strong>{service.expectedVolume || 1} {getUnitName(service.revenueModel)}/mo</strong></span>
                    <span>•</span>
                    <span>Monthly Revenue: <strong>${monthlyRev.toLocaleString()}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <div className="flex items-center gap-1 text-xs">
                    <label className="text-[10px] text-stone-500">Vol/mo:</label>
                    <input
                      type="number"
                      min="1"
                      value={service.expectedVolume || 1}
                      onChange={(e) =>
                        handleUpdateServiceField(service.id, 'expectedVolume', parseInt(e.target.value) || 1)
                      }
                      className="w-18 px-2 py-1 text-xs border border-stone-200 bg-white rounded-lg"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <label className="text-[10px] text-stone-500">Rate:</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={service.rate}
                      onChange={(e) =>
                        handleUpdateServiceField(service.id, 'rate', parseFloat(e.target.value) || 0)
                      }
                      className="w-20 px-2 py-1 text-xs border border-stone-200 bg-white rounded-lg"
                    />
                  </div>

                  {services.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveService(service.id)}
                      className="p-1 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-stone-100 transition-colors"
                      title="Remove service"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Embedded Cost Items Ledger & Form Modal */}
      {isAddingItem || editingItem ? (
        <SharedCostItemForm
          initialItem={editingItem || undefined}
          availableEquipmentList={equipmentItems}
          onSave={handleSaveCostItem}
          onCancel={() => {
            setIsAddingItem(false);
            setEditingItem(null);
          }}
        />
      ) : (
        <SharedCostItemList
          items={costItems}
          onAddItem={() => setIsAddingItem(true)}
          onEditItem={(item) => setEditingItem(item)}
          onDeleteItem={handleDeleteCostItem}
          title="Service Operations Cost Structure & Equipment"
          subtitle="Manage equipment assets (including rental equipment), direct delivery costs, software, and overheads"
        />
      )}
    </div>
  );
};
