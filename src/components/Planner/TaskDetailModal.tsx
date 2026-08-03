import React, { useState } from 'react';
import { ProjectTask, TaskPriority, TaskStatus, ReminderOption } from '../../types';
import { detectCircularDependency, getTransitiveDependents, computeTaskStatus, getStatusBadgeConfig } from '../../utils/plannerUtils';
import { 
  X, Calendar, Clock, AlertTriangle, ShieldAlert, CheckCircle2, 
  Tag, Bell, Link2, Plus, Trash2, History, FileText, ChevronRight, Zap
} from 'lucide-react';

interface Props {
  task: ProjectTask;
  allTasks: ProjectTask[];
  currentUser: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTask: ProjectTask) => void;
  onDelete: (taskId: string) => void;
}

export const TaskDetailModal: React.FC<Props> = ({
  task,
  allTasks,
  currentUser,
  isOpen,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen) return null;

  const [text, setText] = useState(task.text);
  const [description, setDescription] = useState(task.description || '');
  const [notes, setNotes] = useState(task.notes || '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority || 'medium');
  const [status, setStatus] = useState<TaskStatus>(task.status || 'not_started');
  const [startDate, setStartDate] = useState(task.startDate || '');
  const [startTime, setStartTime] = useState(task.startTime || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [dueTime, setDueTime] = useState(task.dueTime || '');
  const [reminder, setReminder] = useState<ReminderOption>(task.reminder || 'none');
  const [customOffset, setCustomOffset] = useState<number>(task.customReminderOffsetMinutes || 60);
  const [dependencies, setDependencies] = useState<string[]>(task.dependencies || []);
  const [tags, setTags] = useState<string[]>(task.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Available candidate prerequisites (excluding self)
  const candidatePrereqs = allTasks.filter(t => t.id !== task.id);

  // Downstream tasks depending on this task
  const downstreamDependents = getTransitiveDependents(task.id, allTasks);

  const computedStatus = computeTaskStatus({ ...task, completed: task.completed, dependencies, dueDate }, allTasks);
  const badgeConfig = getStatusBadgeConfig(computedStatus);

  const handleAddDependency = (depId: string) => {
    if (!depId) return;
    if (dependencies.includes(depId)) return;

    // Cycle detection
    const isCycle = detectCircularDependency(task.id, depId, allTasks);
    if (isCycle) {
      setErrorMsg('Cannot add dependency: This would create a circular dependency loop!');
      return;
    }

    setErrorMsg(null);
    setDependencies(prev => [...prev, depId]);
  };

  const handleRemoveDependency = (depId: string) => {
    setDependencies(prev => prev.filter(id => id !== depId));
    setErrorMsg(null);
  };

  const handleAddTag = () => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const historyLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action: 'Updated task details and schedules',
    };

    const updated: ProjectTask = {
      ...task,
      text: text.trim(),
      description: description.trim(),
      notes: notes.trim(),
      priority,
      status,
      startDate: startDate || undefined,
      startTime: startTime || undefined,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      reminder,
      customReminderOffsetMinutes: customOffset,
      dependencies,
      tags,
      activityHistory: [historyLog, ...(task.activityHistory || [])],
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeConfig.colorClass}`}>
              {badgeConfig.label}
            </span>
            <h2 className="text-sm font-bold tracking-tight text-white">Task Details & Management</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {/* Main Title Input */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Task Name *
            </label>
            <input
              type="text"
              required
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              placeholder="e.g. Configure Firewall Rules"
            />
          </div>

          {/* Priority, Status & Reminder Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Bell size={12} /> Reminder
              </label>
              <select
                value={reminder}
                onChange={e => setReminder(e.target.value as ReminderOption)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="none">No Reminder</option>
                <option value="30m">30 Minutes Before</option>
                <option value="1h">1 Hour Before</option>
                <option value="1d">1 Day Before</option>
                <option value="2d">2 Days Before</option>
                <option value="1w">1 Week Before</option>
              </select>
            </div>
          </div>

          {/* Scheduling: Start Date/Time & Due Date/Time */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Calendar size={14} className="text-indigo-600" />
              Schedule & Timing
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Start Date & Time</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Due Date & Time</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="time"
                    value={dueTime}
                    onChange={e => setDueTime(e.target.value)}
                    className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Task Dependencies Section */}
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                <Link2 size={14} className="text-indigo-600" />
                Prerequisite Dependencies
              </h4>
              <span className="text-[10px] text-indigo-600 font-semibold">
                {dependencies.length} Prerequisite(s)
              </span>
            </div>

            {/* List of current prerequisite dependencies */}
            {dependencies.length > 0 ? (
              <div className="space-y-1.5">
                {dependencies.map(depId => {
                  const depTask = allTasks.find(t => t.id === depId);
                  return (
                    <div
                      key={depId}
                      className="p-2.5 bg-white border border-indigo-150 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className={`w-2 h-2 rounded-full ${depTask?.completed ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        <span className="font-semibold text-slate-800 truncate">{depTask?.text || depId}</span>
                        {depTask?.completed ? (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Completed</span>
                        ) : (
                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Pending</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDependency(depId)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">No prerequisite dependencies set. This task can start anytime.</p>
            )}

            {/* Select new dependency */}
            <div className="flex gap-2">
              <select
                onChange={e => {
                  handleAddDependency(e.target.value);
                  e.target.value = '';
                }}
                className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">+ Select prerequisite task...</option>
                {candidatePrereqs
                  .filter(cand => !dependencies.includes(cand.id))
                  .map(cand => (
                    <option key={cand.id} value={cand.id}>
                      {cand.text} {cand.completed ? '(Completed)' : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Downstream Impact / Dependent Tasks Display */}
          {downstreamDependents.length > 0 && (
            <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-2">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                <Zap size={14} className="text-amber-600" />
                Downstream Dependent Tasks ({downstreamDependents.length})
              </h4>
              <p className="text-[10px] text-amber-700">
                The following tasks depend on this task to be completed first:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {downstreamDependents.map(dep => (
                  <span
                    key={dep.id}
                    className="px-2 py-1 bg-white border border-amber-200 rounded text-[10px] font-bold text-slate-700 flex items-center gap-1"
                  >
                    <ChevronRight size={10} className="text-amber-500" />
                    {dep.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Scope of work and instructions..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Notes & Updates
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional comments or progress updates..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
              <Tag size={12} /> Tags
            </label>
            <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md text-[10px] font-bold flex items-center gap-1"
                >
                  #{tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-rose-600">
                    <X size={10} />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag..."
                  className="bg-transparent text-xs outline-none px-1 py-0.5 w-24"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="text-indigo-600 hover:text-indigo-800 p-0.5"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Activity Logs */}
          {task.activityHistory && task.activityHistory.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <History size={14} /> Activity Log
              </h4>
              <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                {task.activityHistory.map(log => (
                  <div key={log.id} className="text-[11px] text-slate-600 flex justify-between items-center py-1 border-b border-slate-100 gap-2 min-w-0">
                    <span className="min-w-0 flex-1 break-words">{log.action.replace(/_/g, ' ')} <span className="text-slate-400">by {log.user}</span></span>
                    <span className="text-[9px] text-slate-400 font-mono shrink-0 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
            >
              <Trash2 size={14} /> Delete Task
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} /> Save Task Changes
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
