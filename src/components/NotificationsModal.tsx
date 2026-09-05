import React from 'react';
import { X, Bell, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { UnifiedNotificationHub } from './UnifiedNotificationHub';
import { BudgetEvent, CalendarItem, Transaction, RecurringExpense, RecurringIncome, BankConnection, GmailPlanningNotification } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  events: BudgetEvent[];
  calendarItems: CalendarItem[];
  recurringExpenses: RecurringExpense[];
  recurringIncomes: RecurringIncome[];
  categoryBudgets: Record<string, number>;
  transactions: Transaction[];
  bankConnections: BankConnection[];
  unreadCount: number;
  badgeLabel: string;
  onNavigateToTask?: (taskId: string, projectId?: string | null) => void;
  onNavigateToPlanner?: () => void;
  onNavigateToCalendar?: () => void;
  onPayRecurring?: (item: any, amount: number) => void;
  onReceiveRecurringIncome?: (item: any, amount: number, dest: string) => void;
  onOpenTransactionForm?: () => void;
  onSelectEmailModal?: (email: GmailPlanningNotification) => void;
  onDismissEmail?: (emailId: string) => void;
  externalDismissedIds?: string[];
}

export const NotificationsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  userEmail,
  events,
  calendarItems,
  recurringExpenses,
  recurringIncomes,
  categoryBudgets,
  transactions,
  bankConnections,
  unreadCount,
  badgeLabel,
  onNavigateToTask,
  onNavigateToPlanner,
  onNavigateToCalendar,
  onPayRecurring,
  onReceiveRecurringIncome,
  onOpenTransactionForm,
  onSelectEmailModal,
  onDismissEmail,
  externalDismissedIds = []
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-stone-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                  {badgeLabel}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-900 tracking-tight">Notification Center</h2>
                {unreadCount > 0 ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-rose-50 text-rose-700 border border-rose-200/80">
                    {unreadCount} Unread
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
                    <CheckCircle2 size={11} /> All Caught Up
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 font-medium">
                Live badge sync across your mobile home screen, browser tab, and active devices.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 flex items-center justify-center transition"
            title="Close Notifications"
            aria-label="Close Notifications"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-stone-50/40">
          <UnifiedNotificationHub
            userEmail={userEmail}
            events={events}
            calendarItems={calendarItems}
            unpaidBills={recurringExpenses}
            unconfirmedIncomes={recurringIncomes}
            categoryBudgets={categoryBudgets}
            transactions={transactions}
            bankConnections={bankConnections}
            onNavigateToTask={(taskId, projectId) => {
              onClose();
              if (onNavigateToTask) onNavigateToTask(taskId, projectId);
            }}
            onNavigateToPlanner={() => {
              onClose();
              if (onNavigateToPlanner) onNavigateToPlanner();
            }}
            onPayRecurring={onPayRecurring}
            onReceiveRecurringIncome={onReceiveRecurringIncome}
            onOpenTransactionForm={() => {
              onClose();
              if (onOpenTransactionForm) onOpenTransactionForm();
            }}
            onSelectEmailModal={onSelectEmailModal}
            onDismissEmail={onDismissEmail}
            externalDismissedIds={externalDismissedIds}
          />
        </div>
      </div>
    </div>
  );
};
