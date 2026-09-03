import React, { useState } from 'react';
import { ProjectTask } from '../../types';
import { calculateCriticalPath, computeTaskStatus, getStatusBadgeConfig, parseLocalDate } from '../../utils/plannerUtils';
import { Calendar, Layers, Link2, Zap, ArrowRight, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

interface Props {
  allTasks: ProjectTask[];
  onSelectTask: (task: ProjectTask) => void;
}

export const DependencyGraphView: React.FC<Props> = ({ allTasks, onSelectTask }) => {
  const [viewMode, setViewMode] = useState<'gantt' | 'graph'>('graph');
  const criticalSet = calculateCriticalPath(allTasks);

  if (allTasks.length === 0) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center">
        <Layers className="mx-auto text-stone-300 text-4xl mb-3" />
        <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">No Tasks to Visualize</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs space-y-6">
      
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-stone-100 pb-4">
        <div>
          <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
            <Link2 size={16} className="text-indigo-600" /> Task Dependency & Timeline Architecture
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Visualize task prerequisite relationships, downstream critical paths, and schedule timelines.
          </p>
        </div>

        <div className="flex bg-stone-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('graph')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'graph' ? 'bg-white text-indigo-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Dependency Node Graph
          </button>
          <button
            onClick={() => setViewMode('gantt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'gantt' ? 'bg-white text-indigo-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Gantt Timeline
          </button>
        </div>
      </div>

      {/* View 1: Dependency Node Graph */}
      {viewMode === 'graph' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50 p-3 rounded-xl border border-stone-150">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Active / Pending
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Blocked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span> Critical Path
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTasks.map(task => {
              const status = computeTaskStatus(task, allTasks);
              const isCritical = criticalSet.has(task.id);
              const prereqs = (task.dependencies || []).map(id => allTasks.find(t => t.id === id)).filter(Boolean);
              const dependents = allTasks.filter(t => t.dependencies?.includes(task.id));

              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md relative bg-white ${
                    isCritical
                      ? 'border-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                      : status === 'blocked'
                      ? 'border-amber-200 bg-amber-50/20'
                      : status === 'overdue'
                      ? 'border-rose-200 bg-rose-50/20'
                      : 'border-stone-200'
                  }`}
                >
                  {isCritical && (
                    <span className="absolute -top-2.5 right-3 bg-purple-600 text-white text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                      <Zap size={10} /> Critical Path
                    </span>
                  )}

                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className={`text-xs font-bold ${task.completed ? 'text-stone-400 line-through' : 'text-stone-900'}`}>
                      {task.text}
                    </h4>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase border shrink-0 ${getStatusBadgeConfig(status).colorClass}`}>
                      {getStatusBadgeConfig(status).label}
                    </span>
                  </div>

                  {/* Prerequisites */}
                  {prereqs.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-stone-100 text-[10px]">
                      <span className="font-bold text-stone-400 uppercase tracking-wider block mb-1">Prerequisites:</span>
                      <div className="flex flex-wrap gap-1">
                        {prereqs.map(p => (
                          <span key={p!.id} className={`px-1.5 py-0.5 rounded font-semibold border ${p!.completed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            {p!.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Downstream Dependents */}
                  {dependents.length > 0 && (
                    <div className="mt-2 text-[10px]">
                      <span className="font-bold text-stone-400 uppercase tracking-wider block mb-1">Blocks Downstream:</span>
                      <div className="flex flex-wrap gap-1">
                        {dependents.map(d => (
                          <span key={d.id} className="px-1.5 py-0.5 bg-stone-100 text-stone-700 rounded font-semibold border border-stone-200">
                            {d.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View 2: Gantt Timeline */}
      {viewMode === 'gantt' && (
        <div className="overflow-x-auto custom-scrollbar border border-stone-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-stone-900 text-white text-[10px] font-bold uppercase tracking-wider border-b border-stone-800">
                <th className="p-3 w-1/3">Task Name</th>
                <th className="p-3">Status</th>
                <th className="p-3">Start Date</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Prerequisites</th>
                <th className="p-3">Timeline Visual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allTasks.map(task => {
                const status = computeTaskStatus(task, allTasks);
                const prereqNames = (task.dependencies || [])
                  .map(id => allTasks.find(t => t.id === id)?.text)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <tr
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="hover:bg-stone-50 cursor-pointer transition"
                  >
                    <td className="p-3 font-bold text-stone-800">{task.text}</td>
                    <td className="p-3">
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase border ${getStatusBadgeConfig(status).colorClass}`}>
                        {getStatusBadgeConfig(status).label}
                      </span>
                    </td>
                    <td className="p-3 text-stone-600 font-mono text-[11px]">{task.startDate || '—'}</td>
                    <td className="p-3 text-stone-600 font-mono text-[11px]">{task.dueDate || '—'}</td>
                    <td className="p-3 text-stone-500 text-[10px] truncate max-w-[150px]">{prereqNames || 'None'}</td>
                    <td className="p-3">
                      <div className="w-full bg-stone-100 rounded-full h-3 overflow-hidden relative border border-stone-200">
                        <div
                          className={`h-full rounded-full transition-all ${
                            task.completed
                              ? 'bg-emerald-500 w-full'
                              : status === 'overdue'
                              ? 'bg-rose-500 w-3/4'
                              : status === 'blocked'
                              ? 'bg-amber-500 w-1/4'
                              : 'bg-indigo-600 w-1/2'
                          }`}
                        ></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
