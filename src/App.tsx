
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
import { syncBankData } from './bankApiService';
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
  WifiOff
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
  const [events, setEvents] = useState<BudgetEvent[]>(() => sanitizeEventLogs(safeParse(STORAGE_KEYS.EVENTS, [])));
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
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {!isAuthenticated ? (
        <Login onAuthenticated={handleAuthenticated} resetToken={resetToken} onResetHandled={clearResetRoute} initialBanner={authBanner} />
      ) : (
        <>
          <MarketTicker prices={marketPrices} quotaExhausted={quotaExhausted} />
          
          <header className="fixed top-9 left-0 right-0 h-16 bg-white border-b border-stone-200 px-3 sm:px-6 flex items-center justify-between z-[110] print:hidden shadow-xs">
            <div className="flex items-center gap-2 sm:gap-6 w-full max-w-7xl mx-auto justify-between">
              <div className="flex items-center gap-2 sm:gap-6 min-w-0">
                {/* Logo & Brand */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 cursor-pointer" onClick={() => isAdmin && setActiveTab('dashboard')}>
                  <img
                    src={APP_LOGO}
                    alt="Fire Finance Pro Logo"
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-lg object-cover shrink-0 shadow-xs ring-1 ring-slate-900/10"
                  />
                  <div className="hidden sm:block">
                    <h1 className="text-sm sm:text-base font-display font-semibold tracking-tight text-stone-900 whitespace-nowrap leading-none">
                      FFPRO <span className="font-sans font-bold text-indigo-600 text-[10px] uppercase tracking-wider ml-0.5">V1</span>
                    </h1>
                    <p className="text-[9px] font-medium text-stone-400 tracking-wider uppercase leading-none mt-1">Fire Finance Pro</p>
                  </div>
                </div>

                {/* Main Menu Tabs */}
                <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
                  {isAdmin && (
                    <button 
                      onClick={() => setActiveTab('dashboard')} 
                      className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                    >
                      <LayoutDashboard size={14} />
                      <span>Dashboard</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setActiveTab('calendar')} 
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'calendar' ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                  >
                    <CalendarIcon size={14} />
                    <span>Calendar</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('events')} 
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'events' ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                  >
                    <Zap size={14} />
                    <span>Planner</span>
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={() => setActiveTab('projections')} 
                      className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'projections' ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                    >
                      <TrendingUp size={14} />
                      <span>Forecast</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={() => setActiveTab('funding')} 
                      className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'funding' ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'}`}
                    >
                      <Landmark size={14} />
                      <span>Funding</span>
                    </button>
                  )}
                </nav>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {/* PWA Install Button */}
                {deferredPrompt && (
                  <button 
                    onClick={handleInstall}
                    className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-indigo-100 hover:bg-indigo-100 transition-all"
                  >
                    <Download size={12} />
                    <span>Install</span>
                  </button>
                )}

                <button 
                  onClick={() => setShowSettings(true)} 
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-stone-50 text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-all border border-stone-200 shadow-2xs"
                  title="System Settings"
                >
                  <SettingsIcon size={16} />
                </button>
                <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs uppercase shadow-2xs border border-indigo-200/60">
                  {currentUsername.charAt(0)}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 max-w-7xl mx-auto w-full pt-32 px-3 sm:px-6 pb-12">
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
