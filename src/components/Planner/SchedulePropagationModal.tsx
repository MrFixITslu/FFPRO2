import React, { useState } from 'react';
import { ProjectTask } from '../../types';
import { Calendar, Clock, ArrowRight, Check, X, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  overdueTask: ProjectTask;
  overdueDays: number;
  impactedTasks: ProjectTask[];
  onShiftAll: (daysDelta: number) => void;
  onShiftSelected: (daysDelta: number, selectedIds: string[]) => void;
  onIgnore: () => void;
}

export const SchedulePropagationModal: React.FC<Props> = ({
  isOpen,
  overdueTask,
  overdueDays,
  impactedTasks,
  onShiftAll,
  onShiftSelected,
  onIgnore,
}) => {
  if (!isOpen) return null;

  const [shiftDays, setShiftDays] = useState<number>(overdueDays > 0 ? overdueDays : 1);
  const [selectedIds, setSelectedIds] = useState<string[]>(impactedTasks.map(t => t.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-[230] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
        
        <div className="flex items-start gap-3">
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
            <Zap size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-stone-900">Automatic Schedule Propagation</h3>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              Task <span className="font-bold text-stone-900">"{overdueTask.text}"</span> is overdue by <span className="font-bold text-rose-600">{overdueDays} day(s)</span>.
              Would you like to automatically shift the schedule for dependent downstream tasks?
            </p>
          </div>
        </div>

        {/* Shift Days Input */}
        <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 flex items-center justify-between">
          <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
            <Calendar size={14} className="text-indigo-600" /> Days to Shift Schedule Forward:
          </label>
          <input
            type="number"
            min="1"
            value={shiftDays}
            onChange={e => setShiftDays(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 px-3 py-1 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center text-stone-900 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Impacted Tasks Checkbox List */}
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-2">
            Impacted Dependent Tasks ({impactedTasks.length})
          </label>
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
            {impactedTasks.map(task => (
              <label
                key={task.id}
                className="flex items-center gap-2.5 cursor-pointer p-1.5 hover:bg-white rounded-lg transition"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(task.id)}
                  onChange={() => toggleSelect(task.id)}
                  className="w-4 h-4 text-indigo-600 rounded border-stone-300 focus:ring-indigo-500"
                />
                <div className="text-xs font-semibold text-stone-800">
                  <span>{task.text}</span>
                  {task.dueDate && (
                    <span className="text-[10px] text-stone-400 ml-2">Current Due: {task.dueDate}</span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={onIgnore}
            className="w-full sm:w-auto px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition"
          >
            Ignore / Keep Dates
          </button>
          
          <button
            type="button"
            onClick={() => onShiftSelected(shiftDays, selectedIds)}
            disabled={selectedIds.length === 0}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
          >
            <Check size={14} /> Shift Selected ({selectedIds.length})
          </button>

          <button
            type="button"
            onClick={() => onShiftAll(shiftDays)}
            className="w-full sm:w-auto px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
          >
            Shift All Dependent Tasks
          </button>
        </div>

      </div>
    </div>
  );
};
