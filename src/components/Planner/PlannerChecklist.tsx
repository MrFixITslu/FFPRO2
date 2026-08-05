import React, { useState, useMemo, useEffect } from 'react';
import { ProjectTask, TaskPriority, TaskStatus, ReminderOption } from '../../types';
import { 
  computeTaskStatus, 
  filterAndSortTasks, 
  getTaskSummaryStats, 
  getStatusBadgeConfig, 
  getDaysRemaining, 
  getTransitiveDependents,
  shiftTaskSchedules,
  calculateCriticalPath
} from '../../utils/plannerUtils';
import { PlannerDashboardSummary } from './PlannerDashboardSummary';
import { TaskDetailModal } from './TaskDetailModal';
import { DependencyValidationModal, ValidationWarningType } from './DependencyValidationModal';
import { SchedulePropagationModal } from './SchedulePropagationModal';
import { DependencyGraphView } from './DependencyGraphView';
import { 
  Plus, Search, Filter, Calendar, Clock, AlertTriangle, ShieldAlert, 
  CheckCircle2, ChevronDown, ChevronRight, Zap, Bell, Link2, Tag, 
  ArrowUpDown, Eye, ListTodo, Layers, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  tasks: ProjectTask[];
  currentUser: string;
  canEdit: boolean;
  onUpdateTasks: (updatedTasks: ProjectTask[]) => void;
  onAddActionLog?: (action: string, type: 'task') => void;
}

export const PlannerChecklist: React.FC<Props> = ({
  tasks = [],
  currentUser,
  canEdit,
  onUpdateTasks,
  onAddActionLog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'architecture'>('list');
  const [sortOption, setSortOption] = useState<'manual' | 'dueDate' | 'priority' | 'name'>('manual');
  
  // Collapsed state for completed tasks (collapsed by default)
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);

  // New task quick input
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');

  // Subtask quick inputs
  const [subTaskInputs, setSubTaskInputs] = useState<Record<string, string>>({});

  // Modals state
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<ProjectTask | null>(null);

  // Validation Warning Modal State
  const [validationModal, setValidationModal] = useState<{
    isOpen: boolean;
    type: ValidationWarningType;
    targetTask: ProjectTask | null;
    uncompletedPrereqs?: ProjectTask[];
    dependentTasks?: ProjectTask[];
    pendingAction?: () => void;
  }>({
    isOpen: false,
    type: 'out_of_sequence_complete',
    targetTask: null,
  });

  // Schedule Propagation Modal State
  const [propagationModal, setPropagationModal] = useState<{
    isOpen: boolean;
    overdueTask: ProjectTask | null;
    overdueDays: number;
    impactedTasks: ProjectTask[];
  }>({
    isOpen: false,
    overdueTask: null,
    overdueDays: 0,
    impactedTasks: [],
  });

  // Summary statistics
  const summaryStats = useMemo(() => getTaskSummaryStats(tasks), [tasks]);
  const criticalSet = useMemo(() => calculateCriticalPath(tasks), [tasks]);

  // Filter & Smart Order
  const { activeTasks, completedTasks } = useMemo(
    () => filterAndSortTasks(tasks, activeFilter, searchQuery, sortOption),
    [tasks, activeFilter, searchQuery, sortOption]
  );

  // Notifications detection
  const notifications = useMemo(() => {
    const list: { id: string; title: string; type: 'warning' | 'info' | 'success'; taskId: string }[] = [];
    tasks.forEach(t => {
      const status = computeTaskStatus(t, tasks);
      if (status === 'overdue') {
        list.push({
          id: `overdue-${t.id}`,
          title: `Task "${t.text}" is overdue!`,
          type: 'warning',
          taskId: t.id,
        });
      } else if (status === 'due_today') {
        list.push({
          id: `due-${t.id}`,
          title: `Task "${t.text}" is due today!`,
          type: 'info',
          taskId: t.id,
        });
      } else if (status === 'not_started' && (!t.dependencies || t.dependencies.every(depId => tasks.find(x => x.id === depId)?.completed))) {
        if (t.dependencies && t.dependencies.length > 0) {
          list.push({
            id: `unblocked-${t.id}`,
            title: `All prerequisites completed! Task "${t.text}" is ready to start.`,
            type: 'success',
            taskId: t.id,
          });
        }
      }
    });
    return list;
  }, [tasks]);

  // --- Handlers ---

  const handleAddTask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTaskText.trim()) return;

    const newTask: ProjectTask = {
      id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
      text: newTaskText.trim(),
      completed: false,
      dueDate: newTaskDueDate || undefined,
      priority: newTaskPriority,
      status: 'not_started',
      assignedToId: currentUser,
      subTasks: [],
      order: tasks.length,
      activityHistory: [
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          user: currentUser,
          action: 'Created task',
        },
      ],
    };

    const updated = [...tasks, newTask];
    onUpdateTasks(updated);
    if (onAddActionLog) onAddActionLog(`Deployed milestone: "${newTask.text}"`, 'task');

    setNewTaskText('');
    setNewTaskDueDate('');
    setNewTaskPriority('medium');
  };

  const handleToggleCompletion = (taskId: string) => {
    const target = tasks.find(t => t.id === taskId);
    if (!target) return;

    // Check if toggling to complete when prerequisites are uncompleted
    if (!target.completed) {
      const uncompletedPrereqs = (target.dependencies || [])
        .map(id => tasks.find(x => x.id === id))
        .filter((x): x is ProjectTask => !!x && !x.completed);

      if (uncompletedPrereqs.length > 0) {
        setValidationModal({
          isOpen: true,
          type: 'out_of_sequence_complete',
          targetTask: target,
          uncompletedPrereqs,
          pendingAction: () => executeToggleCompletion(target),
        });
        return;
      }
    }

    executeToggleCompletion(target);
  };

  const executeToggleCompletion = (target: ProjectTask) => {
    const isNowCompleted = !target.completed;
    if (isNowCompleted) {
      setIsCompletedCollapsed(false);
    }
    const updatedTasks = tasks.map(t => {
      if (t.id === target.id) {
        return {
          ...t,
          completed: isNowCompleted,
          status: (isNowCompleted ? 'completed' : 'not_started') as TaskStatus,
          completionDate: isNowCompleted ? new Date().toISOString().split('T')[0] : undefined,
          activityHistory: [
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              user: currentUser,
              action: isNowCompleted ? 'Marked task completed' : 'Reopened task',
            },
            ...(t.activityHistory || []),
          ],
        };
      }
      return t;
    });

    onUpdateTasks(updatedTasks);
    if (onAddActionLog) {
      onAddActionLog(
        isNowCompleted ? `Completed task: "${target.text}"` : `Reopened task: "${target.text}"`,
        'task'
      );
    }

    // Check if task was overdue and has dependents -> offer schedule propagation
    if (isNowCompleted && target.dueDate) {
      const remaining = getDaysRemaining(target.dueDate);
      if (remaining.days !== null && remaining.days < 0) {
        const impacted = getTransitiveDependents(target.id, tasks).filter(x => !x.completed);
        if (impacted.length > 0) {
          setPropagationModal({
            isOpen: true,
            overdueTask: target,
            overdueDays: Math.abs(remaining.days),
            impactedTasks: impacted,
          });
        }
      }
    }
  };

  const handleDeleteTask = (taskId: string) => {
    const target = tasks.find(t => t.id === taskId);
    if (!target) return;

    // Check if task has downstream dependents
    const dependents = getTransitiveDependents(taskId, tasks);
    if (dependents.length > 0) {
      setValidationModal({
        isOpen: true,
        type: 'delete_prereq',
        targetTask: target,
        dependentTasks: dependents,
        pendingAction: () => executeDeleteTask(taskId),
      });
      return;
    }

    executeDeleteTask(taskId);
  };

  const executeDeleteTask = (taskId: string) => {
    const updated = tasks.filter(t => t.id !== taskId);
    onUpdateTasks(updated);
    if (selectedTaskForDetail?.id === taskId) {
      setSelectedTaskForDetail(null);
    }
  };

  const handleAddSubTask = (parentTaskId: string) => {
    const text = subTaskInputs[parentTaskId];
    if (!text?.trim()) return;

    const newSub: ProjectTask = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.trim(),
      completed: false,
      assignedToId: currentUser,
      subTasks: [],
    };

    const updated = tasks.map(t => {
      if (t.id === parentTaskId) {
        return {
          ...t,
          subTasks: [...(t.subTasks || []), newSub],
        };
      }
      return t;
    });

    onUpdateTasks(updated);
    setSubTaskInputs(prev => ({ ...prev, [parentTaskId]: '' }));
  };

  const handleToggleSubTask = (parentTaskId: string, subTaskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === parentTaskId) {
        const updatedSubs = (t.subTasks || []).map(st =>
          st.id === subTaskId ? { ...st, completed: !st.completed } : st
        );
        return { ...t, subTasks: updatedSubs };
      }
      return t;
    });
    onUpdateTasks(updated);
  };

  const handleSaveTaskDetail = (updatedTask: ProjectTask) => {
    const updatedList = tasks.map(t => (t.id === updatedTask.id ? updatedTask : t));
    onUpdateTasks(updatedList);
  };

  // Schedule propagation handlers
  const handlePropagateShiftAll = (daysDelta: number) => {
    if (!propagationModal.overdueTask) return;
    const updated = shiftTaskSchedules(propagationModal.overdueTask.id, daysDelta, tasks);
    onUpdateTasks(updated);
    setPropagationModal({ isOpen: false, overdueTask: null, overdueDays: 0, impactedTasks: [] });
  };

  const handlePropagateShiftSelected = (daysDelta: number, selectedIds: string[]) => {
    if (!propagationModal.overdueTask) return;
    const updated = shiftTaskSchedules(propagationModal.overdueTask.id, daysDelta, tasks, selectedIds);
    onUpdateTasks(updated);
    setPropagationModal({ isOpen: false, overdueTask: null, overdueDays: 0, impactedTasks: [] });
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Summary Metrics Widgets */}
      <PlannerDashboardSummary
        stats={summaryStats}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

      {/* 2. Notifications Banner */}
      {notifications.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-white shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
              <Bell size={14} /> Smart Planner Notifications ({notifications.length})
            </h4>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {notifications.slice(0, 4).map(n => (
              <div
                key={n.id}
                onClick={() => {
                  const t = tasks.find(x => x.id === n.taskId);
                  if (t) setSelectedTaskForDetail(t);
                }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition hover:scale-105 flex items-center gap-2 ${
                  n.type === 'warning'
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    : n.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                <span>{n.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Search & Toolbar Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search Bar */}
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by task name, notes, tags, or dependencies..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        {/* View Mode & Sort Dropdowns */}
        <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
          
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setSortOption('manual')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                sortOption === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setSortOption('dueDate')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                sortOption === 'dueDate' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Due Date
            </button>
            <button
              onClick={() => setSortOption('priority')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                sortOption === 'priority' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Priority
            </button>
          </div>

          <div className="flex bg-slate-900 text-white p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Checklist
            </button>
            <button
              onClick={() => setViewMode('architecture')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'architecture' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Gantt & Graph
            </button>
          </div>

        </div>

      </div>

      {/* 4. Architecture View or List View */}
      {viewMode === 'architecture' ? (
        <DependencyGraphView
          allTasks={tasks}
          onSelectTask={task => setSelectedTaskForDetail(task)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Task List */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Active (Incomplete) Tasks Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ListTodo size={14} className="text-indigo-600" />
                  Active Tasks ({activeTasks.length})
                </span>
              </div>

              {activeTasks.length > 0 ? (
                <div className="space-y-3">
                  <AnimatePresence>
                    {activeTasks.map(task => {
                      const status = computeTaskStatus(task, tasks);
                      const badgeConfig = getStatusBadgeConfig(status);
                      const isCritical = criticalSet.has(task.id);
                      const daysRem = getDaysRemaining(task.dueDate);

                      return (
                        <motion.div
                          key={task.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className={`bg-white p-5 rounded-2xl border transition-all shadow-xs hover:shadow-md ${
                            isCritical
                              ? 'border-purple-300 ring-1 ring-purple-400/30'
                              : status === 'overdue'
                              ? 'border-rose-300 bg-rose-50/10'
                              : status === 'blocked'
                              ? 'border-amber-300 bg-amber-50/10'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1">
                              
                              {/* Checkbox */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCompletion(task.id);
                                }}
                                disabled={!canEdit}
                                title={task.completed ? "Mark incomplete" : "Mark completed"}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all shrink-0 mt-0.5 cursor-pointer ${
                                  task.completed
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                                    : 'border-slate-300 text-slate-300 hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50/50'
                                }`}
                              >
                                <CheckCircle2 size={16} />
                              </button>

                              {/* Task Card Details */}
                              <div
                                onClick={() => setSelectedTaskForDetail(task)}
                                className="flex-1 cursor-pointer"
                              >
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h4 className="text-sm font-bold text-slate-900 leading-snug hover:text-indigo-600 transition">
                                    {task.text}
                                  </h4>

                                  {/* Priority Badge */}
                                  {task.priority && (
                                    <span
                                      className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                        task.priority === 'urgent'
                                          ? 'bg-rose-100 text-rose-800'
                                          : task.priority === 'high'
                                          ? 'bg-amber-100 text-amber-800'
                                          : task.priority === 'medium'
                                          ? 'bg-indigo-100 text-indigo-800'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      {task.priority}
                                    </span>
                                  )}

                                  {/* Critical Path Badge */}
                                  {isCritical && (
                                    <span className="text-[9px] font-extrabold bg-purple-600 text-white uppercase px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                      <Zap size={10} /> Critical
                                    </span>
                                  )}

                                  {/* Status Badge */}
                                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase ${badgeConfig.colorClass}`}>
                                    {badgeConfig.label}
                                  </span>
                                </div>

                                {/* Dates & Schedule Info */}
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-medium mt-1">
                                  {task.startDate && (
                                    <span className="flex items-center gap-1">
                                      <Calendar size={12} className="text-slate-400" /> Start: {task.startDate}
                                    </span>
                                  )}
                                  {task.dueDate && (
                                    <span className="flex items-center gap-1">
                                      <Clock size={12} className="text-slate-400" /> Due: {task.dueDate}
                                    </span>
                                  )}
                                  {daysRem.days !== null && (
                                    <span
                                      className={`font-bold ${
                                        daysRem.days < 0
                                          ? 'text-rose-600'
                                          : daysRem.days === 0
                                          ? 'text-amber-600'
                                          : 'text-indigo-600'
                                      }`}
                                    >
                                      ({daysRem.label})
                                    </span>
                                  )}
                                </div>

                                {/* Prerequisites & Dependencies summary */}
                                {task.dependencies && task.dependencies.length > 0 && (
                                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-indigo-900 font-bold bg-indigo-50/80 px-2.5 py-1 rounded-lg border border-indigo-100 w-fit">
                                    <Link2 size={12} className="text-indigo-600" />
                                    <span>Prerequisites: {task.dependencies.length}</span>
                                  </div>
                                )}

                              </div>

                            </div>

                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={!canEdit}
                              className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {/* Subtasks */}
                          <div className="ml-10 mt-3 pt-3 border-t border-slate-100 space-y-2">
                            {(task.subTasks || []).map(st => (
                              <div key={st.id} className="flex items-center gap-2">
                                <button
                                  onClick={() => handleToggleSubTask(task.id, st.id)}
                                  disabled={!canEdit}
                                  className={`w-4 h-4 rounded flex items-center justify-center border text-[8px] ${
                                    st.completed
                                      ? 'bg-emerald-500 border-emerald-500 text-white'
                                      : 'border-slate-300 text-transparent'
                                  }`}
                                >
                                  ✓
                                </button>
                                <span className={`text-xs ${st.completed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                                  {st.text}
                                </span>
                              </div>
                            ))}

                            {canEdit && (
                              <div className="flex gap-2 mt-2">
                                <input
                                  type="text"
                                  placeholder="Link sub-milestone..."
                                  value={subTaskInputs[task.id] || ''}
                                  onChange={e =>
                                    setSubTaskInputs(prev => ({ ...prev, [task.id]: e.target.value }))
                                  }
                                  onKeyDown={e => e.key === 'Enter' && handleAddSubTask(task.id)}
                                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                  onClick={() => handleAddSubTask(task.id)}
                                  className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold"
                                >
                                  + Add
                                </button>
                              </div>
                            )}
                          </div>

                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No Active Tasks Found</p>
                </div>
              )}
            </div>

            {/* Completed Tasks Section (Collapsed by Default) */}
            {completedTasks.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <button
                  onClick={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
                  className="flex items-center justify-between w-full p-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition text-xs font-bold text-slate-700"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Completed Tasks ({completedTasks.length})
                  </span>
                  {isCompletedCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>

                {!isCompletedCollapsed && (
                  <div className="space-y-2 opacity-80">
                    {completedTasks.map(task => (
                      <div
                        key={task.id}
                        className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCompletion(task.id);
                            }}
                            disabled={!canEdit}
                            title="Reopen task"
                            className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs cursor-pointer transition"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <div>
                            <span className="text-xs font-bold text-slate-500 line-through block">{task.text}</span>
                            {task.completionDate && (
                              <span className="text-[10px] text-slate-400">Completed on {task.completionDate}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedTaskForDetail(task)}
                          className="text-xs font-bold text-indigo-600 hover:underline"
                        >
                          View Details
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Quick Deploy Task Sidebar Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs h-fit space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Plus size={16} className="text-indigo-600" /> Deploy New Milestone Task
            </h3>

            {canEdit ? (
              <form onSubmit={handleAddTask} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTaskText}
                    onChange={e => setNewTaskText(e.target.value)}
                    placeholder="e.g. Install & Configure Firewall"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!newTaskText.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition"
                >
                  Deploy Task
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500">You have view-only access to this project.</p>
            )}
          </div>

        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={selectedTaskForDetail}
          allTasks={tasks}
          currentUser={currentUser}
          isOpen={!!selectedTaskForDetail}
          onClose={() => setSelectedTaskForDetail(null)}
          onSave={handleSaveTaskDetail}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Dependency Validation Modal */}
      <DependencyValidationModal
        isOpen={validationModal.isOpen}
        type={validationModal.type}
        targetTask={validationModal.targetTask!}
        uncompletedPrereqs={validationModal.uncompletedPrereqs}
        dependentTasks={validationModal.dependentTasks}
        onConfirm={() => {
          if (validationModal.pendingAction) validationModal.pendingAction();
          setValidationModal(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setValidationModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Schedule Propagation Modal */}
      {propagationModal.overdueTask && (
        <SchedulePropagationModal
          isOpen={propagationModal.isOpen}
          overdueTask={propagationModal.overdueTask}
          overdueDays={propagationModal.overdueDays}
          impactedTasks={propagationModal.impactedTasks}
          onShiftAll={handlePropagateShiftAll}
          onShiftSelected={handlePropagateShiftSelected}
          onIgnore={() => setPropagationModal({ isOpen: false, overdueTask: null, overdueDays: 0, impactedTasks: [] })}
        />
      )}

    </div>
  );
};
