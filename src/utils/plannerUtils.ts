import { ProjectTask, TaskPriority, TaskStatus } from '../types';

export type ComputedTaskStatus = 
  | 'completed'
  | 'blocked'
  | 'overdue'
  | 'due_today'
  | 'due_tomorrow'
  | 'in_progress'
  | 'not_started';

export interface TaskSummaryStats {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
  blocked: number;
  critical: number;
}

/**
 * Parses YYYY-MM-DD string into a local Date at start of day.
 */
export const parseLocalDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
};

/**
 * Formats a Date object to YYYY-MM-DD.
 */
export const formatDateToISO = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Computes the exact operational status of a task based on dates, completion, and dependencies.
 */
export const computeTaskStatus = (
  task: ProjectTask,
  allTasks: ProjectTask[]
): ComputedTaskStatus => {
  if (task.completed) return 'completed';

  // Check if blocked by uncompleted prerequisites
  if (task.dependencies && task.dependencies.length > 0) {
    const hasUncompletedPrereq = task.dependencies.some(depId => {
      const dep = allTasks.find(t => t.id === depId);
      return dep && !dep.completed;
    });
    if (hasUncompletedPrereq) return 'blocked';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = parseLocalDate(task.dueDate);
  if (dueDate) {
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'due_today';
    if (diffDays === 1) return 'due_tomorrow';
  }

  if (task.status === 'in_progress') return 'in_progress';
  return 'not_started';
};

/**
 * Returns human-readable label and styling classes for a status.
 */
export const getStatusBadgeConfig = (status: ComputedTaskStatus) => {
  switch (status) {
    case 'completed':
      return { label: 'Completed', colorClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' };
    case 'blocked':
      return { label: 'Blocked', colorClass: 'bg-amber-500/10 text-amber-600 border-amber-200' };
    case 'overdue':
      return { label: 'Overdue', colorClass: 'bg-rose-500/10 text-rose-600 border-rose-200 animate-pulse' };
    case 'due_today':
      return { label: 'Due Today', colorClass: 'bg-amber-500/15 text-amber-700 border-amber-300 font-bold' };
    case 'due_tomorrow':
      return { label: 'Due Tomorrow', colorClass: 'bg-sky-500/10 text-sky-600 border-sky-200' };
    case 'in_progress':
      return { label: 'In Progress', colorClass: 'bg-indigo-500/10 text-indigo-600 border-indigo-200' };
    case 'not_started':
    default:
      return { label: 'Not Started', colorClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
};

/**
 * Returns days remaining until due date (negative if overdue).
 */
export const getDaysRemaining = (dueDateStr?: string): { days: number | null; label: string } => {
  const dueDate = parseLocalDate(dueDateStr);
  if (!dueDate) return { days: null, label: 'No due date' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { days: 0, label: 'Due Today' };
  if (diffDays === 1) return { days: 1, label: '1 day left' };
  if (diffDays > 1) return { days: diffDays, label: `${diffDays} days left` };
  if (diffDays === -1) return { days: -1, label: '1 day overdue' };
  return { days: diffDays, label: `${Math.abs(diffDays)} days overdue` };
};

/**
 * Detects if adding `newDependencyId` to `taskId` would create a circular dependency.
 */
export const detectCircularDependency = (
  taskId: string,
  newDependencyId: string,
  allTasks: ProjectTask[]
): boolean => {
  if (taskId === newDependencyId) return true;

  // DFS to check if `taskId` is reachable starting from `newDependencyId`
  const visited = new Set<string>();

  const dfs = (currentId: string): boolean => {
    if (currentId === taskId) return true;
    visited.add(currentId);

    const task = allTasks.find(t => t.id === currentId);
    if (!task || !task.dependencies) return false;

    for (const depId of task.dependencies) {
      if (!visited.has(depId)) {
        if (dfs(depId)) return true;
      }
    }
    return false;
  };

  return dfs(newDependencyId);
};

/**
 * Finds all direct and indirect downstream tasks that depend on `targetTaskId`.
 */
export const getTransitiveDependents = (
  targetTaskId: string,
  allTasks: ProjectTask[]
): ProjectTask[] => {
  const dependentSet = new Set<string>();

  const findDependentsOf = (id: string) => {
    allTasks.forEach(task => {
      if (task.dependencies?.includes(id) && !dependentSet.has(task.id)) {
        dependentSet.add(task.id);
        findDependentsOf(task.id);
      }
    });
  };

  findDependentsOf(targetTaskId);
  return allTasks.filter(t => dependentSet.has(t.id));
};

/**
 * Identifies tasks on the Critical Path (the longest dependency chain by task count / duration).
 */
export const calculateCriticalPath = (allTasks: ProjectTask[]): Set<string> => {
  const criticalSet = new Set<string>();
  if (allTasks.length === 0) return criticalSet;

  // Map each task to its duration or depth
  const memo = new Map<string, { depth: number; path: string[] }>();

  const getPathFrom = (taskId: string): { depth: number; path: string[] } => {
    if (memo.has(taskId)) return memo.get(taskId)!;

    const task = allTasks.find(t => t.id === taskId);
    if (!task) return { depth: 0, path: [] };

    // Dependents of this task
    const directDependents = allTasks.filter(t => t.dependencies?.includes(taskId));

    if (directDependents.length === 0) {
      const result = { depth: 1, path: [taskId] };
      memo.set(taskId, result);
      return result;
    }

    let maxSub = { depth: 0, path: [] as string[] };
    for (const dep of directDependents) {
      const sub = getPathFrom(dep.id);
      if (sub.depth > maxSub.depth) {
        maxSub = sub;
      }
    }

    const result = {
      depth: 1 + maxSub.depth,
      path: [taskId, ...maxSub.path],
    };
    memo.set(taskId, result);
    return result;
  };

  // Find root tasks (tasks with no prerequisite dependencies)
  let longestChain: string[] = [];
  allTasks.forEach(t => {
    const res = getPathFrom(t.id);
    if (res.depth > longestChain.length) {
      longestChain = res.path;
    }
  });

  // If the longest chain has at least 2 nodes or is valid, mark them
  if (longestChain.length > 1) {
    longestChain.forEach(id => criticalSet.add(id));
  }

  return criticalSet;
};

/**
 * Automatically shifts task dates for a task and all downstream dependents.
 */
export const shiftTaskSchedules = (
  targetTaskId: string,
  daysDelta: number,
  allTasks: ProjectTask[],
  selectedIds?: string[] // Optional filter to shift only selected dependent IDs
): ProjectTask[] => {
  const impactedDependents = getTransitiveDependents(targetTaskId, allTasks);
  const affectedIds = new Set<string>([
    targetTaskId,
    ...impactedDependents
      .filter(t => !selectedIds || selectedIds.includes(t.id))
      .map(t => t.id),
  ]);

  return allTasks.map(task => {
    if (!affectedIds.has(task.id)) return task;

    const updatedTask = { ...task };

    if (task.startDate) {
      const d = parseLocalDate(task.startDate);
      if (d) {
        d.setDate(d.getDate() + daysDelta);
        updatedTask.startDate = formatDateToISO(d);
      }
    }

    if (task.dueDate) {
      const d = parseLocalDate(task.dueDate);
      if (d) {
        d.setDate(d.getDate() + daysDelta);
        updatedTask.dueDate = formatDateToISO(d);
      }
    }

    return updatedTask;
  });
};

/**
 * Calculates summary metrics widget data across all tasks.
 */
export const getTaskSummaryStats = (allTasks: ProjectTask[]): TaskSummaryStats => {
  const criticalSet = calculateCriticalPath(allTasks);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 7);

  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let dueToday = 0;
  let dueThisWeek = 0;
  let overdue = 0;
  let blocked = 0;

  allTasks.forEach(task => {
    const status = computeTaskStatus(task, allTasks);

    if (status === 'completed') completed++;
    else if (status === 'blocked') blocked++;
    else if (status === 'overdue') overdue++;
    else if (status === 'due_today') {
      dueToday++;
      dueThisWeek++;
    } else if (status === 'due_tomorrow') {
      dueThisWeek++;
    } else if (status === 'in_progress') {
      inProgress++;
    } else {
      notStarted++;
    }

    // Check if due within this week
    if (!task.completed && task.dueDate) {
      const d = parseLocalDate(task.dueDate);
      if (d && d >= today && d <= endOfWeek && status !== 'due_today' && status !== 'due_tomorrow') {
        dueThisWeek++;
      }
    }
  });

  return {
    total: allTasks.length,
    completed,
    inProgress,
    notStarted,
    dueToday,
    dueThisWeek,
    overdue,
    blocked,
    critical: criticalSet.size,
  };
};

/**
 * Filters and orders tasks with smart task ordering:
 * Incomplete tasks at top, Completed tasks moved to bottom.
 */
export const filterAndSortTasks = (
  allTasks: ProjectTask[],
  filter: string,
  searchQuery: string,
  sortOption: 'manual' | 'dueDate' | 'priority' | 'name' = 'manual'
): { activeTasks: ProjectTask[]; completedTasks: ProjectTask[] } => {
  const criticalSet = calculateCriticalPath(allTasks);
  const query = searchQuery.trim().toLowerCase();

  const filtered = allTasks.filter(task => {
    const status = computeTaskStatus(task, allTasks);

    // Search query matching task name, description, tags, notes, dependencies
    if (query) {
      const matchText = (task.text || '').toLowerCase().includes(query);
      const matchDesc = (task.description || '').toLowerCase().includes(query);
      const matchNotes = (task.notes || '').toLowerCase().includes(query);
      const matchTags = (task.tags || []).some(tag => tag.toLowerCase().includes(query));
      const matchDep = (task.dependencies || []).some(depId => {
        const depTask = allTasks.find(t => t.id === depId);
        return depTask && depTask.text.toLowerCase().includes(query);
      });
      if (!matchText && !matchDesc && !matchNotes && !matchTags && !matchDep) {
        return false;
      }
    }

    // Filter categories
    switch (filter) {
      case 'active':
        return !task.completed;
      case 'completed':
        return task.completed;
      case 'overdue':
        return status === 'overdue';
      case 'due_today':
        return status === 'due_today';
      case 'due_week': {
        if (task.completed || !task.dueDate) return false;
        const d = parseLocalDate(task.dueDate);
        if (!d) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in7Days = new Date(today);
        in7Days.setDate(today.getDate() + 7);
        return d >= today && d <= in7Days;
      }
      case 'blocked':
        return status === 'blocked';
      case 'critical':
        return criticalSet.has(task.id);
      case 'all':
      default:
        return true;
    }
  });

  // Separate active (incomplete) vs completed
  const activeTasks = filtered.filter(t => !t.completed);
  const completedTasks = filtered.filter(t => t.completed);

  // Apply sorting within each group
  const sortFn = (a: ProjectTask, b: ProjectTask) => {
    if (sortOption === 'dueDate') {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (sortOption === 'priority') {
      const pWeights: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      const wA = pWeights[a.priority || 'medium'] || 2;
      const wB = pWeights[b.priority || 'medium'] || 2;
      return wB - wA;
    }
    if (sortOption === 'name') {
      return a.text.localeCompare(b.text);
    }
    // Manual order
    return (a.order ?? 0) - (b.order ?? 0);
  };

  activeTasks.sort(sortFn);
  completedTasks.sort(sortFn);

  return { activeTasks, completedTasks };
};
