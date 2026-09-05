
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Login from './components/Login';
import TransactionForm from './components/TransactionForm';
import Dashboard from './components/Dashboard';
import { FundingFinder } from './components/FundingFinder';
import Settings from './components/Settings';
import BankSyncModal from './components/BankSyncModal';
import EventPlanner from './components/EventPlanner';
import InviteAcceptScreen from './components/InviteAcceptScreen';
import Projections from './components/Projections';
import Calendar from './components/Calendar';
import { NotificationsModal } from './components/NotificationsModal';
import { CommandPalette } from './components/CommandPalette';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { useToast } from './components/Toast';
import { syncBankData } from './bankApiService';
import { useNotificationBadge } from './hooks/useNotificationBadge';
import { useGmailNotifications } from './hooks/useGmailNotifications';
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
import { dataSyncService, SyncConflictError } from './services/dataSyncService';
import { realtimeService } from './services/realtimeService';
import { projectsService } from './services/projectsService';
import { APP_LOGO } from './assets/logo';
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
            {quotaExhausted ? 'Cached Data' : 'Live Market Feed'}
          </span>
        </div>
        <div className="overflow-hidden relative flex-1">
          <div className="animate-marquee whitespace-nowrap flex items-center gap-12">
            {[...prices, ...prices].map((p, idx) => (
              <div key={idx} className="flex items-center gap-3">
                 <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[8px] font-black text-white">{p.symbol.substring(0, 1)}</div>
                 <span className="font-black text-[9px] text-stone-400 tracking-[0.2em] uppercase">{p.symbol}</span>
                 <span className="font-black text-[10px] text-white tracking-tight">${p.price.toLocaleString()}</span>
                 <div className={`flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded ${p.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                   <i className={`fas fa-caret-${p.change24h >= 0 ? 'up' : 'down'}`}></i>
                   {Math.abs(p.change24h).toFixed(2)}%
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const isAuthenticated = !!authUser;
  const currentUsername = authUser?.username || authUser?.displayName || (authUser?.email ? authUser.email.split('@')[0] : '');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'events' | 'projections' | 'funding'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navSelectedEventId, setNavSelectedEventId] = useState<string | null>(null);
  const [navSelectedTaskId, setNavSelectedTaskId] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/invite\/([^/]+)\/?$/);
    return match ? match[1] : null;
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

      if (sessionToken) {
        localStorage.setItem('ffpro_session_token', sessionToken);
      }

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
          setActiveTab('dashboard');
        }
      })
      .catch(() => { if (!cancelled) setAuthUser(null); })
      .finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, []);

  // Fetch and poll real-time market prices from our public endpoint
  useEffect(() => {
    let active = true;
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/ai/market-data');
        if (res.ok && active) {
          const data = await res.json();
          if (data && Array.isArray(data.prices) && data.prices.length > 0) {
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
  const DEFAULT_SAMPLE_EVENTS: BudgetEvent[] = [
    {
      id: 'evt-laser-tag-2026',
      name: 'Laser Tag Project',
      date: '2026-11-20',
      projectedBudget: 45000,
      status: 'active',
      eventType: 'startup',
      lastUpdated: new Date().toISOString(),
      files: [],
      contactIds: [],
      memberUsernames: [],
      ious: [],
      notes: [
        {
          id: 'note-1',
          text: 'Interactive youth and family recreation entertainment venue featuring laser tag arena, digital scoring systems, and community event space.',
          timestamp: new Date().toISOString(),
          authorId: 'system',
          version: 1
        }
      ],
      items: [
        { id: 'item-1', description: 'Laser Tag Gear & Phaser Packs', amount: 18000, type: 'expense', category: 'Equipment', date: '2026-09-01' },
        { id: 'item-2', description: 'Arena Obstacles & Lighting Systems', amount: 12000, type: 'expense', category: 'Infrastructure', date: '2026-09-15' },
        { id: 'item-3', description: 'Software & Scoring Hub Hardware', amount: 5000, type: 'expense', category: 'Technology', date: '2026-10-01' },
        { id: 'item-4', description: 'Pre-sale Tournament Registrations', amount: 7500, type: 'income', category: 'Sales', date: '2026-10-15' }
      ],
      tasks: [
        { id: 't1', text: 'Apply for OECS Youth Innovation & Creative Enterprise Grant', completed: false, subTasks: [] },
        { id: 't2', text: 'Finalize arena safety compliance & layout', completed: false, subTasks: [] },
        { id: 't3', text: 'Order laser tag phaser packs & calibration system', completed: false, subTasks: [] }
      ],
      logs: [
        { id: 'l1', action: 'Project Initiated', username: 'Vision79', type: 'system', timestamp: new Date().toISOString(), details: 'Created Laser Tag Project for youth recreation and grant matching.' }
      ]
    }
  ];

  const [events, setEvents] = useState<BudgetEvent[]>(() => {
    const parsed = safeParse(STORAGE_KEYS.EVENTS, null);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      return sanitizeEventLogs(parsed);
    }
    return DEFAULT_SAMPLE_EVENTS;
  });
  // Read-only mirror of server-shared projects (Planning Hub plans shared with
  // collaborators). EventPlanner keeps its own copy for editing/sync — this
  // one exists purely so the Dashboard and Calendar summaries reflect ALL of
  // a user's projects, not just the ones stored in local browser storage.
  const [sharedProjectsMirror, setSharedProjectsMirror] = useState<BudgetEvent[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>(() => safeParse(STORAGE_KEYS.CALENDAR_ITEMS, []));
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
  
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([
    { symbol: 'BTC', price: 64000.00, change24h: 1.2 },
    { symbol: 'ETH', price: 1820.00, change24h: -0.5 },
    { symbol: 'SOL', price: 77.00, change24h: 3.4 },
    { symbol: 'VOO', price: 693.86, change24h: 0.2 },
    { symbol: 'VOOG', price: 83.31, change24h: 0.1 }
  ]);
  // Market prices are fully real-time and auto-refresh every 30 seconds via the public Kraken/Yahoo endpoint.
  const [quotaExhausted, setQuotaExhausted] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showSettings, setShowSettings] = useState(false);
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

  // Merge helper for seamless conflict resolution without data loss
  const mergeAppStates = useCallback((local: AppState, remote: AppState): AppState => {
    const mergeById = <T extends { id?: string }>(l: T[] = [], r: T[] = []): T[] => {
      const map = new Map<string, T>();
      r.forEach(item => { if (item?.id) map.set(item.id, item); });
      l.forEach(item => { if (item?.id) map.set(item.id, item); });
      return Array.from(map.values());
    };

    return {
      transactions: mergeById(local.transactions, remote.transactions),
      recurringExpenses: mergeById(local.recurringExpenses, remote.recurringExpenses),
      recurringIncomes: mergeById(local.recurringIncomes, remote.recurringIncomes),
      savingGoals: mergeById(local.savingGoals, remote.savingGoals),
      investmentGoals: mergeById(local.investmentGoals, remote.investmentGoals),
      categoryBudgets: { ...(remote.categoryBudgets || {}), ...(local.categoryBudgets || {}) },
      bankConnections: mergeById(local.bankConnections, remote.bankConnections),
      investments: mergeById(local.investments, remote.investments),
      events: sanitizeEventLogs(mergeById(local.events, remote.events)),
      calendarItems: mergeById(local.calendarItems, remote.calendarItems),
      contacts: mergeById(local.contacts, remote.contacts),
      ideas: mergeById(local.ideas, remote.ideas),
      financialLogs: mergeById(local.financialLogs, remote.financialLogs),
      forecastSettings: local.forecastSettings || remote.forecastSettings || { yearsToProject: 5, monthlyContribution: 500, expectedReturn: 8 },
      cashOpeningBalance: local.cashOpeningBalance !== 0 ? local.cashOpeningBalance : (remote.cashOpeningBalance || 0),
      lastUpdated: new Date().toISOString()
    };
  }, []);

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
    setCalendarItems(state.calendarItems || []);
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
      try {
        const remote = await dataSyncService.fetch();
        if (remote.data && remote.version > cloudVersionRef.current) {
          isApplyingRemoteUpdateRef.current = true;
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
    setForecastSettings({ yearsToProject: 5, monthlyContribution: 500, expectedReturn: 8 });
    setCashOpeningBalance(0);
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  }, []);

  // --- Per-account cloud sync: initial load ---------------------------------
  // Runs whenever we get a confirmed logged-in user (fresh login, OAuth
  // redirect, or restored session on page load).
  useEffect(() => {
    if (!authChecked || !authUser) return;

    let cancelled = false;

    (async () => {
      // If this browser's local cache belongs to a DIFFERENT account (e.g. the
      // previous user closed the tab instead of logging out), wipe it first —
      // otherwise we'd either leak their data into this session or upload it
      // as if it were this account's data.
      const cachedOwner = localStorage.getItem(STORAGE_KEYS.DATA_OWNER);
      if (cachedOwner && cachedOwner !== authUser.id) {
        clearLocalData();
      }
      localStorage.setItem(STORAGE_KEYS.DATA_OWNER, authUser.id);

      setCloudError(null);
      setCloudSyncing(true);
      try {
        const remote = await dataSyncService.fetch();
        if (cancelled) return;
        if (remote.data) {
          isApplyingRemoteUpdateRef.current = true;
          applyRemoteState(remote.data);
          updateCloudVersion(remote.version);
          setCloudLastSyncTime(remote.updatedAt);
          setTimeout(() => { isApplyingRemoteUpdateRef.current = false; }, 600);
        } else {
          // Nothing synced yet for this account — treat whatever's in this
          // (now confirmed same-owner, or freshly cleared) browser as the
          // starting point and push it up as version 1.
          const initial = getFullState();
          const result = await dataSyncService.save(initial, 0);
          if (cancelled) return;
          updateCloudVersion(result.version);
          setCloudLastSyncTime(new Date().toISOString());
        }
      } catch (err: any) {
        const isAuthError = err?.message?.includes('Not authenticated') || err?.message?.includes('authentication') || err?.message?.includes('unauthorized') || String(err).includes('Not authenticated');
        if (isAuthError) {
          console.warn('Session expired or invalid during initial cloud sync. Resetting session.');
          if (!cancelled) {
            setAuthUser(null);
          }
        } else {
          console.error('Initial cloud sync failed:', err);
          if (!cancelled) setCloudError('Could not reach the cloud. Working locally until reconnected.');
        }
      } finally {
        if (!cancelled) {
          setCloudSyncing(false);
          setCloudLoaded(true);
        }
      }
    })();

    return () => { cancelled = true; };
    // Intentionally only re-runs when the authenticated user identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, authUser?.id, updateCloudVersion]);

  // --- Per-account cloud sync: debounced autosave with auto-healing ---
  const pushToCloud = useCallback(async (force: boolean = false) => {
    if (!cloudLoaded) return;
    if (isSyncingInFlightRef.current) {
      // A push is already in flight. Rather than silently dropping this edit,
      // flag it so the in-flight push retries once with the freshest state
      // right after it finishes — otherwise an edit that lands mid-request
      // (e.g. a second quick change while a slow save is still resolving)
      // would never reach the cloud until some later, unrelated edit happens
      // to fire the debounce again.
      pushPendingRef.current = true;
      return;
    }
    isSyncingInFlightRef.current = true;
    setCloudSyncing(true);
    try {
      const currentState = getFullState();
      const currentVer = cloudVersionRef.current;
      const result = await dataSyncService.save(currentState, currentVer, force);
      updateCloudVersion(result.version);
      setCloudLastSyncTime(new Date().toISOString());
      setCloudError(null);
    } catch (err: any) {
      if (err instanceof SyncConflictError) {
        // Auto-reconcile & merge smoothly in the background
        try {
          const remote = await dataSyncService.fetch();
          if (remote.data) {
            isApplyingRemoteUpdateRef.current = true;
            const merged = mergeAppStates(getFullState(), remote.data);
            applyRemoteState(merged);
            updateCloudVersion(remote.version);
            setCloudLastSyncTime(remote.updatedAt);
            setTimeout(() => { isApplyingRemoteUpdateRef.current = false; }, 600);

            // Re-save the reconciled state seamlessly
            const reSave = await dataSyncService.save(merged, remote.version, true);
            updateCloudVersion(reSave.version);
            setCloudLastSyncTime(new Date().toISOString());
            setCloudError(null);
          }
        } catch (fetchErr) {
          console.warn('Conflict auto-merge deferred:', fetchErr);
          if (err.version) {
            updateCloudVersion(err.version);
          }
        }
      } else {
        const isAuthError = err?.message?.includes('Not authenticated') || err?.message?.includes('authentication') || err?.message?.includes('unauthorized') || String(err).includes('Not authenticated');
        if (isAuthError) {
          console.warn('Session expired during cloud sync.');
          setAuthUser(null);
          setCloudLoaded(false);
          updateCloudVersion(0);
          setCloudError(null);
          setCloudLastSyncTime(null);
        } else {
          console.warn('Cloud sync error (changes preserved locally):', err?.message || err);
        }
      }
    } finally {
      isSyncingInFlightRef.current = false;
      setCloudSyncing(false);
      if (pushPendingRef.current) {
        pushPendingRef.current = false;
        pushToCloud();
      }
    }
  }, [cloudLoaded, getFullState, applyRemoteState, updateCloudVersion, mergeAppStates]);

  useEffect(() => {
    if (!cloudLoaded || isApplyingRemoteUpdateRef.current) return;
    const timer = setTimeout(() => { pushToCloud(); }, 2500); // 2.5s debounce
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, recurringExpenses, recurringIncomes, savingGoals, investmentGoals, categoryBudgets, bankConnections, investments, events, calendarItems, contacts, ideas, forecastSettings, financialLogs, cashOpeningBalance, cloudLoaded]);

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
        const tabMap: Record<string, string> = {
          '1': 'dashboard',
          '2': 'calendar',
          '3': 'events',
          '4': 'projections',
          '5': 'funding',
        };
        if (tabMap[e.key]) {
          setActiveTab(tabMap[e.key]);
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
            setEvents(sanitizeEventLogs(savedState.events || []));
            setCalendarItems(savedState.calendarItems || []);
            setContacts(savedState.contacts || []);
            setIdeas(savedState.ideas || []);
            if (savedState.financialLogs) {
              setFinancialLogs(savedState.financialLogs);
            }
            if (savedState.forecastSettings) {
              setForecastSettings(savedState.forecastSettings);
            }
            setCashOpeningBalance(savedState.cashOpeningBalance || 0);
            setLastSyncTime(savedState.lastUpdated);
          }
        }
      }
    };
    restoreVault();
  }, []);

  // Sync to Vault
  const syncToVault = useCallback(async () => {
    if (!vaultHandle) return;
    setIsSyncing(true);
    setVaultError(null);
    try {
      await vaultService.saveState(vaultHandle, getFullState());
      setLastSyncTime(new Date().toISOString());
    } catch (err) {
      console.error('Vault sync failed:', err);
      setVaultError('Sync failed. Re-connect vault?');
    } finally {
      setIsSyncing(false);
    }
  }, [vaultHandle, getFullState]);

  // Auto-Sync on State Changes
  useEffect(() => {
    if (!vaultHandle || !isAuthenticated) return;

    const timer = setTimeout(() => {
      syncToVault();
    }, 5000); // 5s debounce

    return () => clearTimeout(timer);
  }, [vaultHandle, isAuthenticated, syncToVault]);

  const handleConnectVault = async () => {
    const handle = await vaultService.connectVault();
    if (handle) {
      setVaultHandle(handle);
      syncToVault();
    }
  };

  const handleDisconnectVault = async () => {
    await vaultService.disconnectVault();
    setVaultHandle(null);
    setLastSyncTime(null);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    localStorage.setItem(STORAGE_KEYS.RECURRING_EXPENSES, JSON.stringify(recurringExpenses));
    localStorage.setItem(STORAGE_KEYS.RECURRING_INCOMES, JSON.stringify(recurringIncomes));
    localStorage.setItem(STORAGE_KEYS.SAVINGS_GOALS, JSON.stringify(savingGoals));
    localStorage.setItem(STORAGE_KEYS.INVESTMENT_GOALS, JSON.stringify(investmentGoals));
    localStorage.setItem(STORAGE_KEYS.BANK_CONNECTIONS, JSON.stringify(bankConnections));
    localStorage.setItem(STORAGE_KEYS.INVESTMENTS, JSON.stringify(investments));
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    localStorage.setItem(STORAGE_KEYS.CALENDAR_ITEMS, JSON.stringify(calendarItems));
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
    localStorage.setItem(STORAGE_KEYS.IDEAS, JSON.stringify(ideas));
    localStorage.setItem(STORAGE_KEYS.FORECAST_SETTINGS, JSON.stringify(forecastSettings));
    localStorage.setItem(STORAGE_KEYS.CATEGORY_LIMITS, JSON.stringify(categoryBudgets));
    localStorage.setItem(STORAGE_KEYS.FINANCIAL_LOGS, JSON.stringify(financialLogs));
    localStorage.setItem(STORAGE_KEYS.CASH_OPENING, cashOpeningBalance.toString());
  }, [transactions, recurringExpenses, recurringIncomes, savingGoals, investmentGoals, bankConnections, investments, events, calendarItems, contacts, ideas, forecastSettings, categoryBudgets, financialLogs, cashOpeningBalance]);

  // Market prices are entered/updated manually now (see Settings/Investments)
  // rather than auto-refreshed by an AI call. quotaExhausted is left `true`
  // (set above) so the ticker always honestly reads "Cached Data".

  const handleAuthenticated = (user: AuthUser) => {
    setAuthUser(user);
    setActiveTab('dashboard');
  };

  const handleLogout = async () => {
    // Final backup before logout if vault is connected
    if (vaultHandle) {
      try {
        await vaultService.saveState(vaultHandle, getFullState());
      } catch (e) { console.warn("Logout backup failed."); }
    }
    // Flush any pending edits to the cloud before we wipe local state.
    if (cloudLoaded) {
      try {
        await pushToCloud();
      } catch (e) { console.warn('Final cloud sync before logout failed.'); }
    }
    try {
      await authService.logout();
    } catch (e) {
      console.warn('Logout request failed, clearing local session state anyway.');
    }
    // Wipe the in-memory + localStorage copy of this account's data. Without
    // this, a second account signing in on the same browser would briefly
    // see (and could even overwrite) the previous account's data.
    clearLocalData();
    badgeService.clearBadge();
    setCloudLoaded(false);
    setCloudVersion(0);
    setCloudError(null);
    setCloudLastSyncTime(null);
    setAuthUser(null);
  };

  const logFinancialActivity = useCallback((action: string, details?: string) => {
    const newLog: EventLog = {
      id: generateId(),
      action,
      timestamp: new Date().toISOString(),
      username: currentUsername || 'User',
      type: 'transaction',
      details
    };

    setFinancialLogs(prev => [newLog, ...prev]);
  }, [currentUsername]);

  const onSaveTransaction = (t: Omit<Transaction, 'id'>) => {
    if (editingTransaction) {
      setTransactions(prev => prev.map(item => item.id === editingTransaction.id ? { ...t, id: editingTransaction.id } : item));
      logFinancialActivity(
        `Updated ${t.type.toUpperCase()}: "${t.description}" ($${t.amount.toLocaleString()})`,
        `Category: ${t.category} | Method: ${t.institution || 'Cash in Hand'}${t.destinationInstitution ? ' → ' + t.destinationInstitution : ''}`
      );
      setEditingTransaction(null);
    } else {
      const newId = generateId();
      const newT = { ...t, id: newId };
      setTransactions(prev => [newT, ...prev]);

      const sign = t.type === 'expense' ? '-' : '+';
      logFinancialActivity(
        `Recorded ${t.type.toUpperCase()}: "${t.description}" (${sign}$${t.amount.toLocaleString()})`,
        `Category: ${t.category} | Method: ${t.institution || 'Cash in Hand'}${t.destinationInstitution ? ' → ' + t.destinationInstitution : ''}${t.notes ? ' | Notes: ' + t.notes : ''}`
      );
    }
    setShowForm(false);
  };

  const onDeleteTransaction = (id: string) => {
    const target = transactions.find(t => t.id === id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    if (target) {
      const sign = target.type === 'expense' ? '-' : '+';
      logFinancialActivity(
        `Removed Transaction: "${target.description}" (${sign}$${target.amount.toLocaleString()})`,
        `Category: ${target.category} | Method: ${target.institution || 'Cash in Hand'}`
      );
    }
  };

  const handleUpdateCategoryBudget = (cat: string, amt: number) => {
    const oldBudget = categoryBudgets[cat] || 0;
    setCategoryBudgets(prev => ({ ...prev, [cat]: amt }));
    logFinancialActivity(
      `Adjusted Budget Limit: "${cat}" set to $${amt.toLocaleString()}`,
      `Previous allocation was $${oldBudget.toLocaleString()}`
    );
  };

  // Pulls new transactions for a linked bank/investment connection. This was
  // previously unreachable from the UI — syncBankData() existed and worked
  // (against the simulated /api/ai/bank-sync endpoint) but nothing ever
  // called it, so a linked account never actually synced after the initial
  // link. Wired up from a "Sync Now" action in Settings.
  const handleSyncBank = useCallback(async (institution: string) => {
    const conn = bankConnections.find(c => c.institution === institution);
    if (!conn || conn.status === 'syncing') return;

    setBankConnections(prev => prev.map(c => c.institution === institution ? { ...c, status: 'syncing' } : c));

    try {
      const results = await syncBankData(institution, conn.lastSynced);
      if (results.length > 0) {
        const existingKeys = new Set(
          transactions
            .filter(t => t.institution === institution)
            .map(t => `${t.date}|${t.description}|${t.amount}`)
        );
        const newTransactions: Transaction[] = results
          .filter((r: any) => r && typeof r.amount === 'number' && r.description)
          .filter((r: any) => !existingKeys.has(`${r.date}|${r.description}|${r.amount}`))
          .map((r: any) => ({
            id: generateId(),
            date: r.date || new Date().toISOString().split('T')[0],
            amount: r.amount,
            category: r.category || 'Other',
            description: r.description,
            type: r.type === 'income' ? 'income' : 'expense',
            institution,
          }));

        if (newTransactions.length > 0) {
          setTransactions(prev => [...newTransactions, ...prev]);
          logFinancialActivity(
            `Synced ${newTransactions.length} transaction${newTransactions.length === 1 ? '' : 's'} from ${institution}`,
            `Bank Sync`
          );
        }
      }
    } catch (err) {
      console.warn('Bank sync failed:', err);
    } finally {
      setBankConnections(prev => prev.map(c => c.institution === institution ? { ...c, status: 'linked', lastSynced: new Date().toISOString() } : c));
    }
  }, [bankConnections, transactions, logFinancialActivity]);

  const onUpdateRecurring = (item: RecurringExpense) => {
    setRecurringExpenses(prev => prev.map(e => e.id === item.id ? item : e));
  };

  const onAddRecurring = (item: Omit<RecurringExpense, 'id' | 'accumulatedOverdue'>) => {
    const newRec = { ...item, id: generateId(), accumulatedOverdue: 0 };
    setRecurringExpenses(prev => [...prev, newRec]);
    logFinancialActivity(
      `Added Recurring Bill Commitment: "${item.description}" ($${item.amount.toLocaleString()}/mo)`,
      `Category: ${item.category} | Due Day: ${item.dayOfMonth} | Next Due: ${item.nextDueDate}`
    );
  };

  const onPayRecurring = (bill: RecurringExpense, amount: number) => {
    const newT: Transaction = {
      id: generateId(),
      date: new Date().toISOString().split('T')[0],
      amount,
      category: bill.category,
      description: `Payment: ${bill.description}`,
      type: 'expense',
      recurringId: bill.id,
      institution: 'Cash in Hand'
    };
    setTransactions(prev => [newT, ...prev]);

    const nextDue = new Date(bill.nextDueDate);
    nextDue.setMonth(nextDue.getMonth() + 1);
    onUpdateRecurring({ 
      ...bill, 
      nextDueDate: nextDue.toISOString().split('T')[0],
      lastBilledDate: new Date().toISOString().split('T')[0]
    });

    logFinancialActivity(
      `Cleared Commitment / Paid Bill: "${bill.description}" (-$${amount.toLocaleString()})`,
      `Category: ${bill.category} | Method: Cash in Hand | Next Cycle Due: ${nextDue.toISOString().split('T')[0]}`
    );
  };

  const onReceiveRecurringIncome = (inc: RecurringIncome, amount: number, destination: string) => {
    const newT: Transaction = {
      id: generateId(),
      date: new Date().toISOString().split('T')[0],
      amount,
      category: inc.category,
      description: `Income: ${inc.description}`,
      type: 'income',
      recurringId: inc.id,
      institution: destination
    };
    setTransactions(prev => [newT, ...prev]);

    const nextConf = new Date(inc.nextConfirmationDate);
    nextConf.setMonth(nextConf.getMonth() + 1);
    setRecurringIncomes(prev => prev.map(i => i.id === inc.id ? { 
      ...i, 
      nextConfirmationDate: nextConf.toISOString().split('T')[0],
      lastConfirmedDate: new Date().toISOString().split('T')[0]
    } : i));

    logFinancialActivity(
      `Recorded Inflow / Received Income: "${inc.description}" (+$${amount.toLocaleString()})`,
      `Category: ${inc.category} | Destination: ${destination} | Next Expected: ${nextConf.toISOString().split('T')[0]}`
    );
  };

  const liquidFunds = useMemo(() => {
    const bankSum = bankConnections
      .filter(c => c.institutionType === 'bank')
      .reduce((acc, c) => acc + (c.openingBalance || 0), 0);
    
    const flow = transactions.reduce((acc, t) => {
      const isBank = t.institution && bankConnections.some(bc => bc.institution === t.institution && bc.institutionType === 'bank');
      // Bug: this used to compare bc.institution to t.institution (the SOURCE
      // institution) instead of t.destinationInstitution, so a transfer whose
      // destination was a bank never counted toward that bank's balance (and
      // a transfer merely originating from a bank was miscounted as if it
      // were arriving at one), skewing the Total Liquid Funds figure whenever
      // a transfer/withdrawal was involved.
      const isToBank = t.destinationInstitution && bankConnections.some(bc => bc.institution === t.destinationInstitution && bc.institutionType === 'bank');
      
      if (isBank) {
        if (t.type === 'income') return acc + t.amount;
        if (t.type === 'expense' || t.type === 'transfer' || t.type === 'savings') return acc - t.amount;
      }
      if (isToBank && (t.type === 'transfer' || t.type === 'withdrawal')) return acc + t.amount;
      return acc;
    }, 0);

    return bankSum + flow + cashOpeningBalance;
  }, [bankConnections, transactions, cashOpeningBalance]);

  const handleUpdateCalendarItems = (items: CalendarItem[]) => {
    setCalendarItems(items);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <i className="fas fa-circle-notch fa-spin text-indigo-400 text-3xl"></i>
      </div>
    );
  }

  if (inviteToken) {
    return (
      <InviteAcceptScreen
        token={inviteToken}
        currentUser={authUser}
        onAuthenticated={handleAuthenticated}
        onAccepted={() => {
          clearInviteRoute();
          setActiveTab('events');
        }}
        onCancel={clearInviteRoute}
        onSwitchAccount={() => { handleLogout(); }}
      />
    );
  }

  return (
    <div className={`min-h-screen bg-stone-50 flex flex-col ${privacyMode ? 'privacy-mode-enabled' : ''}`}>
      {!isAuthenticated ? (
        <Login onAuthenticated={handleAuthenticated} resetToken={resetToken} onResetHandled={clearResetRoute} initialBanner={authBanner} />
      ) : (
        <>
          <MarketTicker prices={marketPrices} quotaExhausted={quotaExhausted} />
          
          <header className="fixed top-9 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-b border-stone-200/90 px-3 sm:px-6 flex items-center justify-between z-[110] print:hidden shadow-xs">
            <div className="flex items-center gap-2 sm:gap-4 w-full max-w-7xl mx-auto justify-between">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                {/* Logo & Brand */}
                <div 
                  className="flex items-center gap-2 sm:gap-2.5 shrink-0 cursor-pointer group" 
                  onClick={() => isAdmin && setActiveTab('dashboard')}
                  title="Fire Finance Pro"
                >
                  <img
                    src={APP_LOGO}
                    alt="Fire Finance Pro Logo"
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-lg object-cover shrink-0 shadow-xs ring-1 ring-slate-900/10 group-hover:scale-105 transition-transform"
                  />
                  <div>
                    <h1 className="text-sm sm:text-base font-display font-semibold tracking-tight text-stone-900 whitespace-nowrap leading-none">
                      FFPRO <span className="font-sans font-bold text-indigo-600 text-[10px] uppercase tracking-wider ml-0.5">V1</span>
                    </h1>
                    <p className="text-[9px] font-medium text-stone-400 tracking-wider uppercase leading-none mt-1 hidden xs:block">Fire Finance Pro</p>
                  </div>
                </div>

                {/* Main Menu Tabs (Desktop / Tablet) */}
                <nav className="hidden md:flex items-center gap-1 shrink-0 bg-stone-100/80 p-1 rounded-full border border-stone-200/60">
                  {isAdmin && (
                    <button 
                      onClick={() => setActiveTab('dashboard')} 
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                        activeTab === 'dashboard' 
                          ? 'bg-stone-900 text-white shadow-xs' 
                          : 'text-stone-600 hover:text-stone-900 hover:bg-white/70'
                      }`}
                      title="Dashboard (⌘1)"
                    >
                      <LayoutDashboard size={13} />
                      <span>Dashboard</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setActiveTab('calendar')} 
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                      activeTab === 'calendar' 
                        ? 'bg-stone-900 text-white shadow-xs' 
                        : 'text-stone-600 hover:text-stone-900 hover:bg-white/70'
                    }`}
                    title="Calendar (⌘2)"
                  >
                    <CalendarIcon size={13} />
                    <span>Calendar</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('events')} 
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                      activeTab === 'events' 
                        ? 'bg-stone-900 text-white shadow-xs' 
                        : 'text-stone-600 hover:text-stone-900 hover:bg-white/70'
                    }`}
                    title="Planner (⌘3)"
                  >
                    <Zap size={13} />
                    <span>Planner</span>
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={() => setActiveTab('projections')} 
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                        activeTab === 'projections' 
                          ? 'bg-stone-900 text-white shadow-xs' 
                          : 'text-stone-600 hover:text-stone-900 hover:bg-white/70'
                      }`}
                      title="Forecast (⌘4)"
                    >
                      <TrendingUp size={13} />
                      <span>Forecast</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={() => setActiveTab('funding')} 
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                        activeTab === 'funding' 
                          ? 'bg-stone-900 text-white shadow-xs' 
                          : 'text-stone-600 hover:text-stone-900 hover:bg-white/70'
                      }`}
                      title="Funding (⌘5)"
                    >
                      <Landmark size={13} />
                      <span>Funding</span>
                    </button>
                  )}
                </nav>
              </div>

              {/* Right Side Header Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                {/* Desktop Quick Command Palette Bar Trigger */}
                <button
                  type="button"
                  onClick={() => setShowCommandPalette(true)}
                  className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-100/90 hover:bg-stone-200/80 border border-stone-200/80 text-stone-500 hover:text-stone-900 transition-all text-xs group"
                  title="Quick Command & Search (⌘K)"
                >
                  <Search size={14} className="text-stone-400 group-hover:text-stone-700" />
                  <span className="text-stone-600 group-hover:text-stone-900 font-medium">Quick Find...</span>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-bold text-stone-500 bg-white border border-stone-200 rounded shadow-2xs font-mono">⌘K</kbd>
                </button>

                {/* Cloud Sync Status Pill */}
                <button
                  type="button"
                  onClick={handleManualSync}
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    cloudSyncing
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : cloudError
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                  }`}
                  title={cloudSyncing ? 'Syncing with cloud...' : 'Cloud Synced • Click to sync immediately (S)'}
                >
                  <RefreshCw size={12} className={cloudSyncing ? 'animate-spin text-indigo-600' : 'text-stone-400'} />
                  <span className="text-[10px] uppercase tracking-wider font-bold">
                    {cloudSyncing ? 'Syncing' : cloudError ? 'Offline' : 'Synced'}
                  </span>
                </button>

                {/* Privacy Mode Toggle */}
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg transition-all border shadow-2xs ${
                    privacyMode 
                      ? 'bg-amber-50 text-amber-800 border-amber-300' 
                      : 'bg-stone-50 text-stone-600 hover:text-stone-900 hover:bg-stone-100 border-stone-200'
                  }`}
                  title={privacyMode ? 'Privacy Mode Active (Masked) - Click to unmask (P)' : 'Toggle Financial Privacy Mode (P)'}
                  aria-label="Toggle Financial Privacy Mode"
                >
                  {privacyMode ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>

                {/* Mobile Quick Add Button */}
                {isAdmin && (
                  <button
                    onClick={() => {
                      setEditingTransaction(null);
                      setShowForm(true);
                    }}
                    className="flex md:hidden items-center justify-center w-8 h-8 rounded-lg bg-stone-900 text-white shadow-2xs hover:bg-stone-800 transition active:scale-95"
                    title="Add Transaction (N)"
                    aria-label="Add Transaction"
                  >
                    <Plus size={16} />
                  </button>
                )}

                {/* PWA Install Button */}
                {deferredPrompt && (
                  <button 
                    onClick={handleInstall}
                    className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-indigo-100 hover:bg-indigo-100 transition-all"
                  >
                    <Download size={12} />
                    <span>Install</span>
                  </button>
                )}

                {/* Notification Center Bell Button */}
                <button 
                  type="button"
                  onClick={() => setShowNotificationsModal(true)} 
                  className="relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-stone-50 text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-all border border-stone-200 shadow-2xs"
                  title="Notification Center"
                  aria-label="Notification Center"
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-2xs animate-pulse">
                      {badgeLabel}
                    </span>
                  )}
                </button>

                {/* Keyboard Shortcuts Button */}
                <button
                  type="button"
                  onClick={() => setShowShortcutsModal(true)}
                  className="hidden md:flex w-8 h-8 sm:w-9 sm:h-9 items-center justify-center rounded-lg bg-stone-50 text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-all border border-stone-200 shadow-2xs"
                  title="Keyboard Shortcuts (?)"
                  aria-label="Keyboard Shortcuts"
                >
                  <Keyboard size={15} />
                </button>

                {/* Settings Button */}
                <button 
                  onClick={() => setShowSettings(true)} 
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-stone-50 text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-all border border-stone-200 shadow-2xs"
                  title="System Settings"
                >
                  <SettingsIcon size={16} />
                </button>

                {/* User Account Button */}
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs uppercase shadow-2xs border border-indigo-200/60 hover:bg-indigo-200 transition-colors"
                  title={`Account: ${currentUsername}`}
                >
                  {currentUsername.charAt(0)}
                </button>

                {/* Mobile Hamburger Drawer Toggle */}
                <button
                  onClick={() => setMobileMenuOpen(prev => !prev)}
                  className="flex md:hidden w-8 h-8 items-center justify-center rounded-lg bg-stone-100 text-stone-700 hover:text-stone-900 hover:bg-stone-200 transition border border-stone-200/80 active:scale-95"
                  title="Toggle Navigation Menu"
                  aria-label="Toggle Navigation Menu"
                >
                  {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 max-w-7xl mx-auto w-full pt-28 sm:pt-32 px-3 sm:px-6 pb-24 md:pb-12">
            {activeTab === 'dashboard' && isAdmin && (
              <div className="space-y-8">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                   <div>
                     <h1 className="text-3xl font-display text-stone-900 tracking-tight">Command Center</h1>
                     <p className="text-[11px] text-stone-500 font-semibold uppercase tracking-widest mt-2">Strategic Intelligence Hub</p>
                   </div>
                   <div className="w-full md:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-stone-900 text-white rounded-full text-xs font-bold hover:bg-stone-800 transition shadow-sm w-full md:w-auto"
                      >
                        <Plus size={14} />
                        Add Transaction
                      </button>
                   </div>
                </header>

                <Dashboard 
                  transactions={transactions}
                  recurringExpenses={recurringExpenses}
                  recurringIncomes={recurringIncomes}
                  savingGoals={savingGoals}
                  investmentGoals={investmentGoals}
                  investments={investments}
                  marketPrices={marketPrices}
                  bankConnections={bankConnections}
                  targetMargin={0} 
                  cashOpeningBalance={cashOpeningBalance}
                  categoryBudgets={categoryBudgets}
                  financialLogs={financialLogs}
                  currentUser={currentUsername || 'User'}
                  userEmail={authUser?.email}
                  events={allEventsForSummary}
                  calendarItems={calendarItems}
                  onEdit={(t) => {
                    setEditingTransaction(t);
                    setShowForm(true);
                  }}
                  onDelete={onDeleteTransaction}
                  onPayRecurring={onPayRecurring}
                  onReceiveRecurringIncome={onReceiveRecurringIncome}
                  onContributeSaving={() => {}}
                  onWithdrawSaving={() => {}}
                  onWithdrawal={() => {}}
                  onAddIncome={() => {}}
                  onUpdateCategoryBudget={handleUpdateCategoryBudget}
                  onOpenTransactionForm={() => {
                    setEditingTransaction(null);
                    setShowForm(true);
                  }}
                  onDeleteFinancialLog={(id) => setFinancialLogs(prev => prev.filter(l => l.id !== id))}
                  onNavigateToPlannerLogs={() => setActiveTab('events')}
                  onNavigateToTask={(taskId, projectId) => {
                    if (projectId) {
                      setNavSelectedEventId(projectId);
                    } else {
                      // Find if a local event contains this taskId
                      const found = events.find(ev => ev.id === taskId || (ev.tasks && ev.tasks.some(t => t.id === taskId)));
                      if (found) {
                        setNavSelectedEventId(found.id);
                      }
                    }
                    setNavSelectedTaskId(taskId);
                    setActiveTab('events');
                  }}
                  onNavigateToPlanner={() => setActiveTab('events')}
                />
              </div>
            )}

            {activeTab === 'calendar' && (
              <Calendar 
                events={allEventsForSummary}
                calendarItems={calendarItems}
                transactions={transactions}
                recurringExpenses={recurringExpenses}
                recurringIncomes={recurringIncomes}
                onUpdateItems={handleUpdateCalendarItems}
                onToggleTaskCompletion={(eventId, taskId) => {
                  setEvents(prev => prev.map(ev => {
                    if (ev.id === eventId) {
                      const updatedTasks = (ev.tasks || []).map(t =>
                        t.id === taskId ? { ...t, completed: !t.completed, status: (!t.completed ? 'completed' : 'not_started') as TaskStatus } : t
                      );
                      return { ...ev, tasks: updatedTasks, lastUpdated: new Date().toISOString() };
                    }
                    return ev;
                  }));
                }}
              />
            )}

            {activeTab === 'events' && (
              <EventPlanner 
                events={events}
                contacts={contacts}
                directoryHandle={null}
                currentUser={currentUsername}
                currentUserId={authUser?.id}
                isAdmin={isAdmin}
                initialSelectedEventId={navSelectedEventId}
                initialSelectedTaskId={navSelectedTaskId}
                onAddEvent={(e) => {
                  const newId = e.id || generateId();
                  setEvents(prev => [{
                    ...e,
                    id: newId,
                    items: e.items || [],
                    notes: e.notes || [],
                    tasks: e.tasks || [],
                    files: e.files || [],
                    contactIds: e.contactIds || [],
                    memberUsernames: e.memberUsernames || [],
                    ious: e.ious || [],
                    lastUpdated: new Date().toISOString()
                  }, ...prev]);
                  return newId;
                }}
                onDeleteEvent={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
                onUpdateEvent={(e) => setEvents(prev => prev.map(ev => ev.id === e.id ? e : ev))}
                onUpdateContacts={setContacts}
                ideas={ideas}
                onUpdateIdeas={setIdeas}
              />
            )}

            {activeTab === 'projections' && isAdmin && (
              <Projections 
                transactions={transactions}
                recurringExpenses={recurringExpenses}
                recurringIncomes={recurringIncomes}
                investments={investments}
                marketPrices={marketPrices}
                categoryBudgets={categoryBudgets}
                forecastSettings={forecastSettings}
                onUpdateForecastSettings={setForecastSettings}
                currentNetWorth={liquidFunds + investments.reduce((acc, inv) => acc + inv.holdings.reduce((hAcc, h) => hAcc + (h.quantity * (marketPrices.find(m => m.symbol === h.symbol)?.price || 0)), 0), 0)}
              />
            )}

            {activeTab === 'funding' && isAdmin && (
              <FundingFinder />
            )}
          </main>

          {/* Mobile Bottom Navigation Bar */}
          <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-stone-200 z-[100] md:hidden shadow-lg flex items-center justify-around px-1 pb-safe print:hidden">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
                  activeTab === 'dashboard'
                    ? 'text-stone-900 font-bold'
                    : 'text-stone-400 hover:text-stone-700 font-medium'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  activeTab === 'dashboard' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-500'
                }`}>
                  <LayoutDashboard size={16} />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight leading-none">Dashboard</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
                activeTab === 'calendar'
                  ? 'text-stone-900 font-bold'
                  : 'text-stone-400 hover:text-stone-700 font-medium'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                activeTab === 'calendar' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-500'
              }`}>
                <CalendarIcon size={16} />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight leading-none">Calendar</span>
            </button>

            {/* Mobile Center Quick-Action Button */}
            <button
              type="button"
              onClick={() => setShowCommandPalette(true)}
              className="flex flex-col items-center justify-center -mt-5 py-0 px-2 group"
              title="Quick Commands & Actions"
            >
              <div className="w-12 h-12 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-lg border-[3px] border-white group-hover:scale-105 group-active:scale-95 transition-transform">
                <Plus size={22} className="text-white" />
              </div>
              <span className="text-[9px] font-bold text-stone-600 mt-0.5 tracking-tight">Actions</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
                activeTab === 'events'
                  ? 'text-stone-900 font-bold'
                  : 'text-stone-400 hover:text-stone-700 font-medium'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                activeTab === 'events' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-500'
              }`}>
                <Zap size={16} />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight leading-none">Planner</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('projections')}
                className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
                  activeTab === 'projections'
                    ? 'text-stone-900 font-bold'
                    : 'text-stone-400 hover:text-stone-700 font-medium'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  activeTab === 'projections' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-500'
                }`}>
                  <TrendingUp size={16} />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight leading-none">Forecast</span>
              </button>
            )}
          </nav>

          {/* Mobile Slide-Over Drawer Navigation */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <div className="fixed inset-0 z-[150] md:hidden">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileMenuOpen(false)}
                  className="absolute inset-0 bg-stone-900/50 backdrop-blur-xs"
                />

                {/* Drawer Panel */}
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 260 }}
                  className="absolute top-0 right-0 bottom-0 w-[85vw] max-w-sm bg-white shadow-2xl flex flex-col z-10 overflow-y-auto"
                >
                  {/* Drawer Header */}
                  <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm uppercase shadow-xs">
                        {currentUsername.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-stone-900 text-sm">{currentUsername}</h3>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200/80 text-stone-700">
                            {isAdmin ? 'Admin' : 'Member'}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate max-w-[170px]">{authUser?.email || 'Authenticated User'}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-stone-500 hover:text-stone-900 border border-stone-200 shadow-2xs"
                      aria-label="Close menu"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Sync Status Banner */}
                  <div className="px-5 py-3 bg-stone-100/60 border-b border-stone-100 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cloudSyncing ? 'bg-indigo-500 animate-pulse' : cloudError ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <span className="text-stone-600 font-medium">
                        {cloudSyncing ? 'Syncing cloud data...' : cloudError ? 'Sync offline' : 'Cloud synchronized'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { pushToCloud(true); }}
                      disabled={cloudSyncing}
                      className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider hover:text-indigo-800 disabled:opacity-50"
                    >
                      Sync Now
                    </button>
                  </div>

                  {/* Navigation List */}
                  <div className="p-4 space-y-1.5 flex-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">Navigation Menu</div>
                    
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                          activeTab === 'dashboard' ? 'bg-stone-900 text-white shadow-xs' : 'hover:bg-stone-100 text-stone-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <LayoutDashboard size={18} className={activeTab === 'dashboard' ? 'text-indigo-400' : 'text-stone-500'} />
                          <div>
                            <div className="text-xs font-bold">Command Center</div>
                            <div className={`text-[10px] ${activeTab === 'dashboard' ? 'text-stone-400' : 'text-stone-400'}`}>Strategic Intelligence Hub</div>
                          </div>
                        </div>
                        <ChevronRight size={16} className={activeTab === 'dashboard' ? 'text-stone-400' : 'text-stone-300'} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => { setActiveTab('calendar'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                        activeTab === 'calendar' ? 'bg-stone-900 text-white shadow-xs' : 'hover:bg-stone-100 text-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <CalendarIcon size={18} className={activeTab === 'calendar' ? 'text-indigo-400' : 'text-stone-500'} />
                        <div>
                          <div className="text-xs font-bold">Financial Calendar</div>
                          <div className={`text-[10px] ${activeTab === 'calendar' ? 'text-stone-400' : 'text-stone-400'}`}>Dates, Commitments & Schedules</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className={activeTab === 'calendar' ? 'text-stone-400' : 'text-stone-300'} />
                    </button>

                    <button
                      type="button"
                      onClick={() => { setActiveTab('events'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                        activeTab === 'events' ? 'bg-stone-900 text-white shadow-xs' : 'hover:bg-stone-100 text-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Zap size={18} className={activeTab === 'events' ? 'text-indigo-400' : 'text-stone-500'} />
                        <div>
                          <div className="text-xs font-bold">Event & Project Planner</div>
                          <div className={`text-[10px] ${activeTab === 'events' ? 'text-stone-400' : 'text-stone-400'}`}>Projects, Tasks, IOUs & Budgets</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className={activeTab === 'events' ? 'text-stone-400' : 'text-stone-300'} />
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => { setActiveTab('projections'); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                          activeTab === 'projections' ? 'bg-stone-900 text-white shadow-xs' : 'hover:bg-stone-100 text-stone-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <TrendingUp size={18} className={activeTab === 'projections' ? 'text-indigo-400' : 'text-stone-500'} />
                          <div>
                            <div className="text-xs font-bold">Wealth Forecast</div>
                            <div className={`text-[10px] ${activeTab === 'projections' ? 'text-stone-400' : 'text-stone-400'}`}>Projections & Strategic AI Advisory</div>
                          </div>
                        </div>
                        <ChevronRight size={16} className={activeTab === 'projections' ? 'text-stone-400' : 'text-stone-300'} />
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => { setActiveTab('funding'); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                          activeTab === 'funding' ? 'bg-stone-900 text-white shadow-xs' : 'hover:bg-stone-100 text-stone-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Landmark size={18} className={activeTab === 'funding' ? 'text-indigo-400' : 'text-stone-500'} />
                          <div>
                            <div className="text-xs font-bold">Funding & Grants Finder</div>
                            <div className={`text-[10px] ${activeTab === 'funding' ? 'text-stone-400' : 'text-stone-400'}`}>Automated Discovery & Ollama Triage</div>
                          </div>
                        </div>
                        <ChevronRight size={16} className={activeTab === 'funding' ? 'text-stone-400' : 'text-stone-300'} />
                      </button>
                    )}

                    <div className="pt-3 pb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">Quick Actions</div>

                    {/* Quick Command & Search */}
                    <button
                      type="button"
                      onClick={() => { setShowCommandPalette(true); setMobileMenuOpen(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl text-left bg-stone-100/80 hover:bg-stone-200/80 text-stone-800 transition-all border border-stone-200/60"
                    >
                      <div className="flex items-center gap-3">
                        <Search size={18} className="text-stone-600" />
                        <div>
                          <div className="text-xs font-bold">Quick Command & Search</div>
                          <div className="text-[10px] text-stone-400">Jump anywhere, search items or run actions</div>
                        </div>
                      </div>
                      <kbd className="px-1.5 py-0.5 text-[9px] font-bold text-stone-500 bg-white border border-stone-200 rounded font-mono">⌘K</kbd>
                    </button>

                    {/* Financial Privacy Mode Toggle */}
                    <button
                      type="button"
                      onClick={() => { togglePrivacyMode(); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border ${
                        privacyMode 
                          ? 'bg-amber-50 text-amber-900 border-amber-200' 
                          : 'hover:bg-stone-100 text-stone-700 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {privacyMode ? <EyeOff size={18} className="text-amber-600" /> : <Eye size={18} className="text-stone-500" />}
                        <div>
                          <div className="text-xs font-bold">Privacy Mode: {privacyMode ? 'Active' : 'Off'}</div>
                          <div className="text-[10px] text-stone-400">{privacyMode ? 'Financial numbers are masked' : 'Mask balances and monetary values'}</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-stone-300" />
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowNotificationsModal(true); setMobileMenuOpen(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl text-left bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-950 border border-indigo-100 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Bell size={18} className="text-indigo-600" />
                          {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-rose-600 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                              {badgeLabel}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            <span>Notification Center</span>
                            {unreadCount > 0 && (
                              <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[9px] font-bold rounded-full">
                                {unreadCount} unread
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-500">Tasks, Calendar, Gmail & Financial Alerts</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-stone-300" />
                    </button>

                    {/* Keyboard Shortcuts Sheet */}
                    <button
                      type="button"
                      onClick={() => { setShowShortcutsModal(true); setMobileMenuOpen(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl text-left hover:bg-stone-100 text-stone-700 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Keyboard size={18} className="text-stone-500" />
                        <div>
                          <div className="text-xs font-bold">Keyboard Shortcuts</div>
                          <div className="text-[10px] text-stone-400">View hotkey shortcuts list</div>
                        </div>
                      </div>
                      <kbd className="px-1.5 py-0.5 text-[9px] font-bold text-stone-500 bg-white border border-stone-200 rounded font-mono">?</kbd>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => { setShowForm(true); setMobileMenuOpen(false); }}
                        className="w-full flex items-center justify-between p-3 rounded-xl text-left bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <Plus size={18} className="text-emerald-700" />
                          <div>
                            <div className="text-xs font-bold">Add Transaction</div>
                            <div className="text-[10px] text-emerald-600">Record expense, inflow or transfer</div>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-emerald-500" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => { setShowSettings(true); setMobileMenuOpen(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl text-left hover:bg-stone-100 text-stone-700 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <SettingsIcon size={18} className="text-stone-500" />
                        <div>
                          <div className="text-xs font-bold">System Settings</div>
                          <div className="text-[10px] text-stone-400">Gateways, Vault, Backups & Sync</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-stone-300" />
                    </button>

                    {deferredPrompt && (
                      <button
                        type="button"
                        onClick={() => { handleInstall(); setMobileMenuOpen(false); }}
                        className="w-full flex items-center justify-between p-3 rounded-xl text-left hover:bg-indigo-50 text-indigo-700 transition-all border border-indigo-100"
                      >
                        <div className="flex items-center gap-3">
                          <Download size={18} className="text-indigo-600" />
                          <div>
                            <div className="text-xs font-bold">Install Mobile App</div>
                            <div className="text-[10px] text-indigo-500">Save to home screen (PWA)</div>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-indigo-400" />
                      </button>
                    )}
                  </div>

                  {/* Drawer Footer */}
                  <div className="p-4 border-t border-stone-100 bg-stone-50/50 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200/60 transition-all"
                    >
                      <LogOut size={15} />
                      <span>Sign Out</span>
                    </button>
                    <div className="text-center text-[10px] text-stone-400 font-medium pt-1">
                      Fire Finance Pro v1.0.0
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {showForm && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
              <div className="w-full max-w-xl">
                <TransactionForm 
                  initialData={editingTransaction || undefined}
                  onAdd={onSaveTransaction} 
                  onCancel={() => {
                    setShowForm(false);
                    setEditingTransaction(null);
                  }} 
                  bankConnections={bankConnections} 
                />
              </div>
            </div>
          )}

          {showSettings && (
            <Settings 
              salary={0}
              onUpdateSalary={() => {}}
              targetMargin={0}
              cashOpeningBalance={cashOpeningBalance}
              onUpdateCashOpeningBalance={setCashOpeningBalance}
              categoryBudgets={categoryBudgets}
              onUpdateCategoryBudgets={setCategoryBudgets}
              recurringExpenses={recurringExpenses}
              onAddRecurring={onAddRecurring}
              onUpdateRecurring={onUpdateRecurring}
              onDeleteRecurring={(id) => setRecurringExpenses(prev => prev.filter(e => e.id !== id))}
              recurringIncomes={recurringIncomes}
              onAddRecurringIncome={(i) => setRecurringIncomes(prev => [...prev, {...i, id: generateId()}])}
              onUpdateRecurringIncome={(i) => setRecurringIncomes(prev => prev.map(inc => inc.id === i.id ? i : inc))}
              onDeleteRecurringIncome={(id) => setRecurringIncomes(prev => prev.filter(i => i.id !== id))}
              savingGoals={savingGoals}
              onAddSavingGoal={(s) => setSavingGoals(prev => [...prev, {...s, id: generateId(), currentAmount: 0}])}
              onDeleteSavingGoal={(id) => setSavingGoals(prev => prev.filter(s => s.id !== id))}
              investmentGoals={investmentGoals}
              onAddInvestmentGoal={(i) => setInvestmentGoals(prev => [...prev, {...i, id: generateId()}])}
              onDeleteInvestmentGoal={(id) => setInvestmentGoals(prev => prev.filter(i => i.id !== id))}
              onExportData={() => {}}
              onResetData={() => {
                if (!confirm("Purge all data for this account? This clears both this device and your cloud-synced copy, and cannot be undone.")) return;
                dataSyncService.clear()
                  .catch((e) => console.warn('Cloud purge failed (continuing with local purge):', e))
                  .finally(() => { localStorage.clear(); window.location.reload(); });
              }}
              onClose={() => setShowSettings(false)}
              onLogout={handleLogout}
              remindersEnabled={false}
              onToggleReminders={() => {}}
              bankConnections={bankConnections}
              onResetBank={() => setBankConnections([])}
              onUpdatePassword={() => {}}
              users={[]}
              onUpdateUsers={() => {}}
              isAdmin={isAdmin}
              onOpenBankSync={() => setShowBankSync(true)}
              onUnlinkBank={(inst) => setBankConnections(prev => prev.filter(c => c.institution !== inst))}
              onSyncBank={handleSyncBank}
              cloudSyncing={cloudSyncing}
              cloudLoaded={cloudLoaded}
              cloudError={cloudError}
              cloudLastSyncTime={cloudLastSyncTime}
              cloudVersion={cloudVersion}
              realtimeStatus={realtimeStatus}
              onForceSync={() => {
                pushToCloud(true);
              }}
            />
          )}

          {showBankSync && (
            <BankSyncModal 
              onSuccess={(inst, last4, bal, type) => {
                setBankConnections(prev => [...prev, { institution: inst, institutionType: type, status: 'linked', accountLastFour: last4, openingBalance: bal, lastSynced: new Date().toISOString() }]);
                setShowBankSync(false);
              }}
              onClose={() => setShowBankSync(false)}
            />
          )}

          <NotificationsModal
            isOpen={showNotificationsModal}
            onClose={() => setShowNotificationsModal(false)}
            userEmail={authUser?.email}
            events={allEventsForSummary}
            calendarItems={calendarItems}
            recurringExpenses={recurringExpenses}
            recurringIncomes={recurringIncomes}
            categoryBudgets={categoryBudgets}
            transactions={transactions}
            bankConnections={bankConnections}
            unreadCount={unreadCount}
            badgeLabel={badgeLabel}
            onNavigateToTask={(taskId, projectId) => {
              setActiveTab('events');
              if (projectId) setNavSelectedEventId(projectId);
              setNavSelectedTaskId(taskId);
            }}
            onNavigateToPlanner={() => setActiveTab('events')}
            onNavigateToCalendar={() => setActiveTab('calendar')}
            onPayRecurring={(item, amount) => {
              const newT: Transaction = {
                id: generateId(),
                description: `Paid Bill: ${item.name || item.description || 'Recurring Expense'}`,
                amount: amount || item.amount || 0,
                category: item.category || 'Bills & Utilities',
                date: new Date().toISOString().split('T')[0],
                type: 'expense',
                institution: 'Cash in Hand',
                notes: 'Paid via Notification Center'
              };
              setTransactions(prev => [newT, ...prev]);
            }}
            onOpenTransactionForm={() => setShowForm(true)}
            onDismissEmail={dismissGmailEmail}
            externalDismissedIds={Array.from(gmailDismissedIds || [])}
          />

          <CommandPalette
            isOpen={showCommandPalette}
            onClose={() => setShowCommandPalette(false)}
            activeTab={activeTab}
            onSelectTab={(tab) => setActiveTab(tab as any)}
            onOpenNewTransaction={() => {
              setEditingTransaction(null);
              setShowForm(true);
            }}
            onOpenNotifications={() => setShowNotificationsModal(true)}
            onOpenSettings={() => setShowSettings(true)}
            onOpenShortcuts={() => setShowShortcutsModal(true)}
            onForceSync={handleManualSync}
            privacyMode={privacyMode}
            onTogglePrivacyMode={togglePrivacyMode}
            transactions={transactions}
            events={allEventsForSummary}
            onSelectTransaction={(t) => {
              setEditingTransaction(t);
              setShowForm(true);
            }}
            onSelectEvent={(eventId) => {
              setNavSelectedEventId(eventId);
              setActiveTab('events');
            }}
          />

          <KeyboardShortcutsModal
            isOpen={showShortcutsModal}
            onClose={() => setShowShortcutsModal(false)}
          />

          {isLoading && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-900/40 backdrop-blur-md">
              <div className="bg-white p-10 rounded-[3rem] text-center shadow-2xl">
                 <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                 <h3 className="text-xl font-black text-stone-800 mb-2">Parsing Intelligence</h3>
                 <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Applying Financial Logic...</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;
