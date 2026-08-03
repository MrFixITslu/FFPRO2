import React from 'react';
import { ProjectTask } from '../../types';
import { AlertTriangle, ShieldAlert, ArrowRight, X, Check } from 'lucide-react';

export type ValidationWarningType = 'out_of_sequence_complete' | 'out_of_sequence_start' | 'delete_prereq';

interface Props {
  isOpen: boolean;
  type: ValidationWarningType;
  targetTask: ProjectTask;
  uncompletedPrereqs?: ProjectTask[];
  dependentTasks?: ProjectTask[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const DependencyValidationModal: React.FC<Props> = ({
  isOpen,
  type,
  targetTask,
  uncompletedPrereqs = [],
  dependentTasks = [],
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  let title = 'Dependency Validation Warning';
  let description = '';

  if (type === 'out_of_sequence_complete') {
    title = 'Prerequisites Not Completed!';
    description = `You are marking "${targetTask.text}" as completed, but the following prerequisite tasks are still pending:`;
  } else if (type === 'out_of_sequence_start') {
    title = 'Prerequisites Still Pending!';
    description = `You are starting "${targetTask.text}", but prerequisite tasks have not been completed yet:`;
  } else if (type === 'delete_prereq') {
    title = 'Task Has Downstream Dependents!';
    description = `Deleting "${targetTask.text}" will break dependencies for the following dependent tasks:`;
  }

  return (
    <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
        
        <div className="flex items-start gap-3">
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Warning List */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5">
          {type === 'delete_prereq'
            ? dependentTasks.map(t => (
                <div key={t.id} className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                  <ShieldAlert size={12} className="text-rose-500 shrink-0" />
                  <span>{t.text}</span>
                </div>
              ))
            : uncompletedPrereqs.map(t => (
                <div key={t.id} className="text-xs font-semibold text-amber-900 flex items-center gap-2">
                  <ArrowRight size={12} className="text-amber-600 shrink-0" />
                  <span>{t.text}</span>
                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Pending</span>
                </div>
              ))}
        </div>

        <p className="text-[11px] font-semibold text-slate-500 italic">
          Are you sure you want to proceed with this action?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
          >
            <Check size={14} /> Proceed Anyway
          </button>
        </div>

      </div>
    </div>
  );
};
