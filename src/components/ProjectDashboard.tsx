import React, { useMemo } from 'react';
import { Wallet, CheckCircle2, Clock, Activity, Users, ArrowUpRight, ArrowDownRight, FileText, Tag, Shield, RefreshCw, FolderCheck, RotateCcw, Award, Archive, XCircle } from 'lucide-react';
import { BudgetEvent, ProjectMember } from '../types';
import { ProjectGrantMatcher } from './ProjectGrantMatcher';

interface Props {
  event: BudgetEvent;
  members?: ProjectMember[];
  onViewLogs?: () => void;
  onCloseProject?: () => void;
  onReopenProject?: () => void;
  onNavigateToFunding?: () => void;
  canEdit?: boolean;
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

const ProjectDashboard: React.FC<Props> = ({ event, members, onViewLogs, onCloseProject, onReopenProject, onNavigateToFunding, canEdit = true }) => {
  const isClosed = event.status === 'closed';

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
      {/* Project Status / Closeout Banner */}
      {isClosed && (
        <div className="bg-stone-900 text-white rounded-xl p-4 sm:p-5 border border-stone-800 shadow-sm relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center shrink-0 text-amber-400">
                <FolderCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-stone-800 text-stone-300 border border-stone-700">
                    Project Closed
                  </span>
                  {event.outcome && (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${
                      event.outcome === 'success' ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' :
                      event.outcome === 'cancelled' ? 'bg-amber-950/80 text-amber-300 border-amber-800' :
                      event.outcome === 'failed' ? 'bg-rose-950/80 text-rose-300 border-rose-800' :
                      'bg-indigo-950/80 text-indigo-300 border-indigo-800'
                    }`}>
                      Outcome: {event.outcome}
                    </span>
                  )}
                  {event.closedAt && (
                    <span className="text-[11px] text-stone-400 font-medium">
                      on {new Date(event.closedAt).toLocaleDateString()} {event.closedBy ? `by ${event.closedBy}` : ''}
                    </span>
                  )}
                </div>

                {event.closedReason && (
                  <p className="text-xs text-stone-300 mt-2 font-medium">
                    <span className="text-stone-400 font-bold">Reason:</span> {event.closedReason}
                  </p>
                )}

                {event.lessonsLearnt && (
                  <div className="mt-2 text-xs text-stone-300 bg-stone-800/80 p-2.5 rounded-lg border border-stone-700/60 max-w-2xl">
                    <span className="font-bold text-stone-400 text-[10px] uppercase tracking-wider block mb-0.5">Lessons Learned / Retrospective:</span>
                    <p className="leading-relaxed whitespace-pre-wrap">{event.lessonsLearnt}</p>
                  </div>
                )}
              </div>
            </div>

            {canEdit && onReopenProject && (
              <button
                onClick={onReopenProject}
                className="self-start sm:self-center px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-lg border border-stone-700 text-xs font-bold transition flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw size={13} />
                Reopen Project
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-indigo-500" />
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Spent</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-stone-800 tabular-nums">${stats.spent.toLocaleString()}</p>
          {stats.budget > 0 && (
            <>
              <div className="w-full h-1.5 bg-stone-100 rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full ${stats.budgetPct! >= 100 ? 'bg-red-500' : stats.budgetPct! >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${stats.budgetPct}%` }} />
              </div>
              <p className="text-[10px] text-stone-400 mt-1">of ${stats.budget.toLocaleString()} budget</p>
            </>
          )}
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Tasks</span>
          </div>
          <p className="text-lg sm:text-xl font-bold text-stone-800 tabular-nums">{stats.doneTasks}/{stats.totalTasks}</p>
          <div className="w-full h-1.5 bg-stone-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.taskPct}%` }} />
          </div>
          <p className="text-[10px] text-stone-400 mt-1">{stats.taskPct}% complete</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Status & Timeline</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider border ${
                isClosed ? 'bg-stone-100 text-stone-600 border-stone-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {isClosed ? 'Closed' : 'Active'}
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-stone-800">{stats.daysLabel || (isClosed ? 'Concluded' : 'In Progress')}</p>
          </div>
          {canEdit && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              {isClosed ? (
                onReopenProject && (
                  <button
                    onClick={onReopenProject}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition"
                  >
                    <RotateCcw size={12} />
                    Reopen Project
                  </button>
                )
              ) : (
                onCloseProject && (
                  <button
                    onClick={onCloseProject}
                    className="text-[11px] font-bold text-stone-500 hover:text-stone-800 flex items-center gap-1 transition"
                  >
                    <FolderCheck size={12} />
                    Close Project
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-stone-500" />
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Collaborators</span>
          </div>
          {members && members.length > 0 ? (
            <div className="flex -space-x-2 mt-1">
              {members.slice(0, 6).map(m => (
                <div key={m.userId} title={m.displayName || m.email} className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-600 uppercase">
                  {(m.displayName || m.username || m.email)[0]}
                </div>
              ))}
              {members.length > 6 && (
                <div className="w-8 h-8 rounded-full bg-stone-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-stone-500">+{members.length - 6}</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-stone-400 mt-1">Not shared yet</p>
          )}
        </div>
      </div>

      {/* AI Grant & Funding Matches (Active & Non-Expired Grants Only) */}
      <ProjectGrantMatcher event={event} onNavigateToFunding={onNavigateToFunding} />

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Recent Activity & Logs</span>
            {(event.logs || []).length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-50 text-indigo-700">
                {(event.logs || []).length} total
              </span>
            )}
          </div>
          {onViewLogs && (
            <button
              onClick={onViewLogs}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1"
            >
              View & Manage All Logs <span aria-hidden="true">&rarr;</span>
            </button>
          )}
        </div>
        {stats.recentLogs.length > 0 ? (
          <div className="space-y-2.5">
            {stats.recentLogs.map(log => {
              const text = ((log.action || '') + ' ' + (log.details || '')).toLowerCase();
              const isIncome = log.type === 'transaction' && (text.includes('income') || text.includes('inflow') || text.includes('received') || text.includes('+') || text.includes('deposit'));
              const isExpense = log.type === 'transaction' && !isIncome;

              let iconBg = 'bg-stone-600';
              let iconNode = <Shield size={10} className="text-white" />;

              if (log.type === 'transaction') {
                if (isIncome) {
                  iconBg = 'bg-emerald-600';
                  iconNode = <ArrowUpRight size={11} className="text-white stroke-[3]" />;
                } else {
                  iconBg = 'bg-rose-600';
                  iconNode = <ArrowDownRight size={11} className="text-white stroke-[3]" />;
                }
              } else if (log.type === 'task') {
                iconBg = 'bg-violet-600';
                iconNode = <CheckCircle2 size={10} className="text-white" />;
              } else if (log.type === 'file') {
                iconBg = 'bg-stone-800';
                iconNode = <FileText size={10} className="text-white" />;
              } else if (log.type === 'team') {
                iconBg = 'bg-purple-600';
                iconNode = <Users size={10} className="text-white" />;
              } else if (log.type === 'contact') {
                iconBg = 'bg-sky-600';
                iconNode = <Tag size={10} className="text-white" />;
              } else if (log.type === 'note') {
                iconBg = 'bg-teal-600';
                iconNode = <FileText size={10} className="text-white" />;
              }

              return (
                <div 
                  key={log.id} 
                  onClick={onViewLogs}
                  className={`flex items-start justify-between gap-3 text-sm min-w-0 p-2 rounded-xl transition ${onViewLogs ? 'cursor-pointer hover:bg-stone-50' : ''}`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${iconBg}`}>
                      {iconNode}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-stone-800 text-xs sm:text-sm font-medium leading-snug break-words">
                        <span className="font-bold text-stone-900">{log.username}</span> {log.action.replace(/_/g, ' ')}
                      </p>
                      {log.details && (
                        <p className="text-[11px] text-stone-500 mt-0.5 truncate">{log.details}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-stone-400 whitespace-nowrap shrink-0 pt-0.5">{new Date(log.timestamp).toLocaleDateString()}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-stone-400 text-xs">
            <p>No activity logs recorded yet.</p>
            {onViewLogs && (
              <button 
                onClick={onViewLogs}
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
              >
                + Record first log entry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDashboard;
