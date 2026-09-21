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
  ArrowRight,
  CheckSquare,
  Square,
  Ship,
  ArrowLeftRight
} from 'lucide-react';
import {
  ServiceOffering,
  ServiceCapacityPlan,
  ServiceRevenueModel,
  StartupCostItem,
  ImportDutyCalculation,
  ImportDutyCategory,
  CurrencyCode
} from '../../types';
import { SharedCostItemList } from './SharedCostItemList';
import { SharedCostItemForm } from './SharedCostItemForm';
import { ImportLandedCostCalculator } from './ImportLandedCostCalculator';
import { CurrencyToggle } from './CurrencyToggle';
import {
  calculateServiceCapacity,
  roundCurrency,
  getDefaultServiceUnitLabel,
  getServiceOfferingUnitLabel
} from '../../services/startupFinancialsService';
import { DEFAULT_USD_TO_XCD_RATE, getCurrencySymbol, convertCurrency } from '../../services/currencyService';

interface ServicesWorkflowPanelProps {
  services: ServiceOffering[];
  capacityPlan?: ServiceCapacityPlan;
  costItems: StartupCostItem[];
  startingCash?: number;
  displayCurrency?: CurrencyCode;
  exchangeRate?: number;
  onUpdateServices: (services: ServiceOffering[]) => void;
  onUpdateCapacityPlan: (plan: ServiceCapacityPlan) => void;
  onUpdateCostItems: (items: StartupCostItem[]) => void;
  onUpdateStartingCash: (cash: number) => void;
  onChangeDisplayCurrency?: (currency: CurrencyCode) => void;
  onUpdateExchangeRate?: (rate: number) => void;
}

export const ServicesWorkflowPanel: React.FC<ServicesWorkflowPanelProps> = ({
  services,
  capacityPlan: initialCapacityPlan,
  costItems,
  startingCash = 10000,
  displayCurrency: controlledDisplayCurrency,
  exchangeRate: controlledExchangeRate,
  onUpdateServices,
  onUpdateCapacityPlan,
  onUpdateCostItems,
  onUpdateStartingCash,
  onChangeDisplayCurrency,
  onUpdateExchangeRate
}) => {
  const [localDisplayCurrency, setLocalDisplayCurrency] = useState<CurrencyCode>('XCD');
  const [localExchangeRate, setLocalExchangeRate] = useState<number>(DEFAULT_USD_TO_XCD_RATE);

  const displayCurrency = controlledDisplayCurrency ?? localDisplayCurrency;
  const exchangeRate = controlledExchangeRate ?? localExchangeRate;

  const handleCurrencyChange = (curr: CurrencyCode) => {
    setLocalDisplayCurrency(curr);
    onChangeDisplayCurrency?.(curr);
  };

  const handleRateChange = (rate: number) => {
    setLocalExchangeRate(rate);
    onUpdateExchangeRate?.(rate);
  };

  const currentSymbol = getCurrencySymbol(displayCurrency);
  const otherCurrency: CurrencyCode = displayCurrency === 'USD' ? 'XCD' : 'USD';
  const otherSymbol = getCurrencySymbol(otherCurrency);

  const [editingItem, setEditingItem] = useState<StartupCostItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showFleetImportCalculator, setShowFleetImportCalculator] = useState(false);
  const [hoveredGuide, setHoveredGuide] = useState<string | null>(null);

  // Live conversion helper for input fields
  const renderConversionHint = (valStr: string | number, inputCurrency: CurrencyCode = displayCurrency) => {
    const val = typeof valStr === 'number' ? valStr : parseFloat(valStr) || 0;
    if (val <= 0) return null;
    const target = inputCurrency === 'USD' ? 'XCD' : 'USD';
    const converted = convertCurrency(val, inputCurrency, target, exchangeRate);
    const targetSym = getCurrencySymbol(target);
    return (
      <span className="text-[10px] text-stone-500 font-mono flex items-center gap-1 mt-0.5">
        <ArrowLeftRight size={10} className="text-blue-500 shrink-0" />
        <span>≈ {targetSym} {converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </span>
    );
  };

  // Helper to normalize service rate to active display currency
  const normalizeServiceRate = (service: ServiceOffering): number => {
    const sCurrency = service.currency || 'USD';
    return convertCurrency(service.rate, sCurrency, displayCurrency, exchangeRate);
  };

  const normalizeServiceDirectCost = (service: ServiceOffering): number => {
    const sCurrency = service.currency || 'USD';
    return convertCurrency(service.directCostPerUnitOrJob || 0, sCurrency, displayCurrency, exchangeRate);
  };

  // Initialize independent staff and equipment plans
  const staffPlan = initialCapacityPlan?.staff || {
    enabled: initialCapacityPlan?.resourceType === 'staff' || !initialCapacityPlan?.resourceType || initialCapacityPlan?.resourceType === 'both',
    resourceCount: initialCapacityPlan?.resourceType === 'staff' ? (initialCapacityPlan.resourceCount || 2) : 2,
    availableHoursPerStaff: initialCapacityPlan?.resourceType === 'staff' ? (initialCapacityPlan.availableTimePerResource || 160) : 160,
    targetUtilisationPercent: initialCapacityPlan?.resourceType === 'staff' ? (initialCapacityPlan.targetUtilisationPercent ?? 75) : 75,
    hourlyRate: initialCapacityPlan?.resourceType === 'staff' ? (initialCapacityPlan.hourlyOrDailyRate || 75) : 75
  };

  const equipmentPlan = initialCapacityPlan?.equipment || {
    enabled: initialCapacityPlan?.resourceType === 'equipment' || initialCapacityPlan?.resourceType === 'both',
    resourceCount: initialCapacityPlan?.resourceType === 'equipment' ? (initialCapacityPlan.resourceCount || 12) : 12,
    availableDaysPerUnit: initialCapacityPlan?.resourceType === 'equipment' ? (initialCapacityPlan.availableTimePerResource || 25) : 25,
    targetUtilisationPercent: initialCapacityPlan?.resourceType === 'equipment' ? (initialCapacityPlan.targetUtilisationPercent ?? 50) : 50,
    dailyRate: initialCapacityPlan?.resourceType === 'equipment' ? (initialCapacityPlan.hourlyOrDailyRate || 500) : 500
  };

  const currentPlan: ServiceCapacityPlan = {
    ...initialCapacityPlan,
    resourceType: staffPlan.enabled && equipmentPlan.enabled ? 'both' : (staffPlan.enabled ? 'staff' : 'equipment'),
    staff: staffPlan,
    equipment: equipmentPlan
  };

  const capacityCalc = calculateServiceCapacity(currentPlan);

  const handleUpdateStaffPlan = (updates: Partial<typeof staffPlan>) => {
    const updatedStaff = { ...staffPlan, ...updates };
    onUpdateCapacityPlan({
      ...currentPlan,
      staff: updatedStaff,
      resourceType: updatedStaff.enabled && equipmentPlan.enabled ? 'both' : (updatedStaff.enabled ? 'staff' : 'equipment'),
      resourceCount: updatedStaff.resourceCount,
      availableTimePerResource: updatedStaff.availableHoursPerStaff,
      targetUtilisationPercent: updatedStaff.targetUtilisationPercent,
      hourlyOrDailyRate: updatedStaff.hourlyRate
    });
  };

  const handleUpdateEquipmentPlan = (updates: Partial<typeof equipmentPlan>) => {
    const updatedEquip = { ...equipmentPlan, ...updates };
    onUpdateCapacityPlan({
      ...currentPlan,
      equipment: updatedEquip,
      resourceType: staffPlan.enabled && updatedEquip.enabled ? 'both' : (staffPlan.enabled ? 'staff' : 'equipment'),
      ...(staffPlan.enabled ? {} : {
        resourceCount: updatedEquip.resourceCount,
        availableTimePerResource: updatedEquip.availableDaysPerUnit,
        targetUtilisationPercent: updatedEquip.targetUtilisationPercent,
        hourlyOrDailyRate: updatedEquip.dailyRate
      })
    });
  };

  const handleSyncFleetToCostLedger = (result: {
    totalLandedCost: number;
    costPerUnitLanded: number;
    importDetails: ImportDutyCalculation;
  }) => {
    handleUpdateEquipmentPlan({
      hasAcquisitionPlan: true,
      unitPurchasePrice: result.importDetails.fobCost ? (result.importDetails.fobCost / equipmentPlan.resourceCount) : undefined,
      shippingFreightPerUnit: result.importDetails.shippingFreight ? (result.importDetails.shippingFreight / equipmentPlan.resourceCount) : undefined,
      importCategory: result.importDetails.category,
      importDetails: result.importDetails
    });

    // Remove any previous fleet items to prevent duplicate accumulation
    const nonFleetItems = costItems.filter(
      (i) => !(
        i.id === 'cost-fleet-equipment-asset' ||
        i.id.startsWith('cost-fleet-') ||
        (i.classification === 'equipment' && (
          i.isRentalRevenueGenerator ||
          i.name.toLowerCase().includes('rental fleet') ||
          i.name.toLowerCase().includes('fleet units')
        ))
      )
    );

    const landedAmount = result.importDetails?.totalLandedCostXCD ?? result.totalLandedCost;
    const fleetItem: StartupCostItem = {
      id: 'cost-fleet-equipment-asset',
      name: `${equipmentPlan.resourceCount}x Rental Fleet Units (${result.importDetails.category?.replace('_', ' ').toUpperCase() || 'EQUIPMENT'})`,
      classification: 'equipment',
      category: 'Fleet & Rental Assets',
      currency: 'XCD', // Stored in Saint Lucia EC$
      purchaseCost: landedAmount,
      amount: landedAmount,
      residualValue: roundCurrency(landedAmount * 0.1),
      usefulLifeYears: 4,
      purchaseMonth: 1,
      isRentalRevenueGenerator: true,
      rentalUnitsOwned: equipmentPlan.resourceCount,
      rentalAvailableTimePerUnit: equipmentPlan.availableDaysPerUnit,
      rentalUtilisationPercent: equipmentPlan.targetUtilisationPercent,
      rentalRatePerUnit: equipmentPlan.dailyRate,
      rentalTimeUnit: 'days',
      importDetails: result.importDetails,
      notes: `Landed asset imported to Saint Lucia (ASYCUDA Tariff: ${result.importDetails.category?.toUpperCase() || 'ELECTRONICS'}). Customs CIF: EC$ ${result.importDetails.cifValue?.toLocaleString()}. Total Duties & Levies: EC$ ${result.importDetails.totalDutiesAndTaxes?.toLocaleString()}. Total Landed Cost: EC$ ${landedAmount.toLocaleString()} (≈ US$ ${roundCurrency(landedAmount / 2.70).toLocaleString()}).`
    };

    onUpdateCostItems([fleetItem, ...nonFleetItems]);
    setShowFleetImportCalculator(false);
  };

  // New service form state
  const [newServiceName, setNewServiceName] = useState('');
  const [newRevenueModel, setNewRevenueModel] = useState<ServiceRevenueModel>('project');
  const [newUnitLabel, setNewUnitLabel] = useState(getDefaultServiceUnitLabel('project'));
  const [newRate, setNewRate] = useState('250.00');
  const [newServiceCurrency, setNewServiceCurrency] = useState<CurrencyCode>(displayCurrency);
  const [newVolume, setNewVolume] = useState('15');
  const [newDirectCost, setNewDirectCost] = useState('25.00');
  const [newGrowth, setNewGrowth] = useState('2.0');

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;

    const newService: ServiceOffering = {
      id: `service-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: newServiceName.trim(),
      currency: newServiceCurrency,
      revenueModel: newRevenueModel,
      unitLabel: newUnitLabel.trim() || getDefaultServiceUnitLabel(newRevenueModel),
      rate: Math.max(0.01, parseFloat(newRate) || 0.01),
      expectedVolume: Math.max(0, parseInt(newVolume) || 0),
      directCostPerUnitOrJob: Math.max(0, parseFloat(newDirectCost) || 0),
      monthlyGrowthRatePercent: parseFloat(newGrowth) || 0,
      annualGrowthRatePercent: 15
    };

    onUpdateServices([...services, newService]);
    setNewServiceName('');
    setNewRevenueModel('project');
    setNewUnitLabel(getDefaultServiceUnitLabel('project'));
    setNewRate('250.00');
    setNewServiceCurrency(displayCurrency);
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
      case 'event':
        return 'Per Event';
      case 'package':
        return 'Package / Bundle';
      case 'per_participant':
        return 'Per Participant';
      default:
        return 'Service Revenue';
    }
  };

  const getUnitName = (model: ServiceRevenueModel, customLabel?: string) =>
    customLabel?.trim() || getDefaultServiceUnitLabel(model);

  return (
    <div className="space-y-6">
      {/* Starting Cash Balance & Currency Selector Banner */}
      <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              Services Financial &amp; Capacity Engine
            </span>
          </div>
          <div className="text-sm font-semibold text-emerald-50">
            Initial Liquidity &amp; Currency Framework
          </div>
          <div className="text-[11px] text-emerald-200/80">
            Configure working capital, resource billing rates, and switch between US Dollars (USD) and Eastern Caribbean Dollars (XCD).
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <CurrencyToggle
            currentCurrency={displayCurrency}
            onChangeCurrency={handleCurrencyChange}
            exchangeRate={exchangeRate}
            onUpdateExchangeRate={handleRateChange}
            size="sm"
          />

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-stone-500 font-bold font-mono">{currentSymbol}</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={startingCash}
                  onChange={(e) => onUpdateStartingCash(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-36 pl-10 pr-3 py-1.5 text-xs font-bold font-mono bg-white text-stone-900 rounded-xl border border-emerald-300/40 focus:ring-2 focus:ring-emerald-400 focus:outline-hidden text-right"
                />
              </div>
            </div>
            {startingCash > 0 && (
              <div className="text-[10px] text-emerald-200/90 font-mono">
                ≈ {otherSymbol} {convertCurrency(startingCash, displayCurrency, otherCurrency, exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decision 2: Generalised Capacity Planner (Independent Staff & Equipment Models) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-5">
        {/* Header with Title & Guide Popover */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200/70">
                Capacity Engine ({displayCurrency})
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
                  <span className="text-[11px] text-blue-700 font-bold underline decoration-dotted">Dual Engine Guide &amp; Tips</span>
                </button>
                {/* Floating Guide Popup */}
                <div 
                  className={`absolute left-0 top-full mt-1.5 w-80 sm:w-[440px] max-w-[90vw] bg-stone-950/95 text-white rounded-2xl p-4 shadow-2xl border border-blue-500/40 text-xs space-y-2.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                    hoveredGuide === 'capacity-header' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-blue-400" />
                      <h5 className="font-bold text-white text-xs">Independent Capacity Engines</h5>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Dual Model
                    </span>
                  </div>
                  <div className="space-y-1.5 bg-stone-900/90 rounded-xl p-2.5 border border-stone-800/80 text-[11.5px] leading-relaxed text-stone-200">
                    <p>
                      <strong>How do they work together?</strong> A company can have both staff and equipment operating simultaneously:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-stone-300 pl-1">
                      <li>
                        <strong className="text-blue-300">Staff / Billable Team:</strong> Models labor hours billed to clients (e.g., consultants, engineers, operators, technicians).
                      </li>
                      <li>
                        <strong className="text-amber-300">Equipment / Fleet Assets:</strong> Models physical rental days or machine hire (e.g., excavators, drones, cameras, event gear, sound systems).
                      </li>
                    </ul>
                    <p className="text-[10.5px] text-emerald-300 pt-1">
                      Both engines calculate capacity independently, and their monthly revenue potential combines automatically in {displayCurrency}.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <h4 className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-2">
              <Clock size={16} className="text-blue-700" />
              <span>Service Delivery Capacity &amp; Resource Plan</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              Staff and Equipment operate as <strong className="text-stone-700">independent capacity engines</strong>. All monetary rates are entered and calculated in <strong className="text-stone-800">{displayCurrency} ({currentSymbol})</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 text-xs">
              <span className="text-[11px] font-semibold text-stone-600">Active Engines:</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${staffPlan.enabled ? 'bg-blue-100 text-blue-800' : 'bg-stone-200 text-stone-500'}`}>
                Staff {staffPlan.enabled ? '✓' : 'Off'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${equipmentPlan.enabled ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-500'}`}>
                Equipment {equipmentPlan.enabled ? '✓' : 'Off'}
              </span>
            </div>
          </div>
        </div>

        {/* Dual Independent Capacity Sections (Staff & Equipment) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ============================================================ */}
          {/* SECTION 1: STAFF & BILLABLE TEAM CAPACITY                   */}
          {/* ============================================================ */}
          <div className={`rounded-2xl p-4 border transition-all duration-200 space-y-3.5 ${
            staffPlan.enabled 
              ? 'bg-blue-50/40 border-blue-200 shadow-2xs' 
              : 'bg-stone-50/70 border-stone-200/80 opacity-75'
          }`}>
            {/* Staff Header with Toggle */}
            <div className="flex items-center justify-between border-b border-blue-200/50 pb-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateStaffPlan({ enabled: !staffPlan.enabled })}
                  className="flex items-center gap-1.5 text-xs font-bold text-stone-900 hover:text-blue-700 cursor-pointer"
                >
                  {staffPlan.enabled ? (
                    <CheckSquare size={16} className="text-blue-700 shrink-0" />
                  ) : (
                    <Square size={16} className="text-stone-400 shrink-0" />
                  )}
                  <Users size={15} className="text-blue-700" />
                  <span>1. Staff &amp; Billable Team</span>
                </button>
              </div>

              <div 
                className="relative inline-block"
                onMouseEnter={() => setHoveredGuide('guide-staff-card')}
                onMouseLeave={() => setHoveredGuide(null)}
              >
                <button
                  type="button"
                  className="text-stone-400 hover:text-blue-700 transition cursor-help flex items-center gap-1 text-[11px]"
                >
                  <Info size={13} />
                  <span className="underline decoration-dotted">Staff Info</span>
                </button>
                {/* Staff Floating Tooltip */}
                <div 
                  className={`absolute right-0 top-full mt-1 w-72 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-blue-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                    hoveredGuide === 'guide-staff-card' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
                  }`}
                >
                  <div className="font-bold text-blue-300 flex items-center gap-1">
                    <Users size={12} /> Staff Billable Labor Model
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed">
                    Calculates billable hours generated by human team members (consultants, developers, designers, technicians, mechanics). Revenue is determined by <strong>billable hours × hourly rate ({currentSymbol}/hr)</strong>.
                  </p>
                </div>
              </div>
            </div>

            {staffPlan.enabled ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Staff Field 1: Count */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-staff-count')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 select-none">
                        <span>Billable Staff Count</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-blue-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">people</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={staffPlan.resourceCount}
                      onChange={(e) => handleUpdateStaffPlan({ resourceCount: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-3 py-1.5 text-xs font-semibold border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-500">e.g. 2 full-time consultants</p>
                  </div>

                  {/* Staff Field 2: Monthly Hours */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-staff-hours')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 select-none">
                        <span>Monthly Hours (per Staff)</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-blue-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">hrs/person/mo</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={staffPlan.availableHoursPerStaff}
                      onChange={(e) => handleUpdateStaffPlan({ availableHoursPerStaff: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-3 py-1.5 text-xs font-semibold border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-500">e.g. 160 hrs (40 hrs/wk × 4)</p>
                  </div>

                  {/* Staff Field 3: Utilisation Rate */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-staff-util')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 select-none">
                        <span>Staff Utilisation Rate (%)</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-blue-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">efficiency %</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={staffPlan.targetUtilisationPercent}
                        onChange={(e) => handleUpdateStaffPlan({ targetUtilisationPercent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                        className="w-full px-3 pr-7 py-1.5 text-xs font-semibold border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
                      />
                      <span className="absolute right-2.5 top-1.5 text-xs text-stone-400 font-bold">%</span>
                    </div>
                    <p className="text-[10px] text-stone-500">e.g. 75% billable client work</p>
                  </div>

                  {/* Staff Field 4: Hourly Rate */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-staff-rate')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-blue-800 select-none">
                        <span>Benchmark Rate ({currentSymbol}/hr)</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-blue-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">{currentSymbol}/hr</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-stone-500 font-bold font-mono">{currentSymbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={staffPlan.hourlyRate}
                        onChange={(e) => handleUpdateStaffPlan({ hourlyRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="w-full pl-10 pr-12 py-1.5 text-xs font-semibold font-mono border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-hidden"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-stone-400 font-bold">/ hr</span>
                    </div>
                    {renderConversionHint(staffPlan.hourlyRate, displayCurrency)}
                  </div>
                </div>

                {/* Staff Subtotal Strip */}
                <div className="bg-white border border-blue-200/80 rounded-xl p-2.5 text-[11px] flex flex-wrap items-center justify-between gap-2 text-stone-700">
                  <div className="flex items-center gap-2">
                    <span>Avail: <strong>{capacityCalc.staff.totalHours} hrs/mo</strong></span>
                    <span className="text-stone-300">•</span>
                    <span>Billable: <strong className="text-blue-900">{capacityCalc.staff.effectiveHours} hrs/mo</strong></span>
                  </div>
                  <div className="font-bold text-blue-900 font-mono">
                    Staff Revenue: <span>{currentSymbol} {capacityCalc.staff.monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-stone-400">
                Staff capacity engine disabled. Click the checkbox to activate staff &amp; billable labor modeling.
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* SECTION 2: EQUIPMENT & RENTAL FLEET CAPACITY                 */}
          {/* ============================================================ */}
          <div className={`rounded-2xl p-4 border transition-all duration-200 space-y-3.5 ${
            equipmentPlan.enabled 
              ? 'bg-amber-50/40 border-amber-200 shadow-2xs' 
              : 'bg-stone-50/70 border-stone-200/80 opacity-75'
          }`}>
            {/* Equipment Header with Toggle */}
            <div className="flex items-center justify-between border-b border-amber-200/50 pb-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateEquipmentPlan({ enabled: !equipmentPlan.enabled })}
                  className="flex items-center gap-1.5 text-xs font-bold text-stone-900 hover:text-amber-800 cursor-pointer"
                >
                  {equipmentPlan.enabled ? (
                    <CheckSquare size={16} className="text-amber-700 shrink-0" />
                  ) : (
                    <Square size={16} className="text-stone-400 shrink-0" />
                  )}
                  <Wrench size={15} className="text-amber-700" />
                  <span>2. Equipment &amp; Rental Fleet Assets</span>
                </button>
              </div>

              <div 
                className="relative inline-block"
                onMouseEnter={() => setHoveredGuide('guide-equip-card')}
                onMouseLeave={() => setHoveredGuide(null)}
              >
                <button
                  type="button"
                  className="text-stone-400 hover:text-amber-800 transition cursor-help flex items-center gap-1 text-[11px]"
                >
                  <Info size={13} />
                  <span className="underline decoration-dotted">Equipment Info</span>
                </button>
                {/* Equipment Floating Tooltip */}
                <div 
                  className={`absolute right-0 top-full mt-1 w-72 bg-stone-950/95 text-white rounded-xl p-3 shadow-2xl border border-amber-500/40 text-xs space-y-1.5 z-50 backdrop-blur-md pointer-events-none transition-all duration-200 ${
                    hoveredGuide === 'guide-equip-card' ? 'opacity-100 translate-y-0 visible scale-100' : 'opacity-0 translate-y-1 invisible scale-98'
                  }`}
                >
                  <div className="font-bold text-amber-300 flex items-center gap-1">
                    <Wrench size={12} /> Equipment Rental / Asset Hire Model
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed">
                    Calculates rental days generated by physical inventory or machinery assets (vehicles, cameras, plant equipment, event booths, tools). Revenue is determined by <strong>booked rental days × daily rental rate ({currentSymbol}/day)</strong>.
                  </p>
                </div>
              </div>
            </div>

            {equipmentPlan.enabled ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Equipment Field 1: Count */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-equip-count')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-amber-800 select-none">
                        <span>Active Equipment Units</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-amber-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">units</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={equipmentPlan.resourceCount}
                      onChange={(e) => handleUpdateEquipmentPlan({ resourceCount: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-3 py-1.5 text-xs font-semibold border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-500">e.g. 12 rental fleet items</p>
                  </div>

                  {/* Equipment Field 2: Rental Days per Unit */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-equip-days')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-amber-800 select-none">
                        <span>Monthly Rental Days (per Unit)</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-amber-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">days/unit/mo</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={equipmentPlan.availableDaysPerUnit}
                      onChange={(e) => handleUpdateEquipmentPlan({ availableDaysPerUnit: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) })}
                      className="w-full px-3 py-1.5 text-xs font-semibold border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-500">e.g. 25 days/mo (max 31)</p>
                  </div>

                  {/* Equipment Field 3: Utilisation Rate */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-equip-util')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-amber-800 select-none">
                        <span>Equipment Occupancy Rate (%)</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-amber-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">occupancy %</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={equipmentPlan.targetUtilisationPercent}
                        onChange={(e) => handleUpdateEquipmentPlan({ targetUtilisationPercent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                        className="w-full px-3 pr-7 py-1.5 text-xs font-semibold border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                      />
                      <span className="absolute right-2.5 top-1.5 text-xs text-stone-400 font-bold">%</span>
                    </div>
                    <p className="text-[10px] text-stone-500">e.g. 50% fleet booked/rented</p>
                  </div>

                  {/* Equipment Field 4: Daily Rental Rate */}
                  <div 
                    className="space-y-1 relative group/field"
                    onMouseEnter={() => setHoveredGuide('guide-equip-rate')}
                    onMouseLeave={() => setHoveredGuide(null)}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1 cursor-help hover:text-amber-800 select-none">
                        <span>Benchmark Daily Rate ({currentSymbol}/day)</span>
                        <Info size={11} className="text-stone-400 group-hover/field:text-amber-600" />
                      </label>
                      <span className="text-[10px] text-stone-400">{currentSymbol}/day</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-stone-500 font-bold font-mono">{currentSymbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={equipmentPlan.dailyRate}
                        onChange={(e) => handleUpdateEquipmentPlan({ dailyRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="w-full pl-10 pr-12 py-1.5 text-xs font-semibold font-mono border border-stone-200 bg-white rounded-lg focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-stone-400 font-bold">/ day</span>
                    </div>
                    {renderConversionHint(equipmentPlan.dailyRate, displayCurrency)}
                  </div>
                </div>

                {/* Equipment Subtotal Strip */}
                <div className="bg-white border border-amber-200/80 rounded-xl p-2.5 text-[11px] flex flex-wrap items-center justify-between gap-2 text-stone-700">
                  <div className="flex items-center gap-2">
                    <span>Avail: <strong>{capacityCalc.equipment.totalDays} unit-days/mo</strong></span>
                    <span className="text-stone-300">•</span>
                    <span>Booked: <strong className="text-amber-900">{capacityCalc.equipment.effectiveDays} days/mo</strong></span>
                  </div>
                  <div className="font-bold text-amber-900 font-mono">
                    Equipment Revenue: <span>{currentSymbol} {capacityCalc.equipment.monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
                  </div>
                </div>

                {/* Fleet Equipment Acquisition & Landed Import Duty Provisioning */}
                <div className="border border-amber-200/90 rounded-xl bg-amber-50/50 p-3 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-lg bg-amber-200/70 text-amber-900">
                        <Ship size={14} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-stone-900">
                          Fleet Import Shipping &amp; Customs Duties (Saint Lucia ASYCUDA Tariffs)
                        </span>
                        <p className="text-[10.5px] text-stone-600">
                          Provision ocean/air shipping freight, customs duties, CSC (6%), HCSL (2.5%), ENV, and VAT for {equipmentPlan.resourceCount} units.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFleetImportCalculator(!showFleetImportCalculator)}
                      className="text-xs font-bold text-amber-900 hover:text-amber-950 px-3 py-1 rounded-lg border border-amber-300 bg-white hover:bg-amber-100/80 transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
                    >
                      {showFleetImportCalculator ? 'Hide Duty Provision' : (equipmentPlan.importDetails?.isImported ? 'Adjust Landed Cost' : '+ Provision Import & Shipping')}
                    </button>
                  </div>

                  {equipmentPlan.importDetails?.isImported && !showFleetImportCalculator && (
                    <div className="bg-white border border-amber-200 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-800">
                      <span className="font-semibold flex items-center gap-1 text-emerald-800">
                        <Check size={13} className="text-emerald-700" /> Landed Capital Cost ({equipmentPlan.resourceCount} Units • {equipmentPlan.importDetails.category?.toUpperCase()}):
                      </span>
                      <div className="flex items-center gap-3 text-[11px] font-medium font-mono">
                        <span>FOB: <strong>{currentSymbol} {equipmentPlan.importDetails.fobCost?.toLocaleString()}</strong></span>
                        <span>•</span>
                        <span>Freight/Ins: <strong>{currentSymbol} {((equipmentPlan.importDetails.shippingFreight || 0) + (equipmentPlan.importDetails.insurance || 0)).toLocaleString()}</strong></span>
                        <span>•</span>
                        <span>Customs Taxes: <strong>{currentSymbol} {equipmentPlan.importDetails.totalDutiesAndTaxes?.toLocaleString()}</strong></span>
                        <span>•</span>
                        <span>Total Landed: <strong className="text-emerald-800 font-bold">{currentSymbol} {equipmentPlan.importDetails.totalLandedCost?.toLocaleString()}</strong></span>
                      </div>
                    </div>
                  )}

                  {showFleetImportCalculator && (
                    <div className="pt-2">
                      <ImportLandedCostCalculator
                        initialUnitsCount={equipmentPlan.resourceCount}
                        initialFobUnitCost={equipmentPlan.unitPurchasePrice || 500}
                        initialCategory={equipmentPlan.importCategory || 'electronics'}
                        initialImportDetails={equipmentPlan.importDetails}
                        currency={displayCurrency}
                        isCompact
                        onApplyLandedCost={handleSyncFleetToCostLedger}
                        onClose={() => setShowFleetImportCalculator(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-stone-400">
                Equipment capacity engine disabled. Click the checkbox to activate equipment &amp; fleet rental modeling.
              </div>
            )}
          </div>
        </div>

        {/* Combined Dual-Capacity Summary Banner */}
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-emerald-50 border border-blue-200/80 rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-700 shrink-0" />
              <span className="font-bold text-stone-900 text-sm">
                Total Combined Operational Capacity Potential:
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-emerald-800 bg-white/80 px-3 py-1 rounded-xl border border-emerald-300/60 shadow-2xs">
              <span className="text-stone-500 font-normal">Combined Max Revenue:</span>
              <span className="text-sm font-extrabold text-emerald-700 font-mono">
                {currentSymbol} {capacityCalc.totalMonthlyRevenuePotential.toLocaleString(undefined, { maximumFractionDigits: 0 })} / mo
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold pt-1.5 border-t border-blue-200/60 text-stone-700">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
              <span>
                Staff Labor Capacity: <strong>{staffPlan.enabled ? `${capacityCalc.staff.effectiveHours} billable hrs/mo (${currentSymbol} ${capacityCalc.staff.monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })})` : 'Disabled'}</strong>
              </span>
            </div>
            <span className="text-stone-300 hidden sm:inline">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              <span>
                Equipment Rental Capacity: <strong>{equipmentPlan.enabled ? `${capacityCalc.equipment.effectiveDays} booked days/mo (${currentSymbol} ${capacityCalc.equipment.monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })})` : 'Disabled'}</strong>
              </span>
            </div>
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
            onClick={() => {
              setNewServiceCurrency(displayCurrency);
              setShowAddService(!showAddService);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Service</span>
          </button>
        </div>

        {/* Add Service Inline Form */}
        {showAddService && (
          <form onSubmit={handleAddService} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-stone-900">Add New Service Offering</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setNewServiceCurrency('USD')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    newServiceCurrency === 'USD' ? 'bg-blue-600 text-white' : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  US$ Rate
                </button>
                <button
                  type="button"
                  onClick={() => setNewServiceCurrency('XCD')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    newServiceCurrency === 'XCD' ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  EC$ Rate
                </button>
              </div>
            </div>

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
                  onChange={(e) => {
                    const nextModel = e.target.value as ServiceRevenueModel;
                    setNewRevenueModel(nextModel);
                    setNewUnitLabel(getDefaultServiceUnitLabel(nextModel));
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="project">Fixed Project Fee</option>
                  <option value="hourly">Hourly Billing</option>
                  <option value="retainer">Monthly Retainer</option>
                  <option value="subscription">Recurring Subscription</option>
                  <option value="rental">Equipment / Space Rental</option>
                  <option value="commission">Commission Fee</option>
                  <option value="event">Per Event</option>
                  <option value="package">Package / Bundle</option>
                  <option value="per_participant">Per Participant</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Billing Rate ({getCurrencySymbol(newServiceCurrency)})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-stone-400 font-bold font-mono">
                    {getCurrencySymbol(newServiceCurrency)}
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    className="w-full pl-10 pr-3 py-1.5 text-xs font-bold font-mono border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                {renderConversionHint(newRate, newServiceCurrency)}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Service Unit Label</label>
                <input
                  type="text"
                  value={newUnitLabel}
                  onChange={(e) => setNewUnitLabel(e.target.value)}
                  placeholder={getDefaultServiceUnitLabel(newRevenueModel)}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                />
                <div className="text-[10px] text-stone-400">Examples: bookings, sessions, participants, units, events.</div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Initial Monthly Volume ({newUnitLabel.trim() || getDefaultServiceUnitLabel(newRevenueModel)})
                </label>
                <input
                  type="number"
                  min="0"
                  value={newVolume}
                  onChange={(e) => setNewVolume(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">
                  Direct Cost per Unit ({getCurrencySymbol(newServiceCurrency)})
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-stone-400 font-bold font-mono">
                    {getCurrencySymbol(newServiceCurrency)}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newDirectCost}
                    onChange={(e) => setNewDirectCost(e.target.value)}
                    className="w-full pl-10 pr-3 py-1.5 text-xs font-bold font-mono border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                {renderConversionHint(newDirectCost, newServiceCurrency)}
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
                    className="w-full px-3 pr-6 py-1.5 text-xs font-mono border border-stone-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
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
            const servCurrency = service.currency || displayCurrency;
            const normalizedRate = normalizeServiceRate(service);
            const monthlyRev = normalizedRate * Math.max(0, service.expectedVolume ?? 0);
            const isDifferentCurrency = servCurrency !== displayCurrency;

            return (
              <div
                key={service.id}
                className="bg-stone-50/70 border border-stone-200/90 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-stone-900">{service.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-stone-200/80 text-stone-700">
                      {getModelLabel(service.revenueModel)}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                      <span>{currentSymbol} {normalizedRate.toFixed(2)}</span>
                      {isDifferentCurrency && (
                        <span className="text-[9px] text-emerald-700 font-normal">
                          (native: {getCurrencySymbol(servCurrency)} {service.rate.toFixed(2)})
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateServiceField(
                          service.id,
                          'currency',
                          servCurrency === 'USD' ? 'XCD' : 'USD'
                        )
                      }
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-200 hover:bg-stone-300 text-stone-700 transition-colors cursor-pointer"
                      title="Toggle service native entered currency"
                    >
                      Set as {servCurrency === 'USD' ? 'EC$' : 'US$'}
                    </button>
                  </div>
                  <div className="text-[11px] text-stone-500 flex flex-wrap items-center gap-3">
                    <span>Rate: <strong className="font-mono">{currentSymbol} {normalizedRate.toFixed(2)}</strong></span>
                    <span>•</span>
                    <span>Volume: <strong>{service.expectedVolume ?? 0} {getUnitName(service.revenueModel, service.unitLabel)}/mo</strong></span>
                    <span>•</span>
                    <span>Monthly Revenue: <strong className="font-mono text-emerald-800">{currentSymbol} {monthlyRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <div className="flex items-center gap-1 text-xs">
                    <label className="text-[10px] text-stone-500">Unit:</label>
                    <input
                      type="text"
                      value={service.unitLabel || getServiceOfferingUnitLabel(service)}
                      onChange={(e) => handleUpdateServiceField(service.id, 'unitLabel', e.target.value)}
                      className="w-24 px-2 py-1 text-xs border border-stone-200 bg-white rounded-lg"
                      title="Label used throughout forecasts and exported business plans"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <label className="text-[10px] text-stone-500">Vol/mo:</label>
                    <input
                      type="number"
                      min="0"
                      value={service.expectedVolume ?? 0}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        handleUpdateServiceField(service.id, 'expectedVolume', Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                      }}
                      className="w-18 px-2 py-1 text-xs font-mono border border-stone-200 bg-white rounded-lg"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <label className="text-[10px] text-stone-500">
                      Rate ({getCurrencySymbol(servCurrency)}):
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={service.rate}
                      onChange={(e) =>
                        handleUpdateServiceField(service.id, 'rate', parseFloat(e.target.value) || 0)
                      }
                      className="w-20 px-2 py-1 text-xs font-bold font-mono border border-stone-200 bg-white rounded-lg"
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
          displayCurrency={displayCurrency}
          exchangeRate={exchangeRate}
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
          displayCurrency={displayCurrency}
          exchangeRate={exchangeRate}
          onChangeCurrency={handleCurrencyChange}
          onUpdateExchangeRate={handleRateChange}
          onAddItem={() => setIsAddingItem(true)}
          onEditItem={(item) => setEditingItem(item)}
          onDeleteItem={handleDeleteCostItem}
          title="Service Operations Cost Structure &amp; Equipment"
          subtitle="Manage equipment assets (including rental equipment), direct delivery costs, software, and overheads"
        />
      )}
    </div>
  );
};