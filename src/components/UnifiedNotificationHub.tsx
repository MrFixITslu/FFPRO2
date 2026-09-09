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
  LogIn,
  LogOut,
  X,
  ChevronRight,
  TrendingUp,
  Receipt,
  ListTodo,
  Tag,
  CheckSquare,
  AlertCircle,
} from 'lucide-react';
import {
  BudgetEvent,
  CalendarItem,
  Transaction,
  GmailPlanningNotification,
  ProjectTask,
  BankConnection,
} from '../types';
import { EmailDetailModal } from './EmailDetailModal';
import { useGmailNotifications } from '../hooks/useGmailNotifications';
import { hasCalendarEventPassed } from '../utils/calendarNotificationUtils';

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
  onNavigateToCalendar?: () => void;
  onPayRecurring?: (item: any, amount: number) => void;
  onReceiveRecurringIncome?: (item: any, amount: number, dest: string) => void;
  onOpenTransactionForm?: () => void;
  onSelectEmailModal?: (email: GmailPlanningNotification) => void;
  onDismissEmail?: (emailId: string) => void;
  externalDismissedIds?: string[];
  gmailNotifications?: GmailPlanningNotification[];
  gmailConnected?: boolean;
  gmailLoading?: boolean;
  gmailError?: string | null;
  onFetchGmail?: (isSilent?: boolean) => Promise<any>;
  onConnectGmail?: () => void;
  onDisconnectGmail?: () => Promise<void>;
}

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
  onNavigateToCalendar,
  onPayRecurring,
  onReceiveRecurringIncome,
  onOpenTransactionForm,
  onSelectEmailModal,
  onDismissEmail,
  externalDismissedIds = [],
  gmailNotifications: propGmailNotifications,
  gmailConnected: propGmailConnected,
  gmailLoading: propGmailLoading,
  gmailError: propGmailError,
  onFetchGmail: propOnFetchGmail,
  onConnectGmail: propOnConnectGmail,
  onDisconnectGmail: propOnDisconnectGmail,
}) => {
  const [activeFilter, setActiveFilter] = useState<NotificationCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmailModal, setSelectedEmailModal] = useState<GmailPlanningNotification | null>(null);

  // Local dismissed IDs cache
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('dashboard_dismissed_email_ids');
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) {}
    return new Set();
  });

  // Pull server-persisted dismissed email IDs on mount
  useEffect(() => {
    let isMounted = true;
    fetch('/api/gmail/dismissed', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
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
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync external dismissed IDs
  useEffect(() => {
    if (Array.isArray(externalDismissedIds) && externalDismissedIds.length > 0) {
      setDismissedIds(prev => {
        const next = new Set(prev);
        let changed = false;
        externalDismissedIds.forEach(id => {
          if (!next.has(id)) {
            next.add(id);
            next.add(`gmail-${id}`);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [externalDismissedIds]);

  // Unified Google Email Engine: Reuses the exact same hook and authentication flow as Executive Inbox Briefing
  const fallbackGmail = useGmailNotifications(userEmail, events, externalDismissedIds, onDismissEmail);

  const activeGmailNotifications = propGmailNotifications ?? fallbackGmail.activeUnreadEmails;
  const isGmailConnected = propGmailConnected ?? fallbackGmail.gmailConnected;
  const isGmailLoading = propGmailLoading ?? fallbackGmail.gmailLoading;
  const gmailErrorMessage = propGmailError ?? fallbackGmail.gmailError;
  const triggerFetchGmail = propOnFetchGmail ?? fallbackGmail.fetchGmail;
  const triggerConnectGmail = propOnConnectGmail ?? fallbackGmail.handleConnectGmail;
  const triggerDisconnectGmail = propOnDisconnectGmail ?? fallbackGmail.handleDisconnectGmail;
  const triggerDismissEmail = onDismissEmail ?? fallbackGmail.handleDismissEmail;

  // Quick action state for bill/income
  const [activePaymentModal, setActivePaymentModal] = useState<{ item: any; isIncome: boolean } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [selectedDestination, setSelectedDestination] = useState<string>('Cash in Hand');

  // 1. Compile user tasks for matching & notifications
  const allUserTasks = useMemo(() => {
    const list: { taskId: string; taskTitle: string; projectName: string; projectId: string | null; task: ProjectTask }[] = [];
    events.forEach(ev => {
      if (ev.status === 'closed') return;
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

  // Permanent dismiss for Gmail items across dashboard, local cache, parent state, and server
  const handleDismissGmail = useCallback(
    (messageId: string, e?: React.MouseEvent) => {
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

      triggerDismissEmail(cleanId);
    },
    [triggerDismissEmail]
  );

  // Mark Gmail read permanently
  const handleReadGmail = useCallback(
    (messageId: string) => {
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

      fetch('/api/gmail/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageId: cleanId }),
      }).catch(err => console.warn('Permanent read error:', err));
    },
    []
  );

  // 2. Build unified notifications list
  const unifiedNotifications = useMemo(() => {
    const items: UnifiedNotificationItem[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
      } else if (diffDays <= 3 && diffDays > 0) {
        items.push({
          id: `task-upcoming-${taskId}`,
          category: 'task',
          type: 'task_upcoming',
          title: taskTitle,
          subtitle: `${projectName} • Due in ${diffDays}d (${formattedDue})`,
          snippet: task.description || task.notes || `Approaching deadline in ${diffDays} days.`,
          dueDate: task.dueDate,
          priority: task.priority || 'medium',
          daysDiff: diffDays,
          statusText: `Due in ${diffDays}d`,
          statusColor: 'indigo',
          sourceData: { taskId, projectId, task },
          actionType: 'task',
        });
      } else if (task.priority === 'urgent' || task.priority === 'high') {
        items.push({
          id: `task-prio-${taskId}`,
          category: 'task',
          type: 'task_priority',
          title: taskTitle,
          subtitle: `${projectName} • High Priority Focus`,
          snippet: task.description || task.notes || 'Marked as high priority item.',
          dueDate: task.dueDate,
          priority: task.priority,
          daysDiff: diffDays,
          statusText: task.priority === 'urgent' ? 'Urgent Priority' : 'High Priority',
          statusColor: 'purple',
          sourceData: { taskId, projectId, task },
          actionType: 'task',
        });
      }
    });

    // --- B. Calendar Items Notifications (Future & Relevant Only - Strictly Excludes Past Events) ---
    calendarItems.forEach(cal => {
      if (!cal || cal.completed) return;

      // Strict underlying business logic: if event date/time has already passed, DO NOT display
      if (hasCalendarEventPassed(cal, now)) return;

      let calDateObj: Date | null = null;
      let diffDays = 0;

      if (cal.date) {
        calDateObj = new Date(cal.date + 'T00:00:00');
        calDateObj.setHours(0, 0, 0, 0);

        if (cal.recurring && cal.recurring !== 'none') {
          const checkDate = new Date(calDateObj);
          while (checkDate < today) {
            if (cal.recurring === 'daily') checkDate.setDate(checkDate.getDate() + 1);
            else if (cal.recurring === 'weekly') checkDate.setDate(checkDate.getDate() + 7);
            else if (cal.recurring === 'monthly') checkDate.setMonth(checkDate.getMonth() + 1);
          }
          calDateObj = checkDate;
        }

        const diffTime = calDateObj.getTime() - today.getTime();
        diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const formattedDate = calDateObj ? calDateObj.toLocaleDateString('default', { month: 'short', day: 'numeric' }) : null;
      const typeLabel = cal.type === 'meeting' ? 'Meeting' : cal.type === 'reminder' ? 'Reminder' : 'Calendar Event';

      if (diffDays === 0) {
        items.push({
          id: `cal-today-${cal.id}`,
          category: 'calendar',
          type: 'calendar_today',
          title: cal.title,
          subtitle: `${typeLabel}${cal.startTime ? ` at ${cal.startTime}` : ''} • Today`,
          snippet: cal.description || `Scheduled for today${cal.startTime ? ` at ${cal.startTime}` : ''}.`,
          dueDate: cal.date,
          daysDiff: 0,
          statusText: cal.startTime ? `Today at ${cal.startTime}` : 'Today (All Day)',
          statusColor: 'amber',
          sourceData: cal,
          actionType: 'calendar',
        });
      } else if (diffDays > 0) {
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
      if (ev.status === 'completed' || ev.status === 'closed') return;
      if (ev.date) {
        const evDate = new Date(ev.date + 'T00:00:00');
        evDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((evDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 7) {
          items.push({
            id: `event-milestone-${ev.id}`,
            category: 'event',
            type: 'event_upcoming',
            title: ev.name,
            subtitle: `Project Target • ${ev.date}`,
            snippet: `Target milestone deadline arriving in ${diffDays === 0 ? 'today' : `${diffDays} days`}. Budget: $${(ev.budget || 0).toLocaleString()}`,
            dueDate: ev.date,
            daysDiff: diffDays,
            statusText: diffDays === 0 ? 'Milestone Today' : `Target in ${diffDays}d`,
            statusColor: diffDays === 0 ? 'amber' : 'indigo',
            sourceData: ev,
            actionType: 'planner',
          });
        }
      }
    });

    // --- D. Financial Commitments (Bills & Incomes) ---
    unpaidBills.forEach(bill => {
      const isOverdue = bill.isOverdue || (bill.nextDueDate && new Date(bill.nextDueDate) < today);
      items.push({
        id: `bill-${bill.id}`,
        category: 'financial',
        type: 'bill_due',
        title: bill.name || bill.description || 'Recurring Expense',
        subtitle: `${bill.category || 'Bills & Utilities'} • Due: ${bill.nextDueDate || 'Pending'}`,
        snippet: isOverdue
          ? `Overdue payment commitment of $${(bill.accumulatedOverdue || bill.amount || 0).toLocaleString()}. Action needed.`
          : `Upcoming payment commitment of $${(bill.remainingAmount || bill.amount || 0).toLocaleString()}.`,
        amount: bill.accumulatedOverdue || bill.remainingAmount || bill.amount,
        statusText: isOverdue ? 'Bill Past Due' : 'Bill Due Soon',
        statusColor: isOverdue ? 'rose' : 'amber',
        sourceData: bill,
        actionType: 'bill',
      });
    });

    unconfirmedIncomes.forEach(inc => {
      items.push({
        id: `income-${inc.id}`,
        category: 'financial',
        type: 'income_unconfirmed',
        title: inc.name || inc.description || 'Expected Income',
        subtitle: `${inc.category || 'Income'} • Expected: ${inc.nextExpectedDate || 'Pending'}`,
        snippet: `Pending expected inflow of $${(inc.remainingAmount || inc.amount || 0).toLocaleString()}. Click to confirm deposit.`,
        amount: inc.remainingAmount || inc.amount,
        isIncome: true,
        statusText: 'Pending Inflow Deposit',
        statusColor: 'emerald',
        sourceData: inc,
        actionType: 'income',
      });
    });

    // --- E. Category Budget Warnings ---
    const nowMonth = new Date().getMonth();
    const nowYear = new Date().getFullYear();
    const currentMonthExpenses = transactions.filter(t => {
      if (t.type !== 'expense') return false;
      const d = new Date(t.date);
      return d.getMonth() === nowMonth && d.getFullYear() === nowYear;
    });

    const categorySpending: Record<string, number> = {};
    currentMonthExpenses.forEach(t => {
      categorySpending[t.category] = (categorySpending[t.category] || 0) + Number(t.amount);
    });

    Object.entries(categoryBudgets).forEach(([cat, budget]) => {
      const numBudget = Number(budget) || 0;
      if (numBudget > 0) {
        const spent = categorySpending[cat] || 0;
        const ratio = spent / numBudget;
        if (ratio >= 0.85) {
          const isOver = ratio > 1;
          items.push({
            id: `budget-warn-${cat}`,
            category: 'financial',
            type: 'budget_warning',
            title: `${cat} Budget Limit`,
            subtitle: `${(ratio * 100).toFixed(0)}% Consumed`,
            snippet: isOver
              ? `Exceeded budget by $${(spent - numBudget).toLocaleString()} ($${spent.toLocaleString()} / $${numBudget.toLocaleString()})`
              : `Nearing budget limit: $${spent.toLocaleString()} spent of $${numBudget.toLocaleString()} allowance.`,
            amount: spent,
            statusText: isOver ? 'Budget Exceeded' : 'Budget Warning',
            statusColor: isOver ? 'rose' : 'amber',
            sourceData: { category: cat, spent, budget: numBudget },
            actionType: 'planner',
          });
        }
      }
    });

    // --- F. Gmail Planning Email Notifications ---
    activeGmailNotifications.forEach(g => {
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
  }, [allUserTasks, calendarItems, events, unpaidBills, unconfirmedIncomes, categoryBudgets, transactions, activeGmailNotifications, dismissedIds]);

  // Counts by category
  const counts = useMemo(() => {
    return {
      all: unifiedNotifications.length,
      tasks: unifiedNotifications.filter(i => i.category === 'task').length,
      calendar: unifiedNotifications.filter(i => i.category === 'calendar').length,
      financial: unifiedNotifications.filter(i => i.category === 'financial').length,
      gmail: unifiedNotifications.filter(i => i.category === 'gmail').length,
    };
  }, [unifiedNotifications]);

  // Filtered by current tab & search
  const filteredNotifications = useMemo(() => {
    return unifiedNotifications.filter(item => {
      if (activeFilter === 'tasks' && item.category !== 'task') return false;
      if (activeFilter === 'calendar' && item.category !== 'calendar') return false;
      if (activeFilter === 'financial' && item.category !== 'financial') return false;
      if (activeFilter === 'gmail' && item.category !== 'gmail') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSub = item.subtitle?.toLowerCase().includes(q);
        const matchesSnip = item.snippet?.toLowerCase().includes(q);
        return matchesTitle || matchesSub || matchesSnip;
      }
      return true;
    });
  }, [unifiedNotifications, activeFilter, searchQuery]);

  const handleItemAction = (item: UnifiedNotificationItem) => {
    if (item.actionType === 'task') {
      const data = item.sourceData;
      if (onNavigateToTask && data?.taskId) {
        onNavigateToTask(data.taskId, data.projectId);
      } else if (onNavigateToPlanner) {
        onNavigateToPlanner();
      }
    } else if (item.actionType === 'calendar') {
      if (onNavigateToCalendar) {
        onNavigateToCalendar();
      } else if (onNavigateToPlanner) {
        onNavigateToPlanner();
      }
    } else if (item.actionType === 'bill') {
      setActivePaymentModal({ item: item.sourceData, isIncome: false });
      const rem = item.sourceData.remainingAmount ?? item.sourceData.amount ?? 0;
      setPaymentAmount(typeof rem === 'number' ? rem.toFixed(2) : String(rem));
    } else if (item.actionType === 'income') {
      const isSalary = (item.sourceData?.category || '').toLowerCase().includes('salary');
      const defaultDest = isSalary ? bankConnections[0]?.institution || 'Cash in Hand' : 'Cash in Hand';
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

  const handleDismissItem = (id: string, e: React.MouseEvent, item?: UnifiedNotificationItem) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set(prev).add(id));
    if (id.startsWith('gmail-') || item?.category === 'gmail') {
      const cleanId = id.replace(/^gmail-/, '');
      triggerDismissEmail(cleanId);
    }
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

        {/* Search & Gmail Status Bar */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search alerts..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition text-stone-800 placeholder-slate-400"
            />
          </div>

          {isGmailConnected ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Gmail Synced
              </span>
              <button
                type="button"
                onClick={() => triggerFetchGmail(false)}
                disabled={isGmailLoading}
                title="Sync Live Gmail Alerts"
                className="p-1.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-lg text-xs transition shadow-xs disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={13} className={isGmailLoading ? 'animate-spin text-indigo-600' : ''} />
                <span className="text-[10px] font-bold hidden sm:inline">Sync</span>
              </button>
              <button
                type="button"
                onClick={triggerDisconnectGmail}
                disabled={isGmailLoading}
                title="Disconnect Google Gmail"
                className="p-1.5 bg-white hover:bg-rose-50 hover:border-rose-200 border border-stone-200 text-stone-400 hover:text-rose-600 rounded-lg text-xs transition shadow-xs disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={triggerConnectGmail}
              disabled={isGmailLoading}
              title="Connect Gmail using Google OAuth"
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              {isGmailLoading ? <RefreshCw size={13} className="animate-spin" /> : <Mail size={13} />}
              <span className="text-[11px]">Connect Gmail</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-stone-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'all' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <span>All Alerts</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[9px] ${
              activeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-700'
            }`}
          >
            {counts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('tasks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'tasks' ? 'bg-indigo-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <ListTodo size={13} />
          <span>Tasks &amp; Milestones</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[9px] ${
              activeFilter === 'tasks' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
            }`}
          >
            {counts.tasks}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('calendar')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'calendar' ? 'bg-purple-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <CalendarIcon size={13} />
          <span>Calendar</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[9px] ${
              activeFilter === 'calendar' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'
            }`}
          >
            {counts.calendar}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('financial')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'financial' ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <DollarSign size={13} />
          <span>Financial Commitments</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[9px] ${
              activeFilter === 'financial' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {counts.financial}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('gmail')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'gmail' ? 'bg-blue-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <Mail size={13} />
          <span>Gmail Updates</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[9px] ${
              activeFilter === 'gmail' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
            }`}
          >
            {counts.gmail}
          </span>
        </button>
      </div>

      {/* Main Alert List */}
      <div className="p-4 sm:p-5">
        {/* Gmail Connect Banner if filter is 'gmail' and not connected */}
        {activeFilter === 'gmail' && !isGmailConnected && (
          <div className="p-5 mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Mail size={20} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-stone-900">Connect Google for Live Gmail Planning Alerts</h4>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  Secure connection reusing your existing Google OAuth session to automatically pull unread planning headers and match them with tasks.
                </p>
                {gmailErrorMessage && (
                  <p className="text-[10px] text-rose-600 mt-1 font-semibold flex items-center gap-1">
                    <AlertCircle size={11} /> {gmailErrorMessage}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={triggerConnectGmail}
              disabled={isGmailLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              {isGmailLoading ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
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
                : activeFilter === 'gmail' && !isGmailConnected
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
                        type="button"
                        onClick={e => handleDismissItem(item.id, e, item)}
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
                      <p className="text-[10px] font-medium text-stone-500 mt-0.5 line-clamp-1">{item.subtitle}</p>
                    )}

                    {/* Snippet */}
                    {item.snippet && (
                      <p
                        className={`text-[11px] text-stone-600 mt-1.5 line-clamp-2 leading-relaxed bg-stone-50 p-2 rounded-lg border border-stone-100 font-mono text-[10px] ${
                          item.category === 'financial' ? 'font-tabular privacy-sensitive' : ''
                        }`}
                      >
                        {item.snippet}
                      </p>
                    )}
                  </div>

                  {/* Bottom Action bar */}
                  <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
                    {item.amount !== undefined ? (
                      <span className="text-xs font-bold text-stone-900 font-tabular privacy-sensitive">
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
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    activePaymentModal.isIncome
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      : 'bg-rose-50 text-rose-600 border border-rose-100'
                  }`}
                >
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
                type="button"
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
                  <p className="text-xs font-black text-indigo-600 font-tabular privacy-sensitive">
                    $
                    {(activePaymentModal.item.remainingAmount ?? activePaymentModal.item.amount ?? 0).toFixed
                      ? (activePaymentModal.item.remainingAmount ?? activePaymentModal.item.amount ?? 0).toFixed(2)
                      : activePaymentModal.item.remainingAmount ?? activePaymentModal.item.amount}
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      selectedDestination === 'Cash in Hand'
                        ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    Cash In Hand
                  </button>
                  {bankConnections.map(conn => (
                    <button
                      type="button"
                      key={conn.institution}
                      onClick={() => setSelectedDestination(conn.institution)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        selectedDestination === conn.institution
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
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
        onMarkAsRead={handleReadGmail}
      />
    </section>
  );
};
