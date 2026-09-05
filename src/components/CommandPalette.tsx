import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LayoutDashboard,
  Calendar as CalendarIcon,
  Zap,
  TrendingUp,
  Landmark,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Bell,
  Settings as SettingsIcon,
  Keyboard,
  ArrowRight,
  Receipt,
  FolderKanban,
  CheckCircle2,
  X
} from 'lucide-react';
import { Transaction, BudgetEvent } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenNewTransaction: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onForceSync: () => void;
  privacyMode: boolean;
  onTogglePrivacyMode: () => void;
  transactions: Transaction[];
  events: BudgetEvent[];
  onSelectTransaction?: (transaction: Transaction) => void;
  onSelectEvent?: (eventId: string) => void;
}

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Transactions' | 'Projects';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string[];
  action: () => void;
}

export const CommandPalette: React.FC<Props> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  onOpenNewTransaction,
  onOpenNotifications,
  onOpenSettings,
  onOpenShortcuts,
  onForceSync,
  privacyMode,
  onTogglePrivacyMode,
  transactions,
  events,
  onSelectTransaction,
  onSelectEvent
}) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const items: CommandItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: CommandItem[] = [];

    // Navigation items
    const navItems: CommandItem[] = [
      {
        id: 'nav-dashboard',
        category: 'Navigation',
        title: 'Go to Command Center (Dashboard)',
        subtitle: 'Executive metrics, cashflow intelligence and audit statement',
        icon: <LayoutDashboard size={16} className="text-stone-700" />,
        shortcut: ['⌘', '1'],
        action: () => {
          onSelectTab('dashboard');
          onClose();
        }
      },
      {
        id: 'nav-calendar',
        category: 'Navigation',
        title: 'Go to Strategic Calendar',
        subtitle: 'Cashflow timeline, paydays, recurring bills and scheduled commitments',
        icon: <CalendarIcon size={16} className="text-stone-700" />,
        shortcut: ['⌘', '2'],
        action: () => {
          onSelectTab('calendar');
          onClose();
        }
      },
      {
        id: 'nav-planner',
        category: 'Navigation',
        title: 'Go to Project & Event Planner',
        subtitle: 'Suites, Kanban tasks, collaborative workspaces and budgets',
        icon: <Zap size={16} className="text-stone-700" />,
        shortcut: ['⌘', '3'],
        action: () => {
          onSelectTab('events');
          onClose();
        }
      },
      {
        id: 'nav-projections',
        category: 'Navigation',
        title: 'Go to Wealth Forecast & Projections',
        subtitle: 'Monte Carlo models, investment growth scenarios and retirement horizon',
        icon: <TrendingUp size={16} className="text-stone-700" />,
        shortcut: ['⌘', '4'],
        action: () => {
          onSelectTab('projections');
          onClose();
        }
      },
      {
        id: 'nav-funding',
        category: 'Navigation',
        title: 'Go to Funding Finder',
        subtitle: 'Institutional grants, venture financing and capital search',
        icon: <Landmark size={16} className="text-stone-700" />,
        shortcut: ['⌘', '5'],
        action: () => {
          onSelectTab('funding');
          onClose();
        }
      }
    ];

    // Quick Actions
    const actionItems: CommandItem[] = [
      {
        id: 'act-new-tx',
        category: 'Actions',
        title: 'Add New Transaction',
        subtitle: 'Log an income or expense with category and institution',
        icon: <Plus size={16} className="text-emerald-600" />,
        shortcut: ['N'],
        action: () => {
          onClose();
          onOpenNewTransaction();
        }
      },
      {
        id: 'act-toggle-privacy',
        category: 'Actions',
        title: privacyMode ? 'Disable Financial Privacy Mode' : 'Enable Financial Privacy Mode',
        subtitle: privacyMode ? 'Show sensitive monetary amounts' : 'Mask sensitive figures with dots for public working',
        icon: privacyMode ? <Eye size={16} className="text-amber-600" /> : <EyeOff size={16} className="text-stone-600" />,
        shortcut: ['P'],
        action: () => {
          onTogglePrivacyMode();
          onClose();
        }
      },
      {
        id: 'act-sync-cloud',
        category: 'Actions',
        title: 'Synchronize Data with Cloud',
        subtitle: 'Push local ledger updates and pull remote changes immediately',
        icon: <RefreshCw size={16} className="text-indigo-600" />,
        shortcut: ['S'],
        action: () => {
          onForceSync();
          onClose();
        }
      },
      {
        id: 'act-notifications',
        category: 'Actions',
        title: 'Open Notification Center',
        subtitle: 'Review task deadlines, overdue bills and planning reminders',
        icon: <Bell size={16} className="text-rose-600" />,
        action: () => {
          onClose();
          onOpenNotifications();
        }
      },
      {
        id: 'act-shortcuts',
        category: 'Actions',
        title: 'View Keyboard Shortcuts Guide',
        subtitle: 'Master keybindings for fast command operations',
        icon: <Keyboard size={16} className="text-stone-600" />,
        shortcut: ['?'],
        action: () => {
          onClose();
          onOpenShortcuts();
        }
      },
      {
        id: 'act-settings',
        category: 'Actions',
        title: 'Open System Settings',
        subtitle: 'Manage local vault backup, account credentials and preferences',
        icon: <SettingsIcon size={16} className="text-stone-600" />,
        action: () => {
          onClose();
          onOpenSettings();
        }
      }
    ];

    // Filter Navigation & Actions
    if (!q) {
      result.push(...actionItems);
      result.push(...navItems);
    } else {
      const matchedActions = actionItems.filter(
        item => item.title.toLowerCase().includes(q) || (item.subtitle && item.subtitle.toLowerCase().includes(q))
      );
      const matchedNav = navItems.filter(
        item => item.title.toLowerCase().includes(q) || (item.subtitle && item.subtitle.toLowerCase().includes(q))
      );
      result.push(...matchedActions);
      result.push(...matchedNav);

      // Search matching Transactions
      const matchedTx = transactions
        .filter(t => {
          return (
            (t.description && t.description.toLowerCase().includes(q)) ||
            (t.category && t.category.toLowerCase().includes(q)) ||
            (t.institution && t.institution.toLowerCase().includes(q)) ||
            (t.notes && t.notes.toLowerCase().includes(q)) ||
            String(t.amount).includes(q)
          );
        })
        .slice(0, 6)
        .map((t): CommandItem => ({
          id: `tx-${t.id}`,
          category: 'Transactions',
          title: t.description || 'Transaction',
          subtitle: `${t.type === 'expense' ? '-' : '+'}$${t.amount.toLocaleString()} • ${t.category} • ${t.date || 'No date'}`,
          icon: <Receipt size={16} className={t.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'} />,
          action: () => {
            onClose();
            if (onSelectTransaction) {
              onSelectTransaction(t);
            }
          }
        }));

      result.push(...matchedTx);

      // Search matching Projects / Events
      const matchedEvents = events
        .filter(e => {
          return (
            (e.name && e.name.toLowerCase().includes(q)) ||
            (e.description && e.description.toLowerCase().includes(q)) ||
            (e.tasks && e.tasks.some(task => task.title.toLowerCase().includes(q)))
          );
        })
        .slice(0, 5)
        .map((e): CommandItem => ({
          id: `ev-${e.id}`,
          category: 'Projects',
          title: e.name || 'Project Suite',
          subtitle: `${e.tasks?.length || 0} tasks • ${e.status || 'Active'} • ${e.date || 'Ongoing'}`,
          icon: <FolderKanban size={16} className="text-indigo-500" />,
          action: () => {
            onClose();
            onSelectTab('events');
            if (onSelectEvent) {
              onSelectEvent(e.id);
            }
          }
        }));

      result.push(...matchedEvents);
    }

    return result;
  }, [
    search,
    activeTab,
    privacyMode,
    transactions,
    events,
    onSelectTab,
    onOpenNewTransaction,
    onOpenNotifications,
    onOpenSettings,
    onOpenShortcuts,
    onForceSync,
    onTogglePrivacyMode,
    onSelectTransaction,
    onSelectEvent,
    onClose
  ]);

  // Adjust selected index bounds
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // Keyboard navigation within the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[230] flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4 bg-stone-900/60 backdrop-blur-xs"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -12 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-stone-200/90 overflow-hidden flex flex-col max-h-[80vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Input Header */}
          <div className="flex items-center px-4 sm:px-5 py-3.5 border-b border-stone-200 bg-stone-50/70 gap-3">
            <Search size={18} className="text-stone-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a command, jump to a view, or search transactions & projects..."
              className="flex-1 bg-transparent text-sm sm:text-base text-stone-900 placeholder:text-stone-400 font-medium outline-none border-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-md transition"
              >
                <X size={14} />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-stone-500 bg-white border border-stone-200 rounded shadow-2xs">
              ESC to exit
            </kbd>
          </div>

          {/* Results List */}
          <div ref={listRef} className="overflow-y-auto flex-1 p-2 divide-y divide-stone-100 max-h-[60vh]">
            {items.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <p className="text-sm font-semibold text-stone-700">No matching commands or data found</p>
                <p className="text-xs text-stone-400 mt-1">Try searching for a transaction, action name, or project title.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {items.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-stone-900 text-white shadow-2xs'
                          : 'hover:bg-stone-100 text-stone-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-white/15 text-white'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {item.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-stone-900'}`}>
                              {item.title}
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                isSelected
                                  ? 'bg-white/20 text-stone-200'
                                  : 'bg-stone-100 text-stone-500'
                              }`}
                            >
                              {item.category}
                            </span>
                          </div>
                          {item.subtitle && (
                            <p className={`text-[11px] truncate mt-0.5 font-medium ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.shortcut && (
                          <div className="flex items-center gap-1">
                            {item.shortcut.map((key, kIdx) => (
                              <kbd
                                key={kIdx}
                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                  isSelected
                                    ? 'bg-white/20 text-white border border-white/20'
                                    : 'bg-stone-100 text-stone-600 border border-stone-200'
                                }`}
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        )}
                        <ArrowRight
                          size={14}
                          className={`transition-transform ${isSelected ? 'text-white translate-x-0.5' : 'text-stone-300'}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Navigation Hints */}
          <div className="px-4 py-2.5 bg-stone-50/90 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-stone-200 rounded shadow-2xs font-mono font-bold">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-stone-200 rounded shadow-2xs font-mono font-bold">↵</kbd>
                Execute
              </span>
            </div>
            <span className="text-[10px] font-semibold text-stone-400">
              Fire Finance Pro Command Engine
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
