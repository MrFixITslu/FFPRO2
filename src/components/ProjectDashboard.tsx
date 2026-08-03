import React, { useMemo } from 'react';
import { Wallet, CheckCircle2, Clock, Activity, Users } from 'lucide-react';
import { BudgetEvent, ProjectMember } from '../types';

interface Props {
  event: BudgetEvent;
  members?: ProjectMember[];
}

function countTasks(tasks: BudgetEvent['tasks']): { total: number; done: number } {
  let total = 0;
  let done = 0;
  const walk = (list: BudgetEvent['tasks']) => {
    for (const t of list || []) {
      total += 1;
      if (t.completed) done += 1;
      if (t.subTasks?.length) walk(t.subTasks);
    }
  };
  walk(tasks);
  return { total, done };
}

const ProjectDashboard: React.FC<Props> = ({ event, members }) => {
  const stats = useMemo(() => {
    const items = event.items || [];
    const spent = items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
    const income = items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
    const budget = event.projectedBudget || 0;
    const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null;

    const { total: totalTasks, done: doneTasks } = countTasks(event.tasks);
    const taskPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    let daysLabel: string | null = null;
    const targetDateStr = event.eventType === 'trip' ? event.tripDetails?.startDate : event.date;
    if (targetDateStr) {
      const target = new Date(targetDateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
      if (diffDays > 0) daysLabel = `${diffDays} day${diffDays === 1 ? '' : 's'} away`;
      else if (diffDays === 0) daysLabel = 'Today';
      else daysLabel = `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`;
    }

    const recentLogs = [...(event.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

    return { spent, income, budget, budgetPct, totalTasks, doneTasks, taskPct, daysLabel, recentLogs };
  }, [event]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-indigo-500" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Spent</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-slate-800 tabular-nums">${stats.spent.toLocaleString()}</p>
          {stats.budget > 0 && (
            <>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full ${stats.budgetPct! >= 100 ? 'bg-red-500' : stats.budgetPct! >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${stats.budgetPct}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">of ${stats.budget.toLocaleString()} budget</p>
            </>
          )}
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tasks</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-slate-800 tabular-nums">{stats.doneTasks}/{stats.totalTasks}</p>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.taskPct}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{stats.taskPct}% complete</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Timeline</span>
          </div>
          <p className="text-base sm:text-lg font-bold text-slate-800">{stats.daysLabel || '—'}</p>
          <p className="text-[10px] text-slate-400 mt-1">{event.status}</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Collaborators</span>
          </div>
          {members && members.length > 0 ? (
            <div className="flex -space-x-2 mt-1">
              {members.slice(0, 6).map(m => (
                <div key={m.userId} title={m.displayName || m.email} className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-600 uppercase">
                  {(m.displayName || m.username || m.email)[0]}
                </div>
              ))}
              {members.length > 6 && (
                <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-slate-500">+{members.length - 6}</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400 mt-1">Not shared yet</p>
          )}
        </div>
      </div>

      {stats.recentLogs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recent Activity</span>
          </div>
          <div className="space-y-2.5">
            {stats.recentLogs.map(log => (
              <div key={log.id} className="flex items-start justify-between gap-3 text-sm min-w-0">
                <span className="text-slate-700 min-w-0 break-words flex-1">
                  <span className="font-semibold text-slate-900">{log.username}</span> {log.action.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{new Date(log.timestamp).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDashboard;
