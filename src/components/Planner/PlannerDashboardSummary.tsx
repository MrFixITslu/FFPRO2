import React from 'react';
import { TaskSummaryStats } from '../../utils/plannerUtils';
import { 
  CheckCircle2, Clock, AlertTriangle, ShieldAlert, Zap, 
  ListTodo, Calendar, Layers
} from 'lucide-react';

interface Props {
  stats: TaskSummaryStats;
  activeFilter: string;
  onSelectFilter: (filter: string) => void;
}

export const PlannerDashboardSummary: React.FC<Props> = ({ stats, activeFilter, onSelectFilter }) => {
  const widgets = [
    {
      id: 'all',
      label: 'Total Tasks',
      value: stats.total,
      icon: ListTodo,
      bg: 'bg-stone-900',
      textColor: 'text-white',
      badgeBg: 'bg-white/10 text-stone-300',
    },
    {
      id: 'completed',
      label: 'Completed',
      value: stats.completed,
      icon: CheckCircle2,
      bg: 'bg-emerald-50 border-emerald-200',
      textColor: 'text-emerald-900',
      badgeBg: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      value: stats.inProgress,
      icon: Clock,
      bg: 'bg-indigo-50 border-indigo-200',
      textColor: 'text-indigo-900',
      badgeBg: 'bg-indigo-100 text-indigo-800',
    },
    {
      id: 'due_today',
      label: 'Due Today',
      value: stats.dueToday,
      icon: Calendar,
      bg: 'bg-amber-50 border-amber-200',
      textColor: 'text-amber-900',
      badgeBg: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'due_week',
      label: 'Due This Week',
      value: stats.dueThisWeek,
      icon: Calendar,
      bg: 'bg-sky-50 border-sky-200',
      textColor: 'text-sky-900',
      badgeBg: 'bg-sky-100 text-sky-800',
    },
    {
      id: 'overdue',
      label: 'Overdue',
      value: stats.overdue,
      icon: AlertTriangle,
      bg: 'bg-rose-50 border-rose-200',
      textColor: 'text-rose-900',
      badgeBg: 'bg-rose-100 text-rose-800',
      highlight: stats.overdue > 0,
    },
    {
      id: 'blocked',
      label: 'Blocked',
      value: stats.blocked,
      icon: ShieldAlert,
      bg: 'bg-orange-50 border-orange-200',
      textColor: 'text-orange-900',
      badgeBg: 'bg-orange-100 text-orange-800',
    },
    {
      id: 'critical',
      label: 'Critical Path',
      value: stats.critical,
      icon: Zap,
      bg: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-900',
      badgeBg: 'bg-purple-100 text-purple-800',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
      {widgets.map(w => {
        const Icon = w.icon;
        const isSelected = activeFilter === w.id;

        return (
          <button
            key={w.id}
            onClick={() => onSelectFilter(w.id)}
            className={`p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between shadow-xs relative overflow-hidden group ${
              w.bg
            } ${
              isSelected ? 'ring-2 ring-indigo-600 scale-[1.02] shadow-sm' : 'hover:border-stone-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className={`p-1.5 rounded-lg ${w.badgeBg}`}>
                <Icon size={14} />
              </span>
              {w.highlight && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              )}
            </div>
            <div>
              <span className={`text-xl font-extrabold tracking-tight block ${w.textColor}`}>
                {w.value}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider block mt-0.5 opacity-80 ${w.textColor}`}>
                {w.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
