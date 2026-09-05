import { useState, useEffect, useMemo, useCallback } from 'react';
import { BudgetEvent, CalendarItem, RecurringExpense, RecurringIncome, GmailPlanningNotification } from '../types';
import { badgeService } from '../services/badgeService';
import { realtimeService } from '../services/realtimeService';

export interface NotificationBreakdown {
  tasks: number;
  calendar: number;
  financial: number;
  gmail: number;
  total: number;
}

export function useNotificationBadge(
  events: BudgetEvent[] = [],
  calendarItems: CalendarItem[] = [],
  recurringExpenses: RecurringExpense[] = [],
  recurringIncomes: RecurringIncome[] = [],
  activeUnreadEmails: GmailPlanningNotification[] = [],
  dismissedIds: string[] = []
) {
  const [syncedUnreadCount, setSyncedUnreadCount] = useState<number>(() => badgeService.getCount());
  const dismissedSet = useMemo(() => new Set(dismissedIds), [dismissedIds]);

  // Calculate unread counts from active local data
  const breakdown = useMemo<NotificationBreakdown>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Tasks: Overdue or Due Today in active projects
    let taskCount = 0;
    events.forEach(ev => {
      if (ev.status === 'closed') return;
      if (Array.isArray(ev.tasks)) {
        ev.tasks.forEach(t => {
          if (!t || t.completed || dismissedSet.has(`task-${t.id}`)) return;

          if (t.dueDate) {
            const due = new Date(t.dueDate + 'T00:00:00');
            due.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) {
              taskCount++;
            }
          } else if (t.priority === 'urgent') {
            taskCount++;
          }

          // Check subtasks
          if (Array.isArray(t.subTasks)) {
            t.subTasks.forEach(st => {
              if (!st || st.completed || dismissedSet.has(`task-${st.id}`)) return;
              if (st.dueDate) {
                const subDue = new Date(st.dueDate + 'T00:00:00');
                subDue.setHours(0, 0, 0, 0);
                const subDiff = Math.ceil((subDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (subDiff <= 0) {
                  taskCount++;
                }
              }
            });
          }
        });
      }
    });

    // 2. Calendar: Overdue or Due Today
    let calendarCount = 0;
    calendarItems.forEach(cal => {
      if (!cal || cal.completed || dismissedSet.has(`cal-${cal.id}`)) return;
      if (cal.date) {
        const calDate = new Date(cal.date + 'T00:00:00');
        calDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((calDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) {
          calendarCount++;
        }
      }
    });

    // 3. Financial: Overdue bills / commitments
    let financialCount = 0;
    recurringExpenses.forEach(exp => {
      if (!exp || dismissedSet.has(`bill-${exp.id}`)) return;
      if ((exp.accumulatedOverdue && exp.accumulatedOverdue > 0) || (exp.nextDueDate && new Date(exp.nextDueDate) < today)) {
        financialCount++;
      }
    });

    // 4. Gmail unread
    let gmailCount = 0;
    activeUnreadEmails.forEach(mail => {
      if (!mail || dismissedSet.has(`gmail-${mail.id}`) || dismissedSet.has(mail.id)) return;
      if (mail.isUnread) {
        gmailCount++;
      }
    });

    const total = taskCount + calendarCount + financialCount + gmailCount;

    return {
      tasks: taskCount,
      calendar: calendarCount,
      financial: financialCount,
      gmail: gmailCount,
      total
    };
  }, [events, calendarItems, recurringExpenses, recurringIncomes, activeUnreadEmails, dismissedSet]);

  // Synchronize with BadgeService whenever local breakdown changes
  useEffect(() => {
    badgeService.setBadge(breakdown.total);
    setSyncedUnreadCount(breakdown.total);

    // Sync to backend via lightweight POST with debounce
    const timer = setTimeout(() => {
      fetch('/api/notifications/sync-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          unreadCount: breakdown.total,
          breakdown
        })
      }).catch(() => {});
    }, 1000);

    return () => clearTimeout(timer);
  }, [breakdown]);

  // Subscribe to real-time updates from other sessions / devices
  useEffect(() => {
    // 1. Subscribe to local badge service events
    const unsubBadge = badgeService.subscribe((count) => {
      setSyncedUnreadCount(count);
    });

    // 2. Subscribe to realtime SSE stream notifications_updated
    const unsubRealtime = realtimeService.on('notifications_updated' as any, (payload: any) => {
      if (payload && typeof payload.unreadCount === 'number') {
        badgeService.setBadge(payload.unreadCount, false);
        setSyncedUnreadCount(payload.unreadCount);
      }
    });

    return () => {
      unsubBadge();
      unsubRealtime();
    };
  }, []);

  const badgeLabel = useMemo(() => {
    return badgeService.formatBadgeCount(syncedUnreadCount);
  }, [syncedUnreadCount]);

  const clearBadge = useCallback(() => {
    badgeService.clearBadge();
    setSyncedUnreadCount(0);
  }, []);

  return {
    unreadCount: syncedUnreadCount,
    badgeLabel,
    breakdown,
    clearBadge,
    formatCount: badgeService.formatBadgeCount
  };
}
