import { AccessibleDialog } from './components/AccessibleDialog';

import React, { useState, useEffect, useMemo, useCallback, useRef, lazy } from 'react';
import Login from './components/Login';
import TransactionForm from './components/TransactionForm';
const Dashboard = lazy(() => import('./components/Dashboard'));
const FundingFinder = lazy(() => import('./components/FundingFinder').then(module => ({ default: module.FundingFinder })));
const Settings = lazy(() => import('./components/Settings'));
import BankSyncModal from './components/BankSyncModal';
const EventPlanner = lazy(() => import('./components/EventPlanner'));
import type { ProjectTab } from './components/EventPlanner';
import InviteAcceptScreen from './components/InviteAcceptScreen';
const Projections = lazy(() => import('./components/Projections'));
const Calendar = lazy(() => import('./components/Calendar'));
import { NotificationsModal } from './components/NotificationsModal';
import { CommandPalette } from './components/CommandPalette';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { useToast } from './components/Toast';
import { syncBankData } from './bankApiService';
import { useNotificationBadge } from './hooks/useNotificationBadge';
import { useGmailNotifications } from './hooks/useGmailNotifications';
import { useGoogleCalendarSync } from './hooks/useGoogleCalendarSync';
import { badgeService } from './services/badgeService';
import { 
  Transaction, 
  RecurringExpense, 
  RecurringIncome, 
  SavingGoal, 
  BankConnection, 
  InvestmentAccount, 
  MarketPrice, 
  BudgetEvent, 
  Contact, 
  InvestmentGoal, 
  CalendarItem,
  TaskStatus,
  Idea,
  ForecastSettings,
  EventLog,
  STORAGE_KEYS 
} from './types';
import { vaultService, AppState } from './services/vaultService';
import { authService, AuthUser } from './services/authService';
import { checkpointService } from './services/checkpointService';
import { mergeStates, sameState } from './utils/stateMerge';
import { deduplicateCalendarItems } from './utils/calendarUtils';
import { EmailVerificationNotice, EmailVerificationScreen } from './components/EmailVerification';
import { dataSyncService, SyncConflictError } from './services/dataSyncService';
import { realtimeService } from './services/realtimeService';
import { projectsService } from './services/projectsService';
import { APP_LOGO_ICON } from './assets/logo';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  HardDrive, 
  RefreshCw, 
  Download, 
  Upload,
  Settings as SettingsIcon,
  Plus,
  LayoutDashboard,
  Landmark,
  Calendar as CalendarIcon,
  Zap,
  TrendingUp,
  LogOut,
  User,
  Radio,
  Wifi,
  WifiOff,
  Menu,
  X,
  ChevronRight,
  Bell,
  Search,
  Eye,
  EyeOff,
  Keyboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ADMIN_USER = "nsv"; 

const safeParse = (key: string, fallback: any) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (e) {
    return fallback;
  }
};

const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

function isGlobalFinancialLog(log: EventLog): boolean {
  if (!log || !log.action) return false;
  const act = log.action;
  return (
    act.startsWith('Recorded EXPENSE:') ||
    act.startsWith('Recorded INCOME:') ||
    act.startsWith('Updated EXPENSE:') ||
    act.startsWith('Updated INCOME:') ||
    act.startsWith('Removed Transaction:') ||
    act.startsWith('Adjusted Budget Limit:') ||
    act.startsWith('Added Recurring Bill Commitment:') ||
    act.startsWith('Cleared Commitment / Paid Bill:') ||
    act.startsWith('Recorded Inflow / Received Income:') ||
    act.startsWith('Logged EXPENSE:') ||
    act.startsWith('Logged INCOME:') ||
    (act.includes('Synced ') && act.includes('transactions from'))
  );
}

function sanitizeEventLogs(eventsList: BudgetEvent[]): BudgetEvent[] {
  if (!Array.isArray(eventsList)) return [];
  return eventsList.map(ev => {
    if (!ev.logs || ev.logs.length === 0) return ev;
    const cleanLogs = ev.logs.filter(log => !isGlobalFinancialLog(log));
    if (cleanLogs.length === ev.logs.length) return ev;
    return { ...ev, logs: cleanLogs };
  });
}

const MarketTicker = ({ prices, quotaExhausted }: { prices: MarketPrice[], quotaExhausted: boolean }) => {
  return (
    <div className="fixed top-0 left-0 right-0 z-[120] bg-stone-900 text-white py-1.5 shadow-md border-b border-stone-800">
      <div className="flex items-center">
        <div className="px-2 sm:px-4 border-r border-stone-800 flex items-center gap-2 whitespace-nowrap bg-stone-900 z-10">
          <span className="flex h-2 w-2 relative shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${quotaExhausted ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${quotaExhausted ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          </span>
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-stone-400 hidden sm:inline">
            {!prices.length ? 'Quotes unavailable' : quotaExhausted ? 'Limited market quotes' : 'Market quotes'}
          </span>
        </div>
        <div className="overflow-hidden relative flex-1">
          <div className="animate-marquee whitespace-nowrap flex items-center gap-12">
            {[...prices, ...prices].map((p, idx) => {
              const changeVal = Number(p.change24h || 0);
              const priceVal = Number(p.price || 0);
              const symbolText = String(p.symbol || 'USD');
              return (
                <div key={idx} className="flex items-center gap-3">
                   <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[8px] font-black text-white">{symbolText.substring(0, 1)}</div>
                   <span className="font-black text-[9px] text-stone-400 tracking-[0.2em] uppercase">{symbolText}</span>
                   <span className="font-black text-[10px] text-white tracking-tight font-tabular privacy-sensitive">${priceVal.toLocaleString()}</span>
                   <div className={`flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded font-tabular privacy-sensitive ${changeVal >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                     <i className={`fas fa-caret-${changeVal >= 0 ? 'up' : 'down'}`}></i>
                     {Math.abs(changeVal).toFixed(2)}%
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export type AppTab = 'dashboard' | 'calendar' | 'events' | 'projections' | 'funding';

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const isAuthenticated = !!authUser;
  const currentUsername = authUser?.username || authUser?.displayName || (authUser?.email ? authUser.email.split('@')[0] : '');
  
  // Navigation State with Full Browser History Support
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      const validTabs: AppTab[] = ['dashboard', 'calendar', 'events', 'projections', 'funding'];
      if (tab && validTabs.includes(tab as AppTab)) return tab as AppTab;
    } catch (e) {}
    return 'dashboard';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navSelectedEventId, setNavSelectedEventId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('project') || null;
    } catch (e) {}
    return null;
  });
  const [navProjectTab, setNavProjectTab] = useState<ProjectTab>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get('subtab') as ProjectTab) || 'dashboard';
    } catch (e) {}
    return 'dashboard';
  });
  const [navSelectedTaskId, setNavSelectedTaskId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('task') || null;
    } catch (e) {}
    return null;
  });

  const isPoppingState = useRef(false);

  const updateBrowserHistory = useCallback((
    tab: AppTab,
    projectId?: string | null,
    subtab?: ProjectTab | string | null,
    taskId?: string | null,
    replace: boolean = false
  ) => {
    if (isPoppingState.current) return;
    try {
      const params = new URLSearchParams();
      if (tab !== 'dashboard') {
        params.set('tab', tab);
      }
      if (tab === 'events' && projectId) {
        params.set('project', projectId);
        if (subtab && subtab !== 'dashboard') {
          params.set('subtab', subtab);
        }
        if (taskId) {
          params.set('task', taskId);
        }
      }
      const query = params.toString();
      const newUrl = query ? `?${query}` : window.location.pathname;
      const currentSearch = window.location.search;
      const isSameUrl = (query ? `?${query}` : '') === (currentSearch === '?' ? '' : currentSearch);

      const stateObj = {
        tab,
        projectId: projectId || null,
        subtab: subtab || null,
        taskId: taskId || null,
        isAppNav: true,
      };

      if (isSameUrl) {
        window.history.replaceState(stateObj, document.title, newUrl);
      } else if (replace) {
        window.history.replaceState(stateObj, document.title, newUrl);
      } else {
        window.history.pushState(stateObj, document.title, newUrl);
      }
    } catch (e) {
      console.warn('Browser history update failed:', e);
    }
  }, []);

  const navigateToTab = useCallback((
    tab: AppTab,
    options?: {
      projectId?: string | null;
      subtab?: ProjectTab | null;
      taskId?: string | null;
      replace?: boolean;
    }
  ) => {
    setActiveTab(tab);
    if (options?.projectId !== undefined) {
      setNavSelectedEventId(options.projectId);
    } else if (tab !== 'events') {
      setNavSelectedEventId(null);
    }
    if (options?.subtab !== undefined) {
      setNavProjectTab(options.subtab || 'dashboard');
    }
    if (options?.taskId !== undefined) {
      setNavSelectedTaskId(options.taskId);
    }

    updateBrowserHistory(
      tab,
      options?.projectId !== undefined ? options.projectId : (tab === 'events' ? navSelectedEventId : null),
      options?.subtab !== undefined ? options.subtab : (tab === 'events' ? navProjectTab : null),
      options?.taskId !== undefined ? options.taskId : (tab === 'events' ? navSelectedTaskId : null),
      options?.replace || false
    );
  }, [navSelectedEventId, navProjectTab, navSelectedTaskId, updateBrowserHistory]);

  const handleSelectEvent = useCallback((eventId: string | null) => {
    setNavSelectedEventId(eventId);
    if (!eventId) {
      setNavSelectedTaskId(null);
    }
    updateBrowserHistory('events', eventId, eventId ? (navProjectTab || 'dashboard') : null, null, false);
  }, [navProjectTab, updateBrowserHistory]);

  const handleSelectProjectTab = useCallback((subtab: ProjectTab) => {
    setNavProjectTab(subtab);
    updateBrowserHistory('events', navSelectedEventId, subtab, navSelectedTaskId, false);
  }, [navSelectedEventId, navSelectedTaskId, updateBrowserHistory]);

  // Ensure initial history state is properly tagged so popstate knows this session
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = (params.get('tab') as AppTab) || 'dashboard';
      const project = params.get('project');
      const subtab = params.get('subtab') as ProjectTab;
      const task = params.get('task');
      window.history.replaceState({
        tab,
        projectId: project || null,
        subtab: subtab || null,
        taskId: task || null,
        isAppNav: true,
        isInitial: true
      }, document.title, window.location.href);
    } catch (e) {}
  }, []);

  // Listen for browser Back and Forward arrow events (popstate)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      isPoppingState.current = true;
      try {
        const state = event.state;
        const params = new URLSearchParams(window.location.search);
        const urlTab = params.get('tab');
        const validTabs: AppTab[] = ['dashboard', 'calendar', 'events', 'projections', 'funding'];

        const targetTab = state?.tab || (validTabs.includes(urlTab as AppTab) ? (urlTab as AppTab) : 'dashboard');
        const targetProject = state?.projectId !== undefined ? state.projectId : (params.get('project') || null);
        const targetSubtab = state?.subtab !== undefined ? (state.subtab as ProjectTab) : ((params.get('subtab') as ProjectTab) || 'dashboard');
        const targetTask = state?.taskId !== undefined ? state.taskId : (params.get('task') || null);

        setActiveTab(targetTab);
        setNavSelectedEventId(targetProject);
        setNavProjectTab(targetSubtab);
        setNavSelectedTaskId(targetTask);
      } finally {
        setTimeout(() => {
          isPoppingState.current = false;
        }, 50);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/invite\/([^/]+)\/?$/);
    const token = match ? match[1] : sessionStorage.getItem('ffpro_pending_invite');
    if (match?.[1]) sessionStorage.setItem('ffpro_pending_invite', match[1]);
    return token || null;
  });

  // Password-reset link from the emailed URL: /reset-password?token=...
  const [resetToken, setResetToken] = useState<string | null>(() => {
    if (window.location.pathname === '/reset-password') {
      const params = new URLSearchParams(window.location.search);
      return params.get('token');
    }
    return null;
  });

  // Strip sensitive token from address bar immediately upon capture so it isn't exposed
  useEffect(() => {
    if (resetToken && window.location.pathname === '/reset-password') {
      window.history.replaceState({}, document.title, '/');
    }
  }, [resetToken]);

  const clearResetRoute = () => {
    window.history.replaceState({}, '', '/');
    setResetToken(null);
  };

  const clearInviteRoute = () => {
    sessionStorage.removeItem('ffpro_pending_invite');
    window.history.replaceState({}, '', '/');
    setInviteToken(null);
  };

  // Restore session (cookie-based or via signed session_token param) on load
  const [authBanner, setAuthBanner] = useState<{ message: string; type: 'error' | 'warning' | 'info'; provider?: string } | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const authStatus = params.get('auth');
      const authError = params.get('error');
      const provider = params.get('provider') || undefined;
      const sessionToken = params.get('session_token');

      localStorage.removeItem('ffpro_session_token');

      if (authStatus === 'failed') {
        return {
          type: 'error',
          message: authError || `${provider ? provider.toUpperCase() : 'OAuth'} authentication could not be completed.`,
          provider,
        };
      } else if (authStatus === 'not_configured') {
        return {
          type: 'warning',
          message: `${provider ? provider.toUpperCase() : 'OAuth'} sign-in is not yet configured with API credentials.`,
          provider,
        };
      }
    } catch (e) {}
    return null;
  });

  // Clean sensitive OAuth / session query parameters from address bar on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('auth') || params.has('session_token') || params.has('error') || params.has('provider')) {
        params.delete('auth');
        params.delete('session_token');
        params.delete('error');
        params.delete('provider');
        const newQuery = params.toString();
        const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    authService.me()
      .then((user) => {
        if (cancelled) return;
        setAuthUser(user);
        if (user) {
          const params = new URLSearchParams(window.location.search);
          const tab = params.get('tab');
          if (tab && ['dashboard', 'calendar', 'events', 'projections', 'funding'].includes(tab)) {
            setActiveTab(tab as AppTab);
          }
        }
      })
      .catch(() => { if (!cancelled) setAuthUser(null); })
      .finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authChecked || authUser) return;
    window.location.replace('/api/platform/start');
  }, [authChecked, authUser]);

  // Fetch and poll real-time market prices from our public endpoint
  useEffect(() => {
    let active = true;
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/ai/market-data');
        if (res.ok && active) {
          const data = await res.json();
          if (data && Array.isArray(data.prices)) {
            setMarketPrices(data.prices);
            setQuotaExhausted(!!data.quotaExhausted);
          }
        }
      } catch (err) {
        console.warn('Real-time market price update paused:', err instanceof Error ? err.message : err);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // refresh every 30 seconds
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const [transactions, setTransactions] = useState<Transaction[]>(() => safeParse(STORAGE_KEYS.TRANSACTIONS, []));
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>(() => safeParse(STORAGE_KEYS.RECURRING_EXPENSES, []));
  const [recurringIncomes, setRecurringIncomes] = useState<RecurringIncome[]>(() => safeParse(STORAGE_KEYS.RECURRING_INCOMES, []));
  const [savingGoals, setSavingGoals] = useState<SavingGoal[]>(() => safeParse(STORAGE_KEYS.SAVINGS_GOALS, []));
  const [investmentGoals, setInvestmentGoals] = useState<InvestmentGoal[]>(() => safeParse(STORAGE_KEYS.INVESTMENT_GOALS, []));
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>(() => safeParse(STORAGE_KEYS.CATEGORY_LIMITS, {}));
  const [bankConnections, setBankConnections] = useState<BankConnection[]>(() => safeParse(STORAGE_KEYS.BANK_CONNECTIONS, []));
  const [investments, setInvestments] = useState<InvestmentAccount[]>(() => safeParse(STORAGE_KEYS.INVESTMENTS, []));
  const [events, setEvents] = useState<BudgetEvent[]>(() => {
    const parsed = safeParse(STORAGE_KEYS.EVENTS, null);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      const migrated = parsed.map(ev => ({
        ...ev,
        eventType: ev.eventType || (ev.startupDetails || /laser|startup|business|plan|venture|store|shop|app|service|trade|project/i.test(ev.name || '') ? 'startup' : 'event')
      }));
      return sanitizeEventLogs(migrated);
    }
    return [];
  });
  // Read-only mirror of server-shared projects (Planning Hub plans shared with
  // collaborators). EventPlanner keeps its own copy for editing/sync — this
  // one exists purely so the Dashboard and Calendar summaries reflect ALL of
  // a user's projects, not just the ones stored in local browser storage.
  const [sharedProjectsMirror, setSharedProjectsMirror] = useState<BudgetEvent[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>(() => {
    const raw = safeParse(STORAGE_KEYS.CALENDAR_ITEMS, []);
    return deduplicateCalendarItems(raw);
  });
  const [contacts, setContacts] = useState<Contact[]>(() => safeParse(STORAGE_KEYS.CONTACTS, []));
  const [ideas, setIdeas] = useState<Idea[]>(() => safeParse(STORAGE_KEYS.IDEAS, []));
  const [forecastSettings, setForecastSettings] = useState<ForecastSettings>(() => safeParse(STORAGE_KEYS.FORECAST_SETTINGS, {
    yearsToProject: 5,
    monthlyContribution: 500,
    expectedReturn: 8
  }));
  const [financialLogs, setFinancialLogs] = useState<EventLog[]>(() => {
    const saved = safeParse(STORAGE_KEYS.FINANCIAL_LOGS, null);
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
    const initialTx = safeParse(STORAGE_KEYS.TRANSACTIONS, []);
    if (Array.isArray(initialTx) && initialTx.length > 0) {
      return initialTx.map((t: Transaction) => ({
        id: generateId(),
        action: `Logged ${t.type.toUpperCase()}: "${t.description}" (${t.type === 'expense' ? '-' : '+'}$${t.amount.toLocaleString()})`,
        timestamp: t.date ? new Date(t.date + 'T12:00:00').toISOString() : new Date().toISOString(),
        username: 'nsv',
        type: 'transaction' as const,
        details: `Category: ${t.category} | Method: ${t.institution || 'Cash in Hand'}${t.notes ? ' | Notes: ' + t.notes : ''}`
      }));
    }
    return [];
  });
  const [cashOpeningBalance, setCashOpeningBalance] = useState<number>(() => parseFloat(localStorage.getItem(STORAGE_KEYS.CASH_OPENING) || '0'));
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);
  // Market prices are fully real-time and auto-refresh every 30 seconds via the public Kraken/Yahoo endpoint.
  const [quotaExhausted, setQuotaExhausted] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'recurring' | 'goals' | 'api' | 'security' | 'intelligence'>('general');

  useEffect(() => {
    const handleOpenSettings = (e: any) => {
      if (e?.detail?.tab) {
        setSettingsInitialTab(e.detail.tab);
      }
      setShowSettings(true);
    };
    window.addEventListener('open-settings', handleOpenSettings);
    return () => window.removeEventListener('open-settings', handleOpenSettings);
  }, []);

  const [showBankSync, setShowBankSync] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vaultHandle, setVaultHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // --- Per-account cloud sync state ---
  const [cloudLoaded, setCloudLoaded] = useState(false); // has the initial pull for THIS account finished?
  const [cloudVersion, setCloudVersion] = useState(0);
  const cloudVersionRef = useRef(0);
  const isApplyingRemoteUpdateRef = useRef(false);
  const isSyncingInFlightRef = useRef(false);
  const pushPendingRef = useRef(false);
  const baseStateRef = useRef<AppState | null>(null);
  const latestStateRef = useRef<AppState | null>(null);
  const syncTaskRef = useRef<Promise<void> | null>(null);
  const conflictRef = useRef(false);
  const accountRef = useRef<string | null>(null);
  const [conflictPaths, setConflictPaths] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudLastSyncTime, setCloudLastSyncTime] = useState<string | null>(null);

  const updateCloudVersion = useCallback((v: number) => {
    cloudVersionRef.current = v;
    setCloudVersion(v);
  }, []);

  const isAdmin = true;

  // Load server-shared projects for THIS logged-in user so the Dashboard and
  // Calendar summaries include projects shared with them, not just projects
  // stored in this browser's local storage. Refreshes on login and whenever
  // a shared project is created/updated/deleted elsewhere (realtime push).
  const refreshSharedProjectsMirror = useCallback(async () => {
    if (!authUser) {
      setSharedProjectsMirror([]);
      return;
    }
    try {
      const list = await projectsService.list();
      setSharedProjectsMirror(list.map(p => ({
        ...(p.data as BudgetEvent),
        id: p.id,
        sharedProjectId: p.id,
        isShared: true,
        role: p.role,
        lastUpdated: p.updatedAt,
      })));
    } catch (err) {
      console.error('Failed to load shared projects for summary views:', err);
    }
  }, [authUser]);

  useEffect(() => { refreshSharedProjectsMirror(); }, [refreshSharedProjectsMirror]);

  useEffect(() => {
    const unsub = realtimeService.on('project_updated', () => { refreshSharedProjectsMirror(); });
    return () => unsub();
  }, [refreshSharedProjectsMirror]);

  // Local + shared projects combined, deduped by id (a project a user owns
  // locally and also shares should only be counted once). Used for
  // high-level summaries (Dashboard KPIs, Calendar) that must reflect every
  // project the user is part of, not only ones saved to this browser.
  const allEventsForSummary = useMemo(() => {
    const map = new Map<string, BudgetEvent>();
    events.forEach(ev => map.set(ev.id, ev));
    sharedProjectsMirror.forEach(ev => map.set(ev.id, ev));
    return Array.from(map.values());
  }, [events, sharedProjectsMirror]);

  const { showToast } = useToast();
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<boolean>(() => {
    return localStorage.getItem('ffpro_privacy_mode') === 'true';
  });

  useEffect(() => {
    document.body.classList.toggle('privacy-mode-enabled', privacyMode);
    document.documentElement.classList.toggle('privacy-mode-enabled', privacyMode);
  }, [privacyMode]);

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode((prev) => {
      const next = !prev;
      localStorage.setItem('ffpro_privacy_mode', String(next));
      showToast({
        type: next ? 'warning' : 'info',
        title: next ? 'Privacy Mode Enabled' : 'Privacy Mode Disabled',
        message: next ? 'Sensitive currency amounts are now masked.' : 'Financial numbers are visible.',
        duration: 2500,
      });
      return next;
    });
  }, [showToast]);

  const { activeUnreadEmails, dismissedEmailIds: gmailDismissedIds, handleDismissEmail: dismissGmailEmail } = useGmailNotifications(
    authUser?.email,
    allEventsForSummary
  );

  useGoogleCalendarSync(calendarItems, setCalendarItems, authUser?.email);

  const { unreadCount, badgeLabel, breakdown } = useNotificationBadge(
    allEventsForSummary,
    calendarItems,
    recurringExpenses,
    recurringIncomes,
    activeUnreadEmails,
    Array.from(gmailDismissedIds || [])
  );

  // PWA Install Prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Global state object for backups
  const getFullState = useCallback((): AppState => ({
    transactions,
    recurringExpenses,
    recurringIncomes,
    savingGoals,
    investmentGoals,
    categoryBudgets,
    bankConnections,
    investments,
    events,
    calendarItems,
    contacts,
    ideas,
    forecastSettings,
    financialLogs,
    cashOpeningBalance,
    lastUpdated: new Date().toISOString()
  }), [transactions, recurringExpenses, recurringIncomes, savingGoals, investmentGoals, categoryBudgets, bankConnections, investments, events, calendarItems, contacts, ideas, forecastSettings, financialLogs, cashOpeningBalance]);

  latestStateRef.current = getFullState();
  accountRef.current = authUser?.id || null;

  // Loads a full AppState (from the cloud or a vault backup) into local state.
  const applyRemoteState = useCallback((state: AppState) => {
    setTransactions(state.transactions || []);
    setRecurringExpenses(state.recurringExpenses || []);
    setRecurringIncomes(state.recurringIncomes || []);
    setSavingGoals(state.savingGoals || []);
    setInvestmentGoals(state.investmentGoals || []);
    setCategoryBudgets(state.categoryBudgets || {});
    setBankConnections(state.bankConnections || []);
    setInvestments(state.investments || []);
    setEvents(sanitizeEventLogs(state.events || []));
    setCalendarItems(deduplicateCalendarItems(state.calendarItems || []));
    setContacts(state.contacts || []);
    setIdeas(state.ideas || []);
    if (state.financialLogs) {
      setFinancialLogs(state.financialLogs);
    }
    if (state.forecastSettings) {
      setForecastSettings(state.forecastSettings);
    }
    setCashOpeningBalance(state.cashOpeningBalance || 0);
  }, []);

  // Real-time Event Stream connection & live broadcast listener
  useEffect(() => {
    if (!isAuthenticated) {
      realtimeService.disconnect();
      setRealtimeStatus('disconnected');
      return;
    }

    realtimeService.connect();
    setRealtimeStatus(realtimeService.status);

    const unsubStatus = realtimeService.on('status_change', ({ status }) => {
      setRealtimeStatus(status);
    });

    const unsubData = realtimeService.on('user_data_updated', async (payload: any) => {
      // Ignore echo if we just pushed this version or higher
      if (payload?.version && payload.version <= cloudVersionRef.current) {
        return;
      }
      if (isSyncingInFlightRef.current || !sameState(latestStateRef.current, baseStateRef.current)) return;
      const account = accountRef.current;
      try {
        const remote = await dataSyncService.fetch();
        if (account !== accountRef.current || !sameState(latestStateRef.current, baseStateRef.current)) return;
        if (remote.data && remote.version > cloudVersionRef.current) {
          isApplyingRemoteUpdateRef.current = true;
          baseStateRef.current = remote.data;
          applyRemoteState(remote.data);
          updateCloudVersion(remote.version);
          setCloudLastSyncTime(remote.updatedAt);
          setTimeout(() => { isApplyingRemoteUpdateRef.current = false; }, 600);
        }
      } catch (err) {
        console.warn('[App] Realtime pull failed:', err);
      }
    });

    return () => {
      unsubStatus();
      unsubData();
    };
  }, [isAuthenticated, applyRemoteState, updateCloudVersion]);

  // Wipes everything local — used when switching accounts on a shared browser
  // and on logout/purge, so one account's financial data can never bleed into
  // another session on the same device.
  const clearLocalData = useCallback(() => {
    setTransactions([]);
    setRecurringExpenses([]);
    setRecurringIncomes([]);
    setSavingGoals([]);
    setInvestmentGoals([]);
    setCategoryBudgets({});
    setBankConnections([]);
    setInvestments([]);
    setEvents([]);
    setCalendarItems([]);
    setContacts([]);
    setIdeas([]);
    setFinancialLogs([]);
    setForecastSettings({ yearsToProject: 5, monthlyContribution: 500, expectedReturn: 8 });
    setCashOpeningBalance(0);
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  }, []);

  // Load the server baseline and any durable unsaved checkpoint for this account.
  useEffect(() => {
    if (!authChecked || !authUser) return;
    let cancelled = false;
    setCloudLoaded(false);baseStateRef.current=null;conflictRef.current=false;setConflictPaths([]);
    const cachedOwner=localStorage.getItem(STORAGE_KEYS.DATA_OWNER);
    const legacy = cachedOwner === authUser.id ? getFullState() : null;
    if(cachedOwner !== authUser.id) clearLocalData();
    localStorage.setItem(STORAGE_KEYS.DATA_OWNER,authUser.id);
    (async()=>{
      setCloudSyncing(true);
      try {
        const saved=await checkpointService.get(authUser.id);
        const remote=await dataSyncService.fetch();
        if(cancelled)return;
        let data=remote.data;
        if(saved && !sameState(saved.data,saved.base)) {
          if(remote.data && saved.base) {
            const merged=mergeStates(saved.base,saved.data,remote.data);data=merged.data;
            if(merged.conflicts.length){conflictRef.current=true;setConflictPaths(merged.conflicts);setCloudError('Changes need review before saving.');}
          } else if(!remote.data && saved.version>0) {
            // An account purge is a deletion, not an invitation to recreate the old data.
            data=saved.data;conflictRef.current=true;setConflictPaths(['Account data was deleted on another device.']);
          } else data=saved.data;
        }
        if(!data)data=legacy || {transactions:[],events:[],lastUpdated:new Date().toISOString()} as AppState;
        baseStateRef.current=remote.data || ({...data,transactions:[],events:[]} as AppState);
        latestStateRef.current=data;applyRemoteState(data);updateCloudVersion(remote.version);
        setCloudLastSyncTime(remote.updatedAt);setCloudLoaded(true);
        setHasUnsavedChanges(!sameState(data,remote.data));
        if(!conflictRef.current)setCloudError(null);
      } catch(error:any) {
        if(!cancelled) {
          setCloudError('Could not load the saved account. Reconnect and reload; your local recovery copy is retained.');
          const saved=await checkpointService.get(authUser.id).catch(()=>null);
          if(saved){latestStateRef.current=saved.data;applyRemoteState(saved.data);}
        }
      } finally { if(!cancelled)setCloudSyncing(false); }
    })();
    return()=>{cancelled=true;};
  },[authChecked,authUser?.id]);

  const pushToCloud = useCallback(async (): Promise<void> => {
    if(!cloudLoaded || !accountRef.current) throw new Error('Saved account data has not loaded. Reconnect and reload first.');
    if(conflictRef.current) throw new Error('Review the conflicting changes before saving.');
    if(syncTaskRef.current) {pushPendingRef.current=true;return syncTaskRef.current;}
    const account=accountRef.current;
    const task=(async()=>{
      isSyncingInFlightRef.current=true;setCloudSyncing(true);
      try {
        do {
          pushPendingRef.current=false;
          let data=latestStateRef.current!;
          let version=cloudVersionRef.current;
          try {
            const result=await dataSyncService.save(data,version);
            if(account!==accountRef.current)return;
            baseStateRef.current=data;updateCloudVersion(result.version);
          } catch(error) {
            if(!(error instanceof SyncConflictError))throw error;
            const remote=await dataSyncService.fetch();
            if(account!==accountRef.current)return;
            if(!remote.data || !baseStateRef.current) {
              conflictRef.current=true;setConflictPaths(['Account data changed on another device.']);throw new Error('Review the conflicting changes before saving.');
            }
            const merged=mergeStates(baseStateRef.current,latestStateRef.current!,remote.data);
            if(merged.conflicts.length) {
              conflictRef.current=true;setConflictPaths(merged.conflicts);throw new Error('Changes need review before saving.');
            }
            data=merged.data;
            latestStateRef.current=data;applyRemoteState(data);
            const result=await dataSyncService.save(data,remote.version);
            if(account!==accountRef.current)return;
            baseStateRef.current=data;updateCloudVersion(result.version);
          }
          setCloudError(null);setCloudLastSyncTime(new Date().toISOString());
          await checkpointService.save(account,{data:latestStateRef.current!,base:baseStateRef.current,version:cloudVersionRef.current});
          setHasUnsavedChanges(!sameState(latestStateRef.current,baseStateRef.current));
        }while(pushPendingRef.current && account===accountRef.current && !conflictRef.current);
      } catch(error:any){setCloudError(error.message || 'Save failed. Your local changes are retained.');throw error;}
      finally{isSyncingInFlightRef.current=false;setCloudSyncing(false);}
    })();
    syncTaskRef.current=task;
    try{await task;}finally{syncTaskRef.current=null;}
  },[cloudLoaded,applyRemoteState,updateCloudVersion]);

  useEffect(()=>{
    if(!cloudLoaded || conflictRef.current)return;
    setHasUnsavedChanges(!sameState(latestStateRef.current,baseStateRef.current));
    const timer=setTimeout(()=>{if(!sameState(latestStateRef.current,baseStateRef.current) || cloudVersionRef.current===0)pushToCloud().catch(()=>{});},1500);
    return()=>clearTimeout(timer);
  },[transactions,recurringExpenses,recurringIncomes,savingGoals,investmentGoals,categoryBudgets,bankConnections,investments,events,calendarItems,contacts,ideas,forecastSettings,financialLogs,cashOpeningBalance,cloudLoaded,pushToCloud]);
  useEffect(()=>{
    const retry=()=>{if(cloudLoaded && !conflictRef.current && !sameState(latestStateRef.current,baseStateRef.current))pushToCloud().catch(()=>{});};
    const timer=setInterval(retry,30000);window.addEventListener('online',retry);
    const unload=(e:BeforeUnloadEvent)=>{if(!sameState(latestStateRef.current,baseStateRef.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',unload);
    return()=>{clearInterval(timer);window.removeEventListener('online',retry);window.removeEventListener('beforeunload',unload);};
  },[cloudLoaded,pushToCloud]);

  // Instant Manual Sync Trigger with User Feedback
  const handleManualSync = useCallback(async () => {
    if (cloudSyncing) return;
    try {
      showToast({
        type: 'info',
        title: 'Synchronizing Cloud',
        message: 'Updating ledger, projects and financial records...',
        duration: 2000,
      });
      await pushToCloud();
      showToast({
        type: 'success',
        title: 'Cloud Synchronized',
        message: 'All ledger data and collaborative suites are up to date.',
        duration: 2500,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Sync Offline',
        message: err?.message || 'Data saved locally. Will sync when reconnected.',
        duration: 3500,
      });
    }
  }, [cloudSyncing, pushToCloud, showToast]);

  // Global Keyboard Shortcuts Engine
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Cmd+K or Ctrl+K opens Command Palette globally
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }

      // Number Navigation: Cmd+1 to Cmd+5
      if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const tabMap: Record<string, AppTab> = {
          '1': 'dashboard',
          '2': 'calendar',
          '3': 'events',
          '4': 'projections',
          '5': 'funding',
        };
        if (tabMap[e.key]) {
          navigateToTab(tabMap[e.key]);
        }
        return;
      }

      // Single-key shortcuts only if NOT typing in an input
      if (isInput) return;

      if (e.key === '/') {
        e.preventDefault();
        setShowCommandPalette(true);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePrivacyMode();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditingTransaction(null);
        setShowForm(true);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleManualSync();
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacyMode, handleManualSync]);

  // Restore Vault Handle on Mount
  useEffect(() => {
    const restoreVault = async () => {
      const handle = await vaultService.getHandle();
      if (handle) {
        setVaultHandle(handle);
        // Try to load state from vault if local storage is empty
        if (transactions.length === 0) {
          const savedState = await vaultService.loadState(handle);
          if (savedState) {
            setTransactions(savedState.transactions || []);
            setRecurringExpenses(savedState.recurringExpenses || []);
            setRecurringIncomes(savedState.recurringIncomes || []);
            setSavingGoals(savedState.savingGoals || []);
            setInvestmentGoals(savedState.investmentGoals || []);
            setCategoryBudgets(savedState.categoryBudgets || {});
            setBankConnections(savedState.bankConnections || []);
            setInvestments(savedState.investments || []);