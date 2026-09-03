import React, { useState } from 'react';
import { FolderCheck, X, CheckCircle2, AlertTriangle, Archive, XCircle, CheckSquare } from 'lucide-react';
import { BudgetEvent } from '../types';

interface Props {
  event: BudgetEvent;
  onClose: () => void;
  onConfirmClose: (closeData: {
    outcome: 'success' | 'failed' | 'cancelled' | 'neutral';
    lessonsLearnt?: string;
    closedReason?: string;
    completeRemainingTasks: boolean;
  }) => void;
}

export const CloseProjectModal: React.FC<Props> = ({ event, onClose, onConfirmClose }) => {
  const [outcome, setOutcome] = useState<'success' | 'failed' | 'cancelled' | 'neutral'>('success');
  const [closedReason, setClosedReason] = useState('');
  const [lessonsLearnt, setLessonsLearnt] = useState(event.lessonsLearnt || '');
  const [completeRemainingTasks, setCompleteRemainingTasks] = useState(false);

  const pendingTasksCount = (event.tasks || []).filter(t => !t.completed).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmClose({
      outcome,
      closedReason: closedReason.trim() || undefined,
      lessonsLearnt: lessonsLearnt.trim() || undefined,
      completeRemainingTasks,
    });
  };

  const outcomeOptions: {
    key: 'success' | 'neutral' | 'cancelled' | 'failed';
    label: string;
    desc: string;
    icon: React.ReactNode;
    colorClasses: string;
  }[] = [
    {
      key: 'success',
      label: 'Success / Goals Met',
      desc: 'All key deliverables achieved and objectives fulfilled.',
      icon: <CheckCircle2 size={16} className="text-emerald-500" />,
      colorClasses: 'border-emerald-200 bg-emerald-50/50 text-emerald-900 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:ring-2 peer-checked:ring-emerald-500/20',
    },
    {
      key: 'neutral',
      label: 'Wrapped Up',
      desc: 'Finished work or closed phase without formal outcome.',
      icon: <FolderCheck size={16} className="text-indigo-500" />,
      colorClasses: 'border-indigo-200 bg-indigo-50/50 text-indigo-900 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:ring-2 peer-checked:ring-indigo-500/20',
    },
    {
      key: 'cancelled',
      label: 'Shelved / Archived',
      desc: 'Put on hold, postponed, or archived for future reference.',
      icon: <Archive size={16} className="text-amber-500" />,
      colorClasses: 'border-amber-200 bg-amber-50/50 text-amber-900 peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:ring-2 peer-checked:ring-amber-500/20',
    },
    {
      key: 'failed',
      label: 'Discontinued',
      desc: 'Project ceased before goals were met.',
      icon: <XCircle size={16} className="text-rose-500" />,
      colorClasses: 'border-rose-200 bg-rose-50/50 text-rose-900 peer-checked:border-rose-500 peer-checked:bg-rose-50 peer-checked:ring-2 peer-checked:ring-rose-500/20',
    },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
              <FolderCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">Close Project</h2>
              <p className="text-xs text-stone-500 truncate max-w-xs font-medium">
                {event.name}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 mb-2">
              Select Final Project Outcome
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {outcomeOptions.map(opt => (
                <label 
                  key={opt.key} 
                  className={`relative flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    outcome === opt.key
                      ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600/30'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="outcome"
                    value={opt.key}
                    checked={outcome === opt.key}
                    onChange={() => setOutcome(opt.key)}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-stone-800 text-xs">
                      {opt.icon}
                      <span>{opt.label}</span>
                    </div>
                    <p className="text-[10px] text-stone-500 mt-0.5 leading-snug">
                      {opt.desc}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 mb-1.5">
              Closing Reason / Summary <span className="font-normal text-stone-400 normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={closedReason}
              onChange={e => setClosedReason(e.target.value)}
              placeholder="e.g., Campaign completed within budget, client sign-off received"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 mb-1.5">
              Lessons Learned & Retrospective <span className="font-normal text-stone-400 normal-case">(optional)</span>
            </label>
            <textarea
              value={lessonsLearnt}
              onChange={e => setLessonsLearnt(e.target.value)}
              rows={3}
              placeholder="Document key takeaways, what went well, or what could be improved for next time..."
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-xs resize-none"
            />
          </div>

          {pendingTasksCount > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-stone-200 bg-stone-50/60 cursor-pointer hover:bg-stone-50 transition">
              <input
                type="checkbox"
                checked={completeRemainingTasks}
                onChange={e => setCompleteRemainingTasks(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="font-bold text-stone-800 text-xs flex items-center gap-1.5">
                  <CheckSquare size={14} className="text-emerald-600" />
                  Mark all remaining {pendingTasksCount} open task{pendingTasksCount === 1 ? '' : 's'} as completed
                </span>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  Check this to automatically mark unresolved checklist items as complete upon closeout.
                </p>
              </div>
            </label>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-stone-600 hover:text-stone-900 text-xs font-bold rounded-lg hover:bg-stone-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <FolderCheck size={14} />
              Confirm & Close Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
