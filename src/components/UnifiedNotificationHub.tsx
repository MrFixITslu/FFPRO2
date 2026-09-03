import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bell,
  Mail,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar as CalendarIcon,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  LogIn,
  Check,
  X,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Receipt,
  ListTodo,
  ExternalLink,
  Tag,
  CalendarDays,
  CheckSquare,
  AlertCircle
} from 'lucide-react';
import { BudgetEvent, CalendarItem, Transaction, GmailPlanningNotification, ProjectTask, BankConnection } from '../types';
import { EmailDetailModal } from './EmailDetailModal';
import { authService } from '../services/authService';
import { realtimeService } from '../services/realtimeService';

// Stub out Firebase functions that were removed - this component is not currently used
// It can be properly refactored to use the server-token Gmail approach later
const getFirebaseAccessToken = () => null;
const fetchDirectGmailNotifications = async (token: string, tasks: any) => [];
const markDirectGmailAsRead = async (messageId: string, token: string) => {};
const signInWithGooglePopup = async () => ({});
const setFirebaseAccessToken = () => {};

export type NotificationCategory = 'all' | 'tasks' | 'calendar' | 'financial' | 'gmail';

export interface UnifiedNotificationItem {
  id: string;
  category: 'task' | 'calendar' | 'financial' | 'gmail' | 'event';
  type: 
    | 'task_overdue' 
    | 'task_today' 
    | 'task_upcoming' 
    | 'task_priority' 
    | 'task_in_progress'
    | 'calendar_overdue'
    | 'calendar_today'
    | 'calendar_upcoming'
    | 'bill_due' 
    | 'income_unconfirmed' 
    | 'budget_warning' 
    | 'gmail_email' 
    | 'event_upcoming';
  title: string;
  subtitle?: string;
  snippet?: string;
  timestamp?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  daysDiff?: number;
  amount?: number;
  isIncome?: boolean;
  statusText: string;
  statusColor: 'rose' | 'amber' | 'emerald' | 'indigo' | 'purple' | 'blue';
  sourceData?: any;
  actionType: 'task' | 'calendar' | 'bill' | 'income' | 'gmail' | 'planner';
}

interface Props {
  userEmail?: string;
  events?: BudgetEvent[];
  calendarItems?: CalendarItem[];
  unpaidBills?: any[];
  unconfirmedIncomes?: any[];
  categoryBudgets?: Record<string, number>;
  transactions?: Transaction[];
  bankConnections?: BankConnection[];
  onNavigateToTask?: (taskId: string, projectId?: string | null) => void;
  onNavigateToPlanner?: () => void;
  onPayRecurring?: (item: any, amount: number) => void;
  onReceiveRecurringIncome?: (item: any, amount: number, dest: string) => void;
  onOpenTransactionForm?: () => void;
  onSelectEmailModal?: (email: GmailPlanningNotification) => void;
  onDismissEmail?: (emailId: string) => void;
  externalDismissedIds?: string[];
}

const AUTHORIZED_GMAIL = 'vision79slu@gmail.com';

export const UnifiedNotificationHub: React.FC<Props> = ({
  userEmail,
  events = [],
  calendarItems = [],
  unpaidBills = [],
  unconfirmedIncomes = [],
  categoryBudgets = {},
  transactions = [],
  bankConnections = [],
  onNavigateToTask,
  onNavigateToPlanner,
  onPayRecurring,
  onReceiveRecurringIncome,
  onOpenTransactionForm,
  onSelectEmailModal,
  onDismissEmail,
  externalDismissedIds = [],
}) => {
  const [activeFilter, setActiveFilter] = useState<NotificationCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('dashboard_dismissed_email_ids');
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) {}
    return new Set();
  });

  // Pull server-persisted dismissed email IDs on mount so fresh devices/phones immediately reflect deletions
  useEffect(() => {
    let isMounted = true;
    fetch('/api/gmail/dismissed', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data && Array.isArray(data.dismissedIds) && data.dismissedIds.length > 0) {
          setDismissedIds(prev => {
            const next = new Set(prev);
            data.dismissedIds.forEach((id: string) => {
              next.add(id);
              next.add(`gmail-${id}`);
            });
            try {
              localStorage.setItem('dashboard_dismissed_email_ids', JSON.stringify(Array.from(next)));
            } catch (e) {}
            return next;
          });
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Removed realtime 'email_dismissed' listener as it's no longer supported by realtimeService
  useEffect(() => {
    // Left empty or we can remove the useEffect completely
  }, []);

  // Sync with cloud/external dismissed email IDs
  useEffect(() => {
    if (Array.isArray(externalDismissedIds) && externalDismissedIds.length > 0) {
      setDismissedIds(prev => {
        const next = new Set(prev);
        let changed = false;
        externalDismissedIds.forEach(id => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [externalDismissedIds]);
  const [selectedEmailModal, setSelectedEmailModal] = useState<GmailPlanningNotification | null>(null);

  // Gmail-specific state (disabled - use GmailPlanningNotifications component instead)
  const isGmailAuthorized = false;
  const [gmailNotifications, setGmailNotifications] = useState<GmailPlanningNotification[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean>(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [lastGmailSync, setLastGmailSync] = useState<Date | null>(null);

  // Quick action state for bill/income
  const [activePaymentModal, setActivePaymentModal] = useState<{ item: any; isIncome: boolean } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [selectedDestination, setSelectedDestination] = useState<string>('Cash in Hand');

  // 1. Compile all user tasks (including subtasks) for matching & notifications
  const allUserTasks = useMemo(() => {
    const list: { taskId: string; taskTitle: string; projectName: string; projectId: string | null; task: ProjectTask }[] = [];
    events.forEach(ev => {
      if (Array.isArray(ev.tasks)) {
        ev.tasks.forEach(t => {
          if (t && t.id && t.text) {
            list.push({
              taskId: String(t.id),
              taskTitle: t.text,
              projectName: ev.name || 'Planner Project',
              projectId: String(ev.id),
              task: t,
            });

            // Also check subtasks
            if (Array.isArray(t.subTasks)) {
              t.subTasks.forEach(st => {
                if (st && st.id && st.text) {
                  list.push({
                    taskId: String(st.id),
                    taskTitle: `${st.text} (${t.text})`,
                    projectName: ev.name || 'Planner Project',
                    projectId: String(ev.id),
                    task: st,
                  });
                }
              });
            }
          }
        });
      }
    });
    return list;
  }, [events]);

  // 2. Gmail notifications disabled - use GmailPlanningNotifications component instead
  const fetchGmail = useCallback(async (isSilent = false, explicitToken?: string) => {
    // Stub - Gmail handled by separate GmailPlanningNotifications component
    return;
  }, []);

  // Initial Gmail sync check and 15-minute Google interval sync
  useEffect(() => {
    const token = getFirebaseAccessToken();
    if (token) {
      setGmailConnected(true);
      fetchGmail(true, token);
    } else {
      fetchGmail(true);
    }

    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const intervalId = setInterval(() => {
      const currentToken = getFirebaseAccessToken();
      fetchGmail(true, currentToken || undefined);
    }, FIFTEEN_MINUTES_MS);

    return () => clearInterval(intervalId);
  }, [fetchGmail]);

  // Handle Google Sign-in & Gmail connection
  const handleGooglePopupConnect = () => {
    window.location.href = '/api/auth/google';
  };

  // Dismiss Gmail permanently from dashboard across all devices (persisted in DB + broadcast)
  const handleDismissGmail = (messageId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cleanId = messageId.replace(/^gmail-/, '');
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(`gmail-${cleanId}`);
      next.add(cleanId);
      try {
        localStorage.setItem('dashboard_dismissed_email_ids', JSON.stringify(Array.from(next)));
      } catch (err) {}
      return next;
    });
    
    if (onDismissEmail) {
      onDismissEmail(cleanId);
    }
    // Optimistic removal
    setGmailNotifications(prev => prev.filter(g => g.id !== cleanId && `gmail-${g.id}` !== messageId));

    // Send permanent dismiss to server database & real-time broadcast to all devices
    fetch('/api/gmail/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ messageId: cleanId }),
    }).catch(err => console.warn('Permanent dismiss error:', err));
  };

  // 3. Build unified notifications list
  const unifiedNotifications = useMemo(() => {
    const items: UnifiedNotificationItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- A. Project Tasks Notifications ---
    allUserTasks.forEach(({ taskId, taskTitle, projectName, projectId, task }) => {
      if (task.completed) return;

      let dueDateObj: Date | null = null;
      let diffDays = 999;

      if (task.dueDate) {
        dueDateObj = new Date(task.dueDate + 'T00:00:00');
        dueDateObj.setHours(0, 0, 0, 0);
        const diffTime = dueDateObj.getTime() - today.getTime();
        diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const formattedDue = dueDateObj ? dueDateObj.toLocaleDateString('default', { month: 'short', day: 'numeric' }) : null;

      if (diffDays < 0) {
        items.push({
          id: `task-overdue-${taskId}`,
          category: 'task',
          type: 'task_overdue',
          title: taskTitle,
          subtitle: `${projectName} • Due ${formattedDue}`,
          snippet: task.description || task.notes || 'This task is past its scheduled deadline and requires attention.',
          dueDate: task.dueDate,
          priority: task.priority || 'high',
          daysDiff: diffDays,
          statusText: `Overdue by ${Math.abs(diffDays)}d`,
          statusColor: 'rose',
          sourceData: { taskId, projectId, task },
          actionType: 'task',
        });
      } else if (diffDays === 0) {
        items.push({
          id: `task-today-${taskId}`,
          category: 'task',
          type: 'task_today',
          title: taskTitle,
          subtitle: `${projectName} • Due Today`,
          snippet: task.description || task.notes || 'Scheduled for completion today.',
          dueDate: task.dueDate,
          priority: task.priority || 'high',
          daysDiff: 0,
          statusText: 'Due Today',
          statusColor: 'amber',
          sourceData: { taskId, projectId, task },
          actionType: 'task',
        });
      } else if (diffDays <= 7 && diffDays > 0) {
        items.push({
          id: `task-upcoming-${taskId}`,
          category: 'task',
          type: 'task_upcoming',
          title: taskTitle,
          subtitle: `${projectName} • Due ${formattedDue}`,
          snippet: task.description || task.notes || `Scheduled for ${formattedDue}.`,
          dueDate: task.dueDate,
          priority: task.priority || 'medium',
          daysDiff: diffDays,
          statusText: `Due in ${diffDays}d (${formattedDue})`,
          statusColor: 'indigo',
          sourceData: { taskId, projectId, task },
          actionType: 'task',
        });
      } else if (task.priority === 'urgent' || task.priority === 'high') {
        items.push({
          id: `task-pri-${taskId}`,
          category: 'task',
          type: 'task_priority',
          title: taskTitle,
          subtitle: `${projectName} • ${task.priority.toUpperCase()} Priority`,
          snippet: task.description || task.notes || 'Marked as high priority in project planning.',
          dueDate: task.dueDate,
          priority: task.priority,
          daysDiff: diffDays,
          statusText: `${task.priority.toUpperCase()} Priority`,
          statusColor: 'purple',
          sourceData: { taskId, projectId, task },
          actionType: 'task',
        });
      } else if (task.status === 'in_progress' || task.status === 'review') {
        items.push({
          id: `task-active-${taskId}`,
          category: 'task',
          type: 'task_in_progress',
          title: taskTitle,
          subtitle: `${projectName} • ${task.status === 'review' ? 'In Review' : 'In Progress'}`,
          snippet: task.description || task.notes || 'Active project task in progress.',
          dueDate: task.dueDate,
          priority: task.priority || 'medium',
          daysDiff: diffDays,
          statusText: task.status === 'review' ? 'In Review' : 'In Progress',
          statusColor: 'indigo',
          sourceData: { taskId, projectId, task },
          actionType: 'task',
        });
      }
    });

    // --- B. Calendar Items Notifications (Meetings, Reminders, Events) ---
    calendarItems.forEach(cal => {
      if (cal.completed) return;

      let calDateObj: Date | null = null;
      let diffDays = 999;

      if (cal.date) {
        calDateObj = new Date(cal.date + 'T00:00:00');
        calDateObj.setHours(0, 0, 0, 0);

        // Handle recurring items if past date
        if (cal.recurring && cal.recurring !== 'none') {
          const checkDate = new Date(calDateObj);
          while (checkDate < today) {
            if (cal.recurring === 'daily') {
              checkDate.setDate(checkDate.getDate() + 1);
            } else if (cal.recurring === 'weekly') {
              checkDate.setDate(checkDate.getDate() + 7);
            } else if (cal.recurring === 'monthly') {
              checkDate.setMonth(checkDate.getMonth() + 1);
            }
          }
          calDateObj = checkDate;
        }

        const diffTime = calDateObj.getTime() - today.getTime();
        diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const formattedDate = calDateObj ? calDateObj.toLocaleDateString('default', { month: 'short', day: 'numeric' }) : null;
      const typeLabel = cal.type === 'meeting' ? 'Meeting' : cal.type === 'reminder' ? 'Reminder' : 'Calendar Event';

      if (diffDays < 0) {
        items.push({
          id: `cal-overdue-${cal.id}`,
          category: 'calendar',
          type: 'calendar_overdue',
          title: cal.title,
          subtitle: `${typeLabel}${cal.startTime ? ` at ${cal.startTime}` : ''} • Scheduled ${formattedDate}`,
          snippet: cal.description || `Past calendar ${cal.type}. Requires review.`,
          dueDate: cal.date,
          daysDiff: diffDays,
          statusText: `Past Due (${Math.abs(diffDays)}d ago)`,
          statusColor: 'rose',
          sourceData: cal,
          actionType: 'calendar',
        });
      } else if (diffDays === 0) {
        items.push({
          id: `cal-today-${cal.id}`,
          category: 'calendar',
          type: 'calendar_today',
          title: cal.title,
          subtitle: `${typeLabel}${cal.startTime ? ` at ${cal.startTime}` : ''} • Today`,
          snippet: cal.description || `Scheduled for today${cal.startTime ? ` at ${cal.startTime}` : ''}.`,
          dueDate: cal.date,
          daysDiff: 0,
          statusText: cal.startTime ? `Today at ${cal.startTime}` : 'Scheduled Today',
          statusColor: 'amber',
          sourceData: cal,
          actionType: 'calendar',
        });
      } else if (diffDays <= 7 && diffDays > 0) {
        items.push({
          id: `cal-upcoming-${cal.id}`,
          category: 'calendar',
          type: 'calendar_upcoming',
          title: cal.title,
          subtitle: `${typeLabel}${cal.startTime ? ` at ${cal.startTime}` : ''} • ${formattedDate}`,
          snippet: cal.description || `Scheduled for ${formattedDate}${cal.startTime ? ` at ${cal.startTime}` : ''}.`,
          dueDate: cal.date,
          daysDiff: diffDays,
          statusText: `In ${diffDays}d (${formattedDate})`,
          statusColor: 'purple',
          sourceData: cal,
          actionType: 'calendar',
        });
      }
    });

    // --- C. Project & Event Milestones ---
    events.forEach(ev => {
      if (ev.status === 'completed') return;
      if (ev.date) {
        const evDate = new Date(ev.date + 'T00:00:00');
        evDate.setHours(0, 0, 0, 0);
        const diffTime = evDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 7) {
          const formattedDate = evDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });
          items.push({
            id: `event-${ev.id}`,
            category: 'calendar',
            type: 'event_upcoming',
            title: ev.name,
            subtitle: `${ev.eventType ? ev.eventType.toUpperCase() : 'PROJECT MILESTONE'} • ${diffDays === 0 ? 'Today' : `in ${diffDays} days`}`,
            snippet: `Target Date: ${formattedDate} • ${ev.tasks?.length || 0} project tasks tracked.`,
            dueDate: ev.date,
            daysDiff: diffDays,
            statusText: diffDays === 0 ? 'Project Milestone Today' : `Milestone in ${diffDays}d`,
            statusColor: 'purple',
            sourceData: { projectId: ev.id, event: ev },
            actionType: 'planner',
          });
        }
      }
    });

    // --- D. Upcoming Commitments & Financial Reminders (Unpaid Bills & Incomes) ---
    unpaidBills.forEach(bill => {
      const dueDate = new Date(bill.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const formattedDate = dueDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      const progress = (bill.paidAmount || 0) / (bill.amount || 1) * 100;
      const hasPaidSomething = progress > 0;

      items.push({
        id: `bill-${bill.id}`,
        category: 'financial',
        type: 'bill_due',
        title: bill.description,
        subtitle: `Recurring Expense • ${bill.category}`,
        snippet: `Total Bill: $${(bill.amount || bill.remainingAmount).toLocaleString()} • Remaining: $${bill.remainingAmount.toFixed(2)}${hasPaidSomething ? ' (Partial Paid)' : ''} • Due ${formattedDate}`,
        amount: bill.remainingAmount,
        dueDate: bill.nextDueDate,
        daysDiff: diffDays,
        isIncome: false,
        statusText: diffDays < 0 ? `Overdue by ${Math.abs(diffDays)}d` : diffDays === 0 ? 'Bill Due Today' : `Due in ${diffDays}d (${formattedDate})`,
        statusColor: diffDays <= 0 ? 'rose' : diffDays <= 3 ? 'amber' : 'indigo',
        sourceData: bill,
        actionType: 'bill',
      });
    });

    unconfirmedIncomes.forEach(inc => {
      const confDate = new Date(inc.nextConfirmationDate);
      confDate.setHours(0, 0, 0, 0);
      const diffTime = confDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const formattedDate = confDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      const progress = (inc.receivedAmount || 0) / (inc.amount || 1) * 100;
      const hasReceivedSomething = progress > 0;

      items.push({
        id: `income-${inc.id}`,
        category: 'financial',
        type: 'income_unconfirmed',
        title: inc.description,
        subtitle: `Expected Inflow • ${inc.category}`,
        snippet: `Total Expected: +$${(inc.amount || inc.remainingAmount).toLocaleString()} • Remaining: +$${inc.remainingAmount.toFixed(2)}${hasReceivedSomething ? ' (Partial Received)' : ''} • Scheduled ${formattedDate}`,
        amount: inc.remainingAmount,
        dueDate: inc.nextConfirmationDate,
        daysDiff: diffDays,
        isIncome: true,
        statusText: diffDays <= 0 ? 'Confirmation Ready' : `Expected in ${diffDays}d (${formattedDate})`,
        statusColor: 'emerald',
        sourceData: inc,
        actionType: 'income',
      });
    });

    // --- E. Budget Alerts (>90% threshold) ---
    const categorySpend: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type === 'expense' && t.category) {
        categorySpend[t.category] = (categorySpend[t.category] || 0) + (t.amount || 0);
      }
    });

    Object.entries(categoryBudgets).forEach(([cat, budgetVal]) => {
      const budget = Number(budgetVal) || 0;
      if (budget > 0) {
        const spent = categorySpend[cat] || 0;
        const ratio = spent / budget;
        if (ratio >= 0.9) {
          const isOver = spent > budget;
          items.push({
            id: `budget-warn-${cat}`,
            category: 'financial',
            type: 'budget_warning',
            title: `${cat} Budget Limit`,
            subtitle: `${(ratio * 100).toFixed(0)}% Consumed`,
            snippet: isOver 
              ? `Exceeded budget by $${(spent - budget).toLocaleString()} ($${spent.toLocaleString()} / $${budget.toLocaleString()})`
              : `Nearing budget limit: $${spent.toLocaleString()} spent of $${budget.toLocaleString()} allowance.`,
            amount: spent,
            statusText: isOver ? 'Budget Exceeded' : 'Budget Warning',
            statusColor: isOver ? 'rose' : 'amber',
            sourceData: { category: cat, spent, budget },
            actionType: 'planner',
          });
        }
      }
    });

    // --- F. Gmail Planning Email Notifications ---
    gmailNotifications.forEach(g => {
      items.push({
        id: `gmail-${g.id}`,
        category: 'gmail',
        type: 'gmail_email',
        title: g.subject || '(No Subject)',
        subtitle: `From: ${g.from}${g.taskReference ? ` • Linked Task: ${g.taskReference.taskTitle}` : ''}`,
        snippet: g.snippet,
        timestamp: g.date,
        statusText: g.taskReference ? 'Linked to Project Task' : 'Unread Planning Header',
        statusColor: 'blue',
        sourceData: g,
        actionType: 'gmail',
      });
    });

    // Filter out dismissed items
    return items.filter(it => !dismissedIds.has(it.id));
  }, [allUserTasks, calendarItems, events, unpaidBills, unconfirmedIncomes, categoryBudgets, transactions, gmailNotifications, dismissedIds]);

  // Counts by category
  const counts = useMemo(() => {
    return {
      all: unifiedNotifications.length,
      tasks: unifiedNotifications.filter(n => n.category === 'task').length,
      calendar: unifiedNotifications.filter(n => n.category === 'calendar' || n.category === 'event').length,
      financial: unifiedNotifications.filter(n => n.category === 'financial').length,
      gmail: unifiedNotifications.filter(n => n.category === 'gmail').length,
    };
  }, [unifiedNotifications]);

  // Filter and search
  const filteredNotifications = useMemo(() => {
    return unifiedNotifications.filter(item => {
      if (activeFilter === 'tasks' && item.category !== 'task') return false;
      if (activeFilter === 'calendar' && item.category !== 'calendar' && item.category !== 'event') return false;
      if (activeFilter === 'financial' && item.category !== 'financial') return false;
      if (activeFilter === 'gmail' && item.category !== 'gmail') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          (item.snippet && item.snippet.toLowerCase().includes(q)) ||
          item.statusText.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [unifiedNotifications, activeFilter, searchQuery]);

  // Quick Action Handler
  const handleItemAction = (item: UnifiedNotificationItem) => {
    if (item.actionType === 'task') {
      const { taskId, projectId } = item.sourceData || {};
      if (onNavigateToTask) {
        onNavigateToTask(taskId, projectId);
      } else if (onNavigateToPlanner) {
        onNavigateToPlanner();
      }
    } else if (item.actionType === 'calendar') {
      if (onNavigateToPlanner) {
        onNavigateToPlanner();
      }
    } else if (item.actionType === 'bill') {
      setActivePaymentModal({ item: item.sourceData, isIncome: false });
      const rem = item.sourceData.remainingAmount ?? item.sourceData.amount ?? 0;
      setPaymentAmount(typeof rem === 'number' ? rem.toFixed(2) : String(rem));
    } else if (item.actionType === 'income') {
      const isSalary = item.sourceData.description?.toLowerCase().includes('salary');
      const defaultDest = isSalary ? (bankConnections[0]?.institution || 'Cash in Hand') : 'Cash in Hand';
      setSelectedDestination(defaultDest);
      setActivePaymentModal({ item: item.sourceData, isIncome: true });
      const rem = item.sourceData.remainingAmount ?? item.sourceData.amount ?? 0;
      setPaymentAmount(typeof rem === 'number' ? rem.toFixed(2) : String(rem));
    } else if (item.actionType === 'gmail') {
      const g = item.sourceData as GmailPlanningNotification;
      if (onSelectEmailModal) {
        onSelectEmailModal(g);
      } else {
        setSelectedEmailModal(g);
      }
    } else if (item.actionType === 'planner') {
      if (onNavigateToPlanner) onNavigateToPlanner();
    }
  };

  const handleDismissItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const confirmModalPayment = () => {
    if (!activePaymentModal) return;
    const amt = parseFloat(paymentAmount) || activePaymentModal.item.remainingAmount || activePaymentModal.item.amount || 0;
    if (activePaymentModal.isIncome && onReceiveRecurringIncome) {
      onReceiveRecurringIncome(activePaymentModal.item, amt, selectedDestination || 'Cash in Hand');
    } else if (!activePaymentModal.isIncome && onPayRecurring) {
      onPayRecurring(activePaymentModal.item, amt);
    }
    setActivePaymentModal(null);
    setPaymentAmount('');
  };

  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-6 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
            <Bell size={18} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-stone-900 text-sm tracking-tight">Active Notifications &amp; Planning Intelligence</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                {counts.all} Active
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Live unified feed: project tasks, calendar meetings, financial reminders &amp; Gmail planning updates
            </p>
          </div>
        </div>

        {/* Sync & Search Controls */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 sm:w-44">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search alerts..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition text-stone-800 placeholder-slate-400"
            />
          </div>

          {gmailConnected ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Gmail Synced
              </span>
              <button
                onClick={() => fetchGmail(false)}
                disabled={gmailLoading}
                title="Sync Live Gmail Alerts"
                className="p-1.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-lg text-xs transition shadow-xs disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={13} className={gmailLoading ? 'animate-spin text-indigo-600' : ''} />
                <span className="text-[10px] font-bold hidden sm:inline">Sync</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleGooglePopupConnect}
              disabled={gmailLoading}
              title="Connect Gmail"
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              {gmailLoading ? <RefreshCw size={13} className="animate-spin" /> : <Mail size={13} />}
              <span className="text-[11px]">Connect Gmail</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-stone-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'all'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <span>All Alerts</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-700'}`}>
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('tasks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'tasks'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <ListTodo size={13} />
          <span>Project Tasks</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'tasks' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
            {counts.tasks}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('calendar')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'calendar'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <CalendarDays size={13} />
          <span>Calendar &amp; Events</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'calendar' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'}`}>
            {counts.calendar}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('financial')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'financial'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <DollarSign size={13} />
          <span>Upcoming Commitments &amp; Financials</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'financial' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
            {counts.financial}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('gmail')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'gmail'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Mail size={13} />
          <span>Gmail Updates</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'gmail' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
            {counts.gmail}
          </span>
        </button>
      </div>

      {/* Main Alert List */}
      <div className="p-4 sm:p-5">
        {/* Gmail Connect Banner if filter is 'gmail' and not connected */}
        {activeFilter === 'gmail' && !gmailConnected && (
          <div className="p-5 mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Mail size={20} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-stone-900">Connect Google for Live Gmail Planning Alerts</h4>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  Secure connection to automatically pull unread planning headers and match them with tasks.
                </p>
                {gmailError && (
                  <p className="text-[10px] text-rose-600 mt-1 font-semibold flex items-center gap-1">
                    <AlertCircle size={11} /> {gmailError}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleGooglePopupConnect}
              disabled={gmailLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              {gmailLoading ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
              <span>Connect Google Gmail</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {filteredNotifications.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mb-2">
              <CheckCircle2 size={20} />
            </div>
            <h4 className="text-xs font-bold text-stone-700">All clear! No pending notifications</h4>
            <p className="text-[11px] text-stone-400 mt-0.5">
              {searchQuery 
                ? 'No alerts match your search query.' 
                : activeFilter === 'gmail' && !gmailConnected 
                  ? 'Connect Gmail using the button above to sync planning emails.' 
                  : 'You are completely caught up on project tasks, calendar events, and recurring commitments.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredNotifications.map(item => {
              const badgeColors = {
                rose: 'bg-rose-50 text-rose-700 border-rose-200',
                amber: 'bg-amber-50 text-amber-800 border-amber-200',
                emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                purple: 'bg-purple-50 text-purple-700 border-purple-200',
                blue: 'bg-blue-50 text-blue-700 border-blue-200',
              }[item.statusColor];

              const icon = {
                task_overdue: <AlertTriangle size={14} className="text-rose-600" />,
                task_today: <Clock size={14} className="text-amber-600" />,
                task_upcoming: <ListTodo size={14} className="text-indigo-600" />,
                task_priority: <Tag size={14} className="text-purple-600" />,
                task_in_progress: <CheckSquare size={14} className="text-indigo-600" />,
                calendar_overdue: <AlertTriangle size={14} className="text-rose-600" />,
                calendar_today: <Clock size={14} className="text-amber-600" />,
                calendar_upcoming: <CalendarIcon size={14} className="text-purple-600" />,
                bill_due: <Receipt size={14} className={item.statusColor === 'rose' ? 'text-rose-600' : 'text-amber-600'} />,
                income_unconfirmed: <TrendingUp size={14} className="text-emerald-600" />,
                budget_warning: <AlertTriangle size={14} className="text-amber-600" />,
                gmail_email: <Mail size={14} className="text-blue-600" />,
                event_upcoming: <CalendarIcon size={14} className="text-purple-600" />,
              }[item.type] || <Bell size={14} className="text-indigo-600" />;

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemAction(item)}
                  className="p-3.5 rounded-xl border border-stone-200 hover:border-indigo-300 hover:shadow-md transition bg-white flex flex-col justify-between cursor-pointer group"
                >
                  <div>
                    {/* Top Row: Badge & Dismiss */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border flex items-center gap-1 ${badgeColors}`}>
                        {icon}
                        <span>{item.statusText}</span>
                      </span>

                      <button
                        onClick={e => handleDismissItem(item.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded transition"
                        title="Dismiss alert"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {/* Title & Subtitle */}
                    <h4 className="text-xs font-bold text-stone-900 group-hover:text-indigo-600 transition line-clamp-1">
                      {item.title}
                    </h4>
                    {item.subtitle && (
                      <p className="text-[10px] font-medium text-stone-500 mt-0.5 line-clamp-1">
                        {item.subtitle}
                      </p>
                    )}

                    {/* Snippet */}
                    {item.snippet && (
                      <p className="text-[11px] text-stone-600 mt-1.5 line-clamp-2 leading-relaxed bg-stone-50 p-2 rounded-lg border border-stone-100 font-mono text-[10px]">
                        {item.snippet}
                      </p>
                    )}
                  </div>

                  {/* Bottom Action bar */}
                  <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
                    {item.amount !== undefined ? (
                      <span className="text-xs font-bold text-stone-900">
                        {item.isIncome ? '+' : ''}${item.amount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
                        {item.category.toUpperCase()}
                      </span>
                    )}

                    <span className="text-[10px] font-bold text-indigo-600 group-hover:translate-x-0.5 transition flex items-center gap-1">
                      <span>
                        {item.actionType === 'task' 
                          ? 'Open Task' 
                          : item.actionType === 'calendar' 
                            ? 'Open Calendar'
                            : item.actionType === 'bill' 
                              ? 'Pay Bill' 
                              : item.actionType === 'income' 
                                ? 'Receive' 
                                : item.actionType === 'gmail'
                                  ? 'View Email'
                                  : 'View'}
                      </span>
                      <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Payment / Income Confirmation Modal */}
      {activePaymentModal && (
        <div className="fixed inset-0 z-[250] bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activePaymentModal.isIncome ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                  {activePaymentModal.isIncome ? <TrendingUp size={16} /> : <Receipt size={16} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    {activePaymentModal.isIncome ? 'Record Received Inflow' : 'Clear Recurring Commitment'}
                  </h3>
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">
                    {activePaymentModal.isIncome ? 'Incoming Inflow Record' : 'Payment Outflow Record'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActivePaymentModal(null)}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200/80 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-stone-800">{activePaymentModal.item.description}</p>
                  <p className="text-[10px] font-semibold text-stone-500 mt-0.5">{activePaymentModal.item.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-indigo-600">
                    ${(activePaymentModal.item.remainingAmount ?? activePaymentModal.item.amount ?? 0).toFixed ? (activePaymentModal.item.remainingAmount ?? activePaymentModal.item.amount ?? 0).toFixed(2) : (activePaymentModal.item.remainingAmount ?? activePaymentModal.item.amount)}
                  </p>
                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Remaining Due</p>
                </div>
              </div>
            </div>

            {activePaymentModal.isIncome && (
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Select Destination Account
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button 
                    type="button"
                    onClick={() => setSelectedDestination('Cash in Hand')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedDestination === 'Cash in Hand' ? 'bg-stone-900 text-white border-stone-900 shadow-xs' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'}`}
                  >
                    Cash In Hand
                  </button>
                  {bankConnections.map(conn => (
                    <button 
                      type="button"
                      key={conn.institution}
                      onClick={() => setSelectedDestination(conn.institution)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedDestination === conn.institution ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'}`}
                    >
                      {conn.institution}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-5">
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                Amount to Record ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-stone-900 shadow-xs"
              />
              <p className="text-[10px] text-stone-400 mt-1">
                Enter partial or full amount to record against this commitment.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActivePaymentModal(null)}
                className="flex-1 py-2.5 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModalPayment}
                className={`flex-1 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition ${
                  activePaymentModal.isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                Confirm &amp; Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Detail Modal Popup */}
      <EmailDetailModal
        email={selectedEmailModal}
        onClose={() => setSelectedEmailModal(null)}
        onDeleteFromDashboard={handleDismissGmail}
      />
    </section>
  );
};
