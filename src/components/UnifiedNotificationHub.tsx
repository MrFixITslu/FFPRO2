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
  Tag
} from 'lucide-react';
import { BudgetEvent, CalendarItem, Transaction, GmailPlanningNotification } from '../types';
import { 
  auth, 
  signInWithGooglePopup, 
  getFirebaseAccessToken, 
  setFirebaseAccessToken,
  fetchDirectGmailNotifications,
  markDirectGmailAsRead
} from '../services/firebaseAuth';

export type NotificationCategory = 'all' | 'tasks' | 'financial' | 'gmail';

export interface UnifiedNotificationItem {
  id: string;
  category: 'task' | 'financial' | 'gmail' | 'event';
  type: 'task_overdue' | 'task_today' | 'task_upcoming' | 'task_priority' | 'bill_due' | 'income_unconfirmed' | 'budget_warning' | 'gmail_email' | 'event_upcoming';
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
  actionType: 'task' | 'bill' | 'income' | 'gmail' | 'planner';
}

interface Props {
  userEmail?: string;
  events?: BudgetEvent[];
  calendarItems?: CalendarItem[];
  unpaidBills?: any[];
  unconfirmedIncomes?: any[];
  categoryBudgets?: Record<string, number>;
  transactions?: Transaction[];
  onNavigateToTask?: (taskId: string, projectId?: string | null) => void;
  onNavigateToPlanner?: () => void;
  onPayRecurring?: (item: any, amount: number) => void;
  onReceiveRecurringIncome?: (item: any, amount: number, dest: string) => void;
  onOpenTransactionForm?: () => void;
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
  onNavigateToTask,
  onNavigateToPlanner,
  onPayRecurring,
  onReceiveRecurringIncome,
  onOpenTransactionForm,
}) => {
  const [activeFilter, setActiveFilter] = useState<NotificationCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Gmail-specific state
  const isGmailAuthorized = (userEmail || '').trim().toLowerCase() === AUTHORIZED_GMAIL.toLowerCase();
  const [gmailNotifications, setGmailNotifications] = useState<GmailPlanningNotification[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [lastGmailSync, setLastGmailSync] = useState<Date | null>(null);

  // Quick action state for bill/income
  const [activePaymentModal, setActivePaymentModal] = useState<{ item: any; isIncome: boolean } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');

  // 1. Compile all user tasks for matching & notifications
  const allUserTasks = useMemo(() => {
    const list: { taskId: string; taskTitle: string; projectName: string; projectId: string | null; task: any }[] = [];
    events.forEach(ev => {
      if (Array.isArray(ev.tasks)) {
        ev.tasks.forEach(t => {
          if (t && t.id && t.text) {
            list.push({
              taskId: String(t.id),
              taskTitle: t.text,
              projectName: ev.name || 'Planner Event',
              projectId: String(ev.id),
              task: t,
            });
          }
        });
      }
    });
    return list;
  }, [events]);

  // 2. Fetch Gmail Notifications via server proxy OR direct client token
  const fetchGmail = useCallback(async (isSilent = false) => {
    if (!isGmailAuthorized) return;

    if (!isSilent) setGmailLoading(true);
    setGmailError(null);

    const clientToken = getFirebaseAccessToken();

    try {
      // First attempt: Call /api/gmail/notifications with session or client bearer token
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (clientToken) {
        headers['Authorization'] = `Bearer ${clientToken}`;
      }

      const res = await fetch('/api/gmail/notifications', {
        credentials: 'include',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        setGmailNotifications(data.notifications || []);
        setGmailConnected(true);
        setLastGmailSync(new Date());
        return;
      }

      // If server returned 401 and we have client token, try direct Gmail REST fetch
      if (clientToken) {
        try {
          const directNotes = await fetchDirectGmailNotifications(clientToken, allUserTasks);
          setGmailNotifications(directNotes);
          setGmailConnected(true);
          setLastGmailSync(new Date());
          return;
        } catch (directErr) {
          console.warn('Direct Gmail fetch fallback failed:', directErr);
        }
      }

      // If not connected
      if (res.status === 401 || res.status === 403) {
        setGmailConnected(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        setGmailError(errData.error || 'Gmail notifications temporarily unavailable');
      }
    } catch (err: any) {
      console.warn('Gmail fetch error:', err);
      // Try direct if client token exists
      if (clientToken) {
        try {
          const directNotes = await fetchDirectGmailNotifications(clientToken, allUserTasks);
          setGmailNotifications(directNotes);
          setGmailConnected(true);
          setLastGmailSync(new Date());
          return;
        } catch (e) {
          setGmailError('Unable to connect to Gmail service');
        }
      } else {
        setGmailConnected(false);
      }
    } finally {
      if (!isSilent) setGmailLoading(false);
    }
  }, [isGmailAuthorized, allUserTasks]);

  // Initial Gmail sync check
  useEffect(() => {
    if (isGmailAuthorized) {
      fetchGmail(true);
    }
  }, [isGmailAuthorized, fetchGmail]);

  // Handle Google Sign-in with Firebase Popup
  const handleGooglePopupConnect = async () => {
    setGmailLoading(true);
    setGmailError(null);
    try {
      const res = await signInWithGooglePopup();
      if (res && res.accessToken) {
        setFirebaseAccessToken(res.accessToken);
        setGmailConnected(true);
        await fetchGmail(false);
      }
    } catch (err: any) {
      console.error('Google sign-in popup error:', err);
      setGmailError(err?.message || 'Google authentication was not completed.');
    } finally {
      setGmailLoading(false);
    }
  };

  // Mark Gmail as read
  const handleDismissGmail = async (messageId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDismissedIds(prev => new Set(prev).add(`gmail-${messageId}`));
    
    // Optimistic removal
    setGmailNotifications(prev => prev.filter(g => g.id !== messageId));

    const token = getFirebaseAccessToken();
    if (token) {
      markDirectGmailAsRead(messageId, token).catch(() => {});
    }
    fetch('/api/gmail/mark-read', {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ messageId }),
    }).catch(() => {});
  };

  // 3. Build unified notifications list
  const unifiedNotifications = useMemo(() => {
    const items: UnifiedNotificationItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- A. Task Notifications from Events/Projects ---
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
      }
    });

    // --- B. Calendar & Event Milestones ---
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
            category: 'event',
            type: 'event_upcoming',
            title: ev.name,
            subtitle: `${ev.eventType ? ev.eventType.toUpperCase() : 'EVENT'} • ${diffDays === 0 ? 'Today' : `in ${diffDays} days`}`,
            snippet: `Target Date: ${formattedDate} • ${ev.tasks?.length || 0} tasks tracked.`,
            dueDate: ev.date,
            daysDiff: diffDays,
            statusText: diffDays === 0 ? 'Event Today' : `Event in ${diffDays}d`,
            statusColor: 'purple',
            sourceData: { projectId: ev.id, event: ev },
            actionType: 'planner',
          });
        }
      }
    });

    // --- C. Financial Reminders (Unpaid Bills & Incomes) ---
    unpaidBills.forEach(bill => {
      const dueDate = new Date(bill.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const formattedDate = dueDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });

      if (diffDays <= 7) {
        items.push({
          id: `bill-${bill.id}`,
          category: 'financial',
          type: 'bill_due',
          title: bill.description,
          subtitle: `Recurring Expense • ${bill.category}`,
          snippet: `Amount: $${bill.remainingAmount.toLocaleString()} • Due ${formattedDate}`,
          amount: bill.remainingAmount,
          dueDate: bill.nextDueDate,
          daysDiff: diffDays,
          isIncome: false,
          statusText: diffDays < 0 ? `Overdue by ${Math.abs(diffDays)}d` : diffDays === 0 ? 'Bill Due Today' : `Due in ${diffDays}d (${formattedDate})`,
          statusColor: diffDays <= 0 ? 'rose' : 'amber',
          sourceData: bill,
          actionType: 'bill',
        });
      }
    });

    unconfirmedIncomes.forEach(inc => {
      const confDate = new Date(inc.nextConfirmationDate);
      confDate.setHours(0, 0, 0, 0);
      const diffTime = confDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const formattedDate = confDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });

      if (diffDays <= 7) {
        items.push({
          id: `income-${inc.id}`,
          category: 'financial',
          type: 'income_unconfirmed',
          title: inc.description,
          subtitle: `Expected Inflow • ${inc.category}`,
          snippet: `Amount: +$${inc.remainingAmount.toLocaleString()} • Scheduled ${formattedDate}`,
          amount: inc.remainingAmount,
          dueDate: inc.nextConfirmationDate,
          daysDiff: diffDays,
          isIncome: true,
          statusText: diffDays <= 0 ? 'Confirmation Ready' : `Expected in ${diffDays}d`,
          statusColor: 'emerald',
          sourceData: inc,
          actionType: 'income',
        });
      }
    });

    // --- D. Budget Alerts (>90% threshold) ---
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

    // --- E. Gmail Email Planning Notifications ---
    gmailNotifications.forEach(g => {
      items.push({
        id: `gmail-${g.id}`,
        category: 'gmail',
        type: 'gmail_email',
        title: g.subject || '(No Subject)',
        subtitle: `From: ${g.from}${g.taskReference ? ` • Linked: ${g.taskReference.taskTitle}` : ''}`,
        snippet: g.snippet,
        timestamp: g.date,
        statusText: g.taskReference ? 'Linked to Task' : 'Unread Planning Email',
        statusColor: 'blue',
        sourceData: g,
        actionType: 'gmail',
      });
    });

    // Filter out dismissed items
    return items.filter(it => !dismissedIds.has(it.id));
  }, [allUserTasks, events, unpaidBills, unconfirmedIncomes, categoryBudgets, transactions, gmailNotifications, dismissedIds]);

  // Counts by category
  const counts = useMemo(() => {
    return {
      all: unifiedNotifications.length,
      tasks: unifiedNotifications.filter(n => n.category === 'task' || n.category === 'event').length,
      financial: unifiedNotifications.filter(n => n.category === 'financial').length,
      gmail: unifiedNotifications.filter(n => n.category === 'gmail').length,
    };
  }, [unifiedNotifications]);

  // Filter and search
  const filteredNotifications = useMemo(() => {
    return unifiedNotifications.filter(item => {
      if (activeFilter === 'tasks' && item.category !== 'task' && item.category !== 'event') return false;
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
    } else if (item.actionType === 'bill') {
      setActivePaymentModal({ item: item.sourceData, isIncome: false });
      setPaymentAmount(String(item.sourceData.remainingAmount || ''));
    } else if (item.actionType === 'income') {
      setActivePaymentModal({ item: item.sourceData, isIncome: true });
      setPaymentAmount(String(item.sourceData.remainingAmount || ''));
    } else if (item.actionType === 'gmail') {
      const g = item.sourceData as GmailPlanningNotification;
      if (g?.taskReference?.taskId && onNavigateToTask) {
        handleDismissGmail(g.id);
        onNavigateToTask(g.taskReference.taskId, g.taskReference.projectId);
      } else if (onNavigateToPlanner) {
        handleDismissGmail(g.id);
        onNavigateToPlanner();
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
    const amt = parseFloat(paymentAmount) || activePaymentModal.item.remainingAmount;
    if (activePaymentModal.isIncome && onReceiveRecurringIncome) {
      onReceiveRecurringIncome(activePaymentModal.item, amt, 'Cash in Hand');
    } else if (!activePaymentModal.isIncome && onPayRecurring) {
      onPayRecurring(activePaymentModal.item, amt);
    }
    setActivePaymentModal(null);
    setPaymentAmount('');
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
            <Bell size={18} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm tracking-tight">Active Notifications &amp; Planning Intelligence</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                {counts.all} Active
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Unified priority feed: tasks, overdue commitments, financial milestones &amp; email alerts
            </p>
          </div>
        </div>

        {/* Sync & Search Controls */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <div className="relative flex-1 sm:w-48">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter alerts..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition text-slate-800 placeholder-slate-400"
            />
          </div>

          {isGmailAuthorized && (
            <button
              onClick={() => fetchGmail(false)}
              disabled={gmailLoading}
              title="Refresh Notifications & Gmail Sync"
              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw size={14} className={gmailLoading ? 'animate-spin text-indigo-600' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>All Alerts</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('tasks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'tasks'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ListTodo size={13} />
          <span>Tasks &amp; Planner</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'tasks' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
            {counts.tasks}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('financial')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
            activeFilter === 'financial'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign size={13} />
          <span>Financial Reminders</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'financial' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
            {counts.financial}
          </span>
        </button>

        {isGmailAuthorized && (
          <button
            onClick={() => setActiveFilter('gmail')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeFilter === 'gmail'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Mail size={13} />
            <span>Gmail Updates</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${activeFilter === 'gmail' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
              {counts.gmail}
            </span>
          </button>
        )}
      </div>

      {/* Main Alert List */}
      <div className="p-4 sm:p-5">
        {/* Gmail Connect Banner if filter is 'gmail' and not connected */}
        {activeFilter === 'gmail' && !gmailConnected && isGmailAuthorized && (
          <div className="p-5 mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Mail size={20} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Connect Google for Live Gmail Planning Headers</h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Secure popup connection for <strong>{AUTHORIZED_GMAIL}</strong> to automatically pull unread planning headers and match them with tasks.
                </p>
              </div>
            </div>
            <button
              onClick={handleGooglePopupConnect}
              disabled={gmailLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              {gmailLoading ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
              <span>Connect via Google Popup</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {filteredNotifications.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
              <CheckCircle2 size={20} />
            </div>
            <h4 className="text-xs font-bold text-slate-700">All clear! No pending notifications</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {searchQuery ? 'No alerts match your filter query.' : 'You are completely caught up on tasks, recurring commitments, and alerts.'}
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
                bill_due: <Receipt size={14} className={item.statusColor === 'rose' ? 'text-rose-600' : 'text-amber-600'} />,
                income_unconfirmed: <TrendingUp size={14} className="text-emerald-600" />,
                budget_warning: <AlertTriangle size={14} className="text-amber-600" />,
                gmail_email: <Mail size={14} className="text-blue-600" />,
                event_upcoming: <CalendarIcon size={14} className="text-purple-600" />,
              }[item.type];

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemAction(item)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition bg-white flex flex-col justify-between cursor-pointer group"
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
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
                        title="Dismiss notification"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {/* Title & Subtitle */}
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition line-clamp-1">
                      {item.title}
                    </h4>
                    {item.subtitle && (
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5 line-clamp-1">
                        {item.subtitle}
                      </p>
                    )}

                    {/* Snippet */}
                    {item.snippet && (
                      <p className="text-[11px] text-slate-600 mt-1.5 line-clamp-2 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100 font-mono text-[10px]">
                        {item.snippet}
                      </p>
                    )}
                  </div>

                  {/* Bottom Action bar */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    {item.amount !== undefined ? (
                      <span className="text-xs font-bold text-slate-900">
                        {item.isIncome ? '+' : ''}${item.amount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {item.category.toUpperCase()}
                      </span>
                    )}

                    <span className="text-[10px] font-bold text-indigo-600 group-hover:translate-x-0.5 transition flex items-center gap-1">
                      <span>
                        {item.actionType === 'task' ? 'Open Task' : item.actionType === 'bill' ? 'Pay Bill' : item.actionType === 'income' ? 'Receive' : 'View'}
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
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                {activePaymentModal.isIncome ? 'Confirm Received Income' : 'Clear Recurring Commitment'}
              </h3>
              <button
                onClick={() => setActivePaymentModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              {activePaymentModal.item.description} ({activePaymentModal.item.category})
            </p>

            <div className="mb-4">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Amount ($)
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActivePaymentModal(null)}
                className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmModalPayment}
                className={`flex-1 py-2 text-xs font-bold text-white rounded-lg transition ${
                  activePaymentModal.isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                Confirm &amp; Record
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
