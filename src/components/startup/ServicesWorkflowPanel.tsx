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
  Check,
  Info,
  Layers,
  ArrowRight
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
  const [hoveredGuide, setHoveredGuide] = useState<string | null>(null);

  // New service form state
  const [newServiceName, setNewServiceName] = useState('');
  const [newRevenueModel, setNewRevenueModel] = useState<ServiceRevenueModel>('project');
  const [newRate, setNewRate] = useState('250.00');
  const [newVolume, setNewVolume] = useState('15');
  const [newDirectCost, setNewDirectCost] = useState('25.00');
  const [newGrowth, setNewGrowth] = useState('2.0');

  const capacityCalc = calculateServiceCapacity(capacityPlan);

  const isStaffMode = capacityPlan.resourceType === 'staff';

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
      return pOrS(s, field, value);
    });
    onUpdateServices(updated);
  };

  function pOrS(item: ServiceOffering, field: keyof ServiceOffering, value: any) {
    return { ...item, [field]: value };
  }

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
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200/70">
                Capacity Engine (Decision 2)
              </span>
              <div 
                className="relative inline-block"
                onMouseEnter={() => setHoveredGuide('capacity-header')}
                onMouseLeave={() => setHoveredGuide(null)}
              >
                <button
                  type="button"
                  className="text-stone-400 hover:text-blue-700 transition cursor-help flex items-center gap-1"
                >
                  <Info size={14} />
                  <span className="text-[11px] text-blue-700 font-bold underline decoration-dotted">Guide &amp; Tips</span>
                </button>
                {/* Floating Guide Popup */}
                <div 
                  className={`absolute left-0 top-full mt-1.5 w-80 sm:w-[420px] max-w-[90vw] bg-stone-950/95 text-white rounded-2xl p-4 shadow-2xl border border-blue-500/40 text-xs space-y-2.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                    hoveredGuide === 'capacity-header' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-blue-400" />
                      <h5 className="font-bold text-white text-xs">Service &amp; Resource Capacity Engine</h5>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Overview
                    </span>
                  </div>
                  <div className="space-y-1.5 bg-stone-900/90 rounded-xl p-2.5 border border-stone-800/80 text-[11.5px] leading-relaxed text-stone-200">
                    <p>
                      <strong>What is this for?</strong> It models how much revenue your business can generate per month based on your physical delivery constraints:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-stone-300 pl-1">
                      <li>
                        <strong className="text-blue-300">Staff / Billable Team:</strong> If you deliver work through human hours (consulting, development, design, legal, trades, coaching).
                      </li>
                      <li>
                        <strong className="text-blue-300">Equipment / Fleet Assets:</strong> If you rent out physical machines, vehicles, cameras, sound systems, trailers, or event booths by the day.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <h4 className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-2">
              <Clock size={16} className="text-blue-700" />
              <span>Service Delivery Capacity &amp; Resource Plan</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              Choose whether your operational capacity is bounded by <strong className="text-stone-700">Team Billable Hours</strong> or <strong className="text-stone-700">Rental Equipment Days</strong>.
            </p>
          </div>

          {/* Resource Type Switcher with Mouse-roll Guides */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200/60">
              {/* Staff Switcher Button */}
              <div 
                className="relative"
                onMouseEnter={() => setHoveredGuide('staff-tab')}
                onMouseLeave={() => setHoveredGuide(null)}
              >
                <button
                  type="button"
                  onClick={() => onUpdateCapacityPlan({ 
                    ...capacityPlan, 
                    resourceType: 'staff',
                    availableTimePerResource: capacityPlan.availableTimePerResource > 31 ? capacityPlan.availableTimePerResource : 160,
                    hourlyOrDailyRate: capacityPlan.hourlyOrDailyRate > 300 ? 75 : (capacityPlan.hourlyOrDailyRate || 75)
                  })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isStaffMode
                      ? 'bg-white text-blue-800 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Users size={13} />
                  <span>Staff / Billable Team</span>
                </button>

                {/* Staff Mouse-roll Tooltip */}
                <div 
                  className={`absolute right-0 sm:left-0 top-full mt-1.5 w-72 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-blue-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                    hoveredGuide === 'staff-tab' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
                  }`}
                >
                  <div className="font-bold text-blue-300 flex items-center gap-1">
                    <Users size={12} /> Staff / Billable Team Mode
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed">
                    Select this if your services are delivered by people (e.g. software developers, designers, lawyers, consultants, technicians, cleaners). Capacity is calculated in <strong>billable hours/month</strong> at an <strong>hourly rate ($/hr)</strong>.
                  </p>
                </div>
              </div>

              {/* Equipment Switcher Button */}
              <div 
                className="relative"
                onMouseEnter={() => setHoveredGuide('equipment-tab')}
                onMouseLeave={() => setHoveredGuide(null)}
              >
                <button
                  type="button"
                  onClick={() => onUpdateCapacityPlan({ 
                    ...capacityPlan, 
                    resourceType: 'equipment',
                    availableTimePerResource: capacityPlan.availableTimePerResource > 31 ? 25 : capacityPlan.availableTimePerResource,
                    hourlyOrDailyRate: capacityPlan.hourlyOrDailyRate <= 150 ? 500 : capacityPlan.hourlyOrDailyRate
                  })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    !isStaffMode
                      ? 'bg-white text-blue-800 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Wrench size={13} />
                  <span>Equipment / Fleet Assets</span>
                </button>

                {/* Equipment Mouse-roll Tooltip */}
                <div 
                  className={`absolute right-0 top-full mt-1.5 w-72 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-blue-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                    hoveredGuide === 'equipment-tab' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
                  }`}
                >
                  <div className="font-bold text-amber-300 flex items-center gap-1">
                    <Wrench size={12} /> Equipment / Fleet Assets Mode
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed">
                    Select this if you generate revenue by renting or hiring out equipment (e.g. plant machinery, vehicles, photo booths, cameras, party gear, trailers). Capacity is calculated in <strong>rental days/month</strong> at a <strong>daily rental rate ($/day)</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Capacity Inputs with Direct, Crystal Clear Labels and Mouse-roll Guidance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Input 1: Resource Count */}
          <div 
            className="space-y-1 relative group/field"
            onMouseEnter={() => setHoveredGuide('guide-field-1')}
            onMouseLeave={() => setHoveredGuide(null)}
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 transition-colors select-none">
                <span>{isStaffMode ? '1. Billable Staff Members' : '1. Active Equipment Units'}</span>
                <Info size={12} className="text-stone-400 group-hover/field:text-blue-600 transition-colors shrink-0" />
              </label>
              <span className="text-[10px] text-stone-400 font-medium">{isStaffMode ? 'people' : 'units'}</span>
            </div>
            <input
              type="number"
              min="1"
              value={capacityPlan.resourceCount}
              onChange={(e) =>
                onUpdateCapacityPlan({ ...capacityPlan, resourceCount: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="w-full px-3 py-1.5 text-xs font-semibold border border-stone-200 rounded-lg bg-stone-50 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
            />
            <p className="text-[10px] text-stone-500">
              {isStaffMode ? 'e.g. 2 full-time specialists' : 'e.g. 12 rental fleet items'}
            </p>

            {/* Mouse-roll Tooltip Field 1 */}
            <div 
              className={`absolute left-0 top-full mt-1.5 w-72 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-blue-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                hoveredGuide === 'guide-field-1' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
              }`}
            >
              <div className="font-bold text-blue-300 flex items-center gap-1">
                <Info size={12} /> {isStaffMode ? 'Billable Staff Members' : 'Active Equipment Units'}
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                {isStaffMode
                  ? 'Total count of team members (including founders) whose time is billed out to paying clients. Do not include pure non-billable overhead staff.'
                  : 'Total physical machines, vehicles, or gear units in your inventory that are available for client rental/hire.'}
              </p>
            </div>
          </div>

          {/* Input 2: Available Time per Resource per Month */}
          <div 
            className="space-y-1 relative group/field"
            onMouseEnter={() => setHoveredGuide('guide-field-2')}
            onMouseLeave={() => setHoveredGuide(null)}
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 transition-colors select-none">
                <span>{isStaffMode ? '2. Monthly Hours (per Staff)' : '2. Monthly Rental Days (per Unit)'}</span>
                <Info size={12} className="text-stone-400 group-hover/field:text-blue-600 transition-colors shrink-0" />
              </label>
              <span className="text-[10px] text-stone-400 font-medium">{isStaffMode ? 'hrs/person/mo' : 'days/unit/mo'}</span>
            </div>
            <input
              type="number"
              min="1"
              max={isStaffMode ? 300 : 31}
              value={capacityPlan.availableTimePerResource}
              onChange={(e) =>
                onUpdateCapacityPlan({
                  ...capacityPlan,
                  availableTimePerResource: Math.max(1, parseInt(e.target.value) || 1)
                })
              }
              className="w-full px-3 py-1.5 text-xs font-semibold border border-stone-200 rounded-lg bg-stone-50 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
            />
            <p className="text-[10px] text-stone-500">
              {isStaffMode ? 'e.g. 160 hrs (40 hrs/wk × 4 wks)' : 'e.g. 20–30 days in a month (max 31)'}
            </p>

            {/* Mouse-roll Tooltip Field 2 */}
            <div 
              className={`absolute left-0 top-full mt-1.5 w-76 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-blue-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                hoveredGuide === 'guide-field-2' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
              }`}
            >
              <div className="font-bold text-blue-300 flex items-center gap-1">
                <Clock size={12} /> {isStaffMode ? 'Monthly Working Hours per Person' : 'Monthly Available Rental Days per Machine'}
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                {isStaffMode
                  ? 'The total working hours available in 1 month for ONE employee. A standard full-time person working 40 hours per week has 160 hours/month (40 × 4).'
                  : 'The total calendar days in 1 month that ONE equipment unit is available to be rented. Since there are 28–31 days in a month, enter between 20 (business days only) and 30 (7-days/week).'}
              </p>
              <div className="p-1.5 bg-stone-900 rounded text-[10.5px] text-amber-300 font-mono">
                {isStaffMode ? 'Formula: 40 hrs/wk × 4 wks = 160 hrs/mo' : 'Formula: Max calendar days = 30-31 days/mo'}
              </div>
            </div>
          </div>

          {/* Input 3: Target Utilisation Rate (%) */}
          <div 
            className="space-y-1 relative group/field"
            onMouseEnter={() => setHoveredGuide('guide-field-3')}
            onMouseLeave={() => setHoveredGuide(null)}
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 transition-colors select-none">
                <span>3. Target Utilisation Rate (%)</span>
                <Info size={12} className="text-stone-400 group-hover/field:text-blue-600 transition-colors shrink-0" />
              </label>
              <span className="text-[10px] text-stone-400 font-medium">efficiency %</span>
            </div>
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
                className="w-full px-3 pr-7 py-1.5 text-xs font-semibold border border-stone-200 rounded-lg bg-stone-50 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
              />
              <span className="absolute right-2.5 top-1.5 text-xs text-stone-400 font-bold">%</span>
            </div>
            <p className="text-[10px] text-stone-500">
              {isStaffMode ? 'e.g. 75% billable client work' : 'e.g. 50% fleet booked/rented'}
            </p>

            {/* Mouse-roll Tooltip Field 3 */}
            <div 
              className={`absolute left-0 top-full mt-1.5 w-76 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-blue-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                hoveredGuide === 'guide-field-3' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
              }`}
            >
              <div className="font-bold text-blue-300 flex items-center gap-1">
                <TrendingUp size={12} /> Target Utilisation Rate (%)
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                {isStaffMode
                  ? 'The percentage of available staff hours spent on paid client projects (versus non-billable meetings, admin, marketing, or downtime). Industry standard is 65% to 80%.'
                  : 'The expected booking/rental occupancy rate. If your equipment is rented half the days in any given month, enter 50%.'}
              </p>
            </div>
          </div>

          {/* Input 4: Benchmark Rate (Hourly in Staff mode, Daily in Equipment mode) */}
          <div 
            className="space-y-1 relative group/field"
            onMouseEnter={() => setHoveredGuide('guide-field-4')}
            onMouseLeave={() => setHoveredGuide(null)}
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 transition-colors select-none">
                <span>{isStaffMode ? '4. Benchmark Hourly Rate ($/hr)' : '4. Benchmark Daily Rental Rate ($/day)'}</span>
                <Info size={12} className="text-stone-400 group-hover/field:text-blue-600 transition-colors shrink-0" />
              </label>
              <span className="text-[10px] text-stone-400 font-medium">{isStaffMode ? '$/hr' : '$/day'}</span>
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1.5 text-xs text-stone-400 font-bold">$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={capacityPlan.hourlyOrDailyRate || (isStaffMode ? 75 : 500)}
                onChange={(e) =>
                  onUpdateCapacityPlan({
                    ...capacityPlan,
                    hourlyOrDailyRate: Math.max(0, parseFloat(e.target.value) || 0)
                  })
                }
                className="w-full pl-6 pr-12 py-1.5 text-xs font-semibold border border-stone-200 rounded-lg bg-stone-50 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-stone-400 font-bold">
                {isStaffMode ? '/ hour' : '/ day'}
              </span>
            </div>
            <p className="text-[10px] text-stone-500">
              {isStaffMode ? 'e.g. $75 / billable hour' : 'e.g. $1,440 / rental day'}
            </p>

            {/* Mouse-roll Tooltip Field 4 */}
            <div 
              className={`absolute right-0 sm:left-0 top-full mt-1.5 w-76 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-blue-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                hoveredGuide === 'guide-field-4' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
              }`}
            >
              <div className="font-bold text-blue-300 flex items-center gap-1">
                <DollarSign size={12} /> {isStaffMode ? 'Hourly Rate ($/hr)' : 'Daily Rental Rate ($/day)'}
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                {isStaffMode
                  ? 'The benchmark fee charged to clients for 1 billable hour of team labor. This is multiplied by your effective billable hours to calculate monthly capacity revenue potential.'
                  : 'The benchmark rental/hire fee charged to clients for 1 full day of equipment usage. This is multiplied by your effective rental days to calculate monthly potential revenue.'}
              </p>
            </div>
          </div>
        </div>

        {/* Live Capacity Output Strip with Crystal Clear Math */}
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-700 shrink-0" />
              <span className="font-bold text-stone-900">
                Calculated Monthly Capacity Benchmark ({isStaffMode ? 'Staff Labor Hours' : 'Rental Fleet Days'}):
              </span>
            </div>
            <span className="text-[11px] text-stone-500">
              Math: {capacityPlan.resourceCount} {isStaffMode ? 'staff' : 'units'} × {capacityPlan.availableTimePerResource} {isStaffMode ? 'hrs' : 'days'} = {capacityCalc.totalCapacityUnits} total {isStaffMode ? 'hrs' : 'unit-days'} @ {capacityPlan.targetUtilisationPercent}% utilisation
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold pt-1 border-t border-blue-200/60">
            <span>
              Total Available Capacity: <strong>{capacityCalc.totalCapacityUnits} {isStaffMode ? 'hours' : 'rental days'}/mo</strong>
            </span>
            <span className="text-stone-300">|</span>
            <span className="text-blue-900">
              Effective Billable / Booked: <strong>{capacityCalc.effectiveCapacityUnits} {isStaffMode ? 'hours' : 'days'}/mo</strong>
            </span>
            <span className="text-stone-300">|</span>
            <span className="text-emerald-800 font-bold">
              Max Revenue Potential: <strong>${capacityCalc.monthlyRevenuePotential.toLocaleString()}/mo</strong>
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
              <span>Service Offerings &amp; Revenue Models</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              Define your client engagement models: hourly contracts, project milestones, retainers, subscriptions, or rentals.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddService(!showAddService)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
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
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Commercial Revenue Model</label>
                <select
                  value={newRevenueModel}
                  onChange={(e) => setNewRevenueModel(e.target.value as ServiceRevenueModel)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
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
                    className="w-full pl-6 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
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
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
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
                    className="w-full pl-6 pr-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
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
                    className="w-full px-3 pr-6 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <span className="absolute right-2 top-1.5 text-xs text-stone-400">%</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddService(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-stone-500 hover:bg-stone-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
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
                      className="p-1 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
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
