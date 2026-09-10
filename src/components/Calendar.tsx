import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { BudgetEvent, Transaction, RecurringExpense, RecurringIncome, ProjectTask, CalendarItem } from '../types';
import { googleCalendarService, GoogleCalendarStatus } from '../services/googleCalendarService';
import { 
  Calendar as CalendarIcon, Clock, MapPin, Video, ExternalLink, Copy, Check, 
  Trash2, Plus, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, CheckCircle2,
  Share2, Sparkles, User, Info, ShieldCheck, Link2
} from 'lucide-react';

interface Props {
  events: BudgetEvent[];
  calendarItems: CalendarItem[];
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
  recurringIncomes: RecurringIncome[];
  onUpdateItems: (items: CalendarItem[]) => void;
  onToggleTaskCompletion?: (eventId: string, taskId: string) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const Calendar: React.FC<Props> = ({ 
  events, 
  calendarItems, 
  transactions, 
  recurringExpenses, 
  recurringIncomes, 
  onUpdateItems, 
  onToggleTaskCompletion 
}) => {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [selectedEventModal, setSelectedEventModal] = useState<CalendarItem | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [creatingInGoogle, setCreatingInGoogle] = useState(false);

  // Google Calendar Integration State
  const [isSyncing, setIsSyncing] = useState(false);
  const [gcalStatus, setGcalStatus] = useState<GoogleCalendarStatus | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info'; authUrl?: string } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    const saved = localStorage.getItem('last_gcal_sync_timestamp');
    return saved ? new Date(saved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  });

  const month = viewDate.getMonth();
  const year = viewDate.getFullYear();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now);
  };

  const monthName = viewDate.toLocaleString('default', { month: 'long' });

  // Check Google Calendar connection status on mount & listen to updates
  useEffect(() => {
    let isMounted = true;
    googleCalendarService.getStatus().then(status => {
      if (isMounted) {
        setGcalStatus(status);
        if (status.connected && status.hasCalendarScope === false) {
          setSyncFeedback({
            message: 'Google Calendar permissions needed. Click Grant Permissions to enable Calendar synchronization.',
            type: 'info',
            authUrl: '/api/auth/google',
          });
        }
      }
    });

    const unsubscribe = googleCalendarService.subscribe(({ syncTime }) => {
      if (isMounted) {
        setLastSyncTime(new Date(syncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Sync Google Calendar Events into App Calendar
  const handleSyncGoogleCalendar = useCallback(async (isAuto = false) => {
    setIsSyncing(true);
    if (!isAuto) setSyncFeedback(null);

    try {
      const res = await googleCalendarService.fetchEvents();
      if (res && Array.isArray(res.events)) {
        const incomingGcalEvents = res.events;
        const incomingIds = new Set(incomingGcalEvents.map(e => e.googleEventId || e.id));

        // Preserve all manual app calendar items, and replace previous Google events with latest data
        const manualAppItems = calendarItems.filter(item => !item.isGoogleCalendar && !incomingIds.has(item.googleEventId || ''));
        
        // Merge into the app schedule
        const mergedCalendarItems = [...manualAppItems, ...incomingGcalEvents];
        onUpdateItems(mergedCalendarItems);

        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSyncTime(nowTime);
        localStorage.setItem('last_gcal_sync_timestamp', new Date().toISOString());

        if (!isAuto) {
          setSyncFeedback({
            message: `Synced ${incomingGcalEvents.length} event${incomingGcalEvents.length === 1 ? '' : 's'} from Google Calendar.`,
            type: 'success',
          });
        }
      }
    } catch (err: any) {
      console.warn('[Calendar] Google sync error:', err?.message, err?.code);
      if (!isAuto) {
        const isScopeIssue = err?.code === 'INSUFFICIENT_SCOPES' || /insufficient.*scope|permission|scope/i.test(err?.message || '');
        setSyncFeedback({
          message: isScopeIssue 
            ? 'Google Calendar read permissions are required to sync your schedule. Click Grant Permissions below to approve access.' 
            : (err?.message || 'Failed to sync Google Calendar.'),
          type: 'error',
          authUrl: isScopeIssue || err?.code === 'AUTH_REQUIRED' || err?.code === 'TOKEN_EXPIRED' ? (err?.authUrl || '/api/auth/google') : undefined,
        });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [calendarItems, onUpdateItems]);

  // Virtual Recurring Logic: Expand items into specific month occurrences
  const expandedCalendarItems = useMemo(() => {
    const items: (CalendarItem & { isVirtual?: boolean })[] = [];
    
    calendarItems.forEach(item => {
      if (item.recurring === 'none') {
        items.push(item);
        return;
      }

      // Calculate occurrences for this month
      const start = new Date(item.date);
      for (let d = 1; d <= daysInMonth; d++) {
        const current = new Date(year, month, d);
        if (current < start) continue;

        let match = false;
        if (item.recurring === 'daily') match = true;
        if (item.recurring === 'weekly' && current.getDay() === start.getDay()) match = true;
        if (item.recurring === 'monthly' && current.getDate() === start.getDate()) match = true;

        if (match) {
          items.push({
            ...item,
            id: `${item.id}-${d}`,
            date: current.toISOString().split('T')[0],
            isVirtual: current.toISOString().split('T')[0] !== item.date
          });
        }
      }
    });

    return items;
  }, [calendarItems, year, month, daysInMonth]);

  const activeEvents = useMemo(() => events.filter(e => e.status !== 'closed'), [events]);

  const allTasks = useMemo(() => {
    const tasks: { task: ProjectTask; eventName: string; eventId: string }[] = [];
    activeEvents.forEach(event => {
      (event.tasks || []).forEach(task => {
        if (task.dueDate) {
          tasks.push({ task, eventName: event.name, eventId: event.id });
        }
      });
    });
    return tasks;
  }, [activeEvents]);

  const getDayDetails = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const dayProjects = activeEvents.filter(e => e.date === dateStr);
    const dayTransactions = transactions.filter(t => t.date === dateStr);
    const dayTasks = allTasks.filter(t => t.task.dueDate === dateStr);
    const dayCalendarItems = expandedCalendarItems.filter(ci => ci.date === dateStr);
    
    const dayRecurringEx = recurringExpenses.filter(re => {
        const nextDue = new Date(re.nextDueDate);
        return nextDue.getDate() === day && nextDue.getMonth() === month && nextDue.getFullYear() === year;
    });
    
    const dayRecurringIn = recurringIncomes.filter(ri => {
        const nextConf = new Date(ri.nextConfirmationDate);
        return nextConf.getDate() === day && nextConf.getMonth() === month && nextConf.getFullYear() === year;
    });

    return { dayProjects, dayTransactions, dayTasks, dayRecurringEx, dayRecurringIn, dayCalendarItems };
  };

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [firstDayOfMonth, daysInMonth]);

  const selectedDayData = selectedDay ? getDayDetails(selectedDay.getDate()) : null;

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const date = formData.get('date') as string;
    const startTime = formData.get('startTime') as string;
    const type = formData.get('type') as any;
    const recurring = formData.get('recurring') as any;
    const description = formData.get('description') as string;
    const location = formData.get('location') as string;
    const syncToGoogle = formData.get('syncToGoogle') === 'on';
    const addMeet = formData.get('addMeet') === 'on';

    let googleEventId: string | undefined = editingItem?.googleEventId;
    let hangoutLink: string | undefined = editingItem?.hangoutLink;
    let htmlLink: string | undefined = editingItem?.htmlLink;
    let isGoogleCalendar = editingItem?.isGoogleCalendar || false;

    if (syncToGoogle && gcalStatus?.connected) {
      setCreatingInGoogle(true);
      try {
        const res = await googleCalendarService.createEvent({
          title,
          date,
          startTime: startTime || undefined,
          description: description || undefined,
          location: location || undefined,
          addMeet,
        });
        if (res.ok && res.event) {
          googleEventId = res.event.googleEventId || res.event.id;
          hangoutLink = res.event.hangoutLink;
          htmlLink = res.event.htmlLink;
          isGoogleCalendar = true;
        }
      } catch (err: any) {
        console.warn('Failed to push to Google Calendar:', err);
        alert(`Notice: Created locally, but Google Calendar sync failed: ${err.message}`);
      } finally {
        setCreatingInGoogle(false);
      }
    }

    const newItem: CalendarItem = {
      id: editingItem?.id || generateId(),
      title,
      date,
      type,
      recurring,
      startTime,
      description,
      location,
      completed: editingItem?.completed || false,
      isGoogleCalendar,
      googleEventId,
      htmlLink,
      hangoutLink,
    };

    if (editingItem) {
      onUpdateItems(calendarItems.map(item => item.id === editingItem.id ? newItem : item));
    } else {
      onUpdateItems([...calendarItems, newItem]);
    }
    setShowEditor(false);
    setEditingItem(null);
  };

  const handleDeleteItem = async (id: string, googleEventId?: string) => {
    const originalId = id.split('-')[0];
    if (googleEventId) {
      try {
        await googleCalendarService.deleteEvent(googleEventId);
      } catch (e) {
        console.warn('Could not delete from Google Calendar server-side:', e);
      }
    }
    onUpdateItems(calendarItems.filter(item => item.id !== originalId));
    if (selectedEventModal?.id === id || selectedEventModal?.id === originalId) {
      setSelectedEventModal(null);
    }
  };

  const toggleComplete = (id: string) => {
    const originalId = id.split('-')[0];
    onUpdateItems(calendarItems.map(item => item.id === originalId ? { ...item, completed: !item.completed } : item));
  };

  const startEdit = (item: CalendarItem) => {
    const originalId = item.id.split('-')[0];
    const original = calendarItems.find(i => i.id === originalId);
    if (original) {
      setEditingItem(original);
      setShowEditor(true);
    }
  };

  const handleOpenEventLink = (item: CalendarItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (item.hangoutLink) {
      window.open(item.hangoutLink, '_blank', 'noopener,noreferrer');
    } else if (item.htmlLink) {
      window.open(item.htmlLink, '_blank', 'noopener,noreferrer');
    } else {
      setSelectedEventModal(item);
    }
  };

  const copyMeetingLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-light text-stone-900 tracking-tight leading-none">
              {monthName} <span className="font-semibold text-indigo-600">{year}</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Daily 6:00 AM Sync Active
              </span>
              {lastSyncTime && (
                <span className="text-[10px] text-stone-500">
                  Last synced {lastSyncTime}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Click any calendar event to launch its Google Meet or view meeting details.
          </p>
        </div>

        <div className="flex flex-wrap items-center bg-stone-50 p-1 border border-stone-200 rounded-lg gap-1.5">
          <button 
            type="button" 
            onClick={() => handleSyncGoogleCalendar(false)} 
            disabled={isSyncing}
            title="Sync latest events from Google Calendar"
            className="px-3 h-8 flex items-center justify-center bg-white border border-stone-200 text-stone-700 font-semibold text-xs rounded shadow-xs hover:text-indigo-600 hover:border-indigo-300 transition-all disabled:opacity-50 gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Google Calendar'}</span>
          </button>
          <div className="w-px h-6 bg-stone-200 mx-0.5"></div>
          <button onClick={prevMonth} aria-label="Previous month" className="w-8 h-8 flex items-center justify-center bg-white border border-stone-200 text-stone-600 rounded shadow-xs hover:text-indigo-600 transition-all cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToToday} className="px-3 h-8 flex items-center justify-center bg-white border border-stone-200 text-stone-900 font-semibold text-xs rounded shadow-xs hover:text-indigo-600 transition-all cursor-pointer">
            Today
          </button>
          <button onClick={nextMonth} aria-label="Next month" className="w-8 h-8 flex items-center justify-center bg-white border border-stone-200 text-stone-600 rounded shadow-xs hover:text-indigo-600 transition-all cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-stone-200 mx-0.5"></div>
          <button 
            onClick={() => { setEditingItem(null); setShowEditor(true); }} 
            className="px-3 h-8 flex items-center justify-center bg-stone-900 text-white font-semibold text-xs rounded hover:bg-indigo-600 transition-all gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Schedule
          </button>
        </div>
      </header>

      {/* Sync Status Banner */}
      {syncFeedback && (
        <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-medium animate-in fade-in duration-300 ${
          syncFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          syncFeedback.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
          'bg-indigo-50 border-indigo-200 text-indigo-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {syncFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> :
             syncFeedback.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" /> :
             <Info className="w-4 h-4 text-indigo-600 shrink-0" />}
            <span>{syncFeedback.message}</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {syncFeedback.authUrl && (
              <a
                href={syncFeedback.authUrl}
                className="px-3 py-1.5 bg-stone-900 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5"
              >
                <span>Grant Permissions</span>
              </a>
            )}
            <button 
              type="button" 
              onClick={() => setSyncFeedback(null)} 
              className="text-stone-400 hover:text-stone-700 p-1"
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Month Calendar Grid */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 bg-stone-50 border-b border-stone-200 p-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center py-1.5 text-[10px] font-bold text-stone-500 uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-stone-100">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="bg-stone-50/40 min-h-[120px]"></div>;
              
              const { dayProjects, dayTasks, dayRecurringEx, dayRecurringIn, dayCalendarItems } = getDayDetails(day);
              const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
              const isSelected = selectedDay?.getDate() === day && selectedDay?.getMonth() === month && selectedDay?.getFullYear() === year;

              return (
                <div 
                  key={day} 
                  onClick={() => setSelectedDay(new Date(year, month, day))}
                  className={`bg-white min-h-[120px] p-2 transition-all cursor-pointer group relative hover:z-10 border-b border-r border-stone-100 ${
                    isSelected ? 'ring-1 ring-inset ring-indigo-500 bg-indigo-50/20' : 'hover:bg-stone-50/60'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                      isToday ? 'bg-indigo-600 text-white shadow-sm' : 'text-stone-600'
                    }`}>
                      {day}
                    </span>
                  </div>
                  
                  <div className="space-y-1 max-h-[88px] overflow-y-auto no-scrollbar">
                    {dayCalendarItems.map(ci => {
                      const hasMeet = !!ci.hangoutLink;
                      return (
                        <div 
                          key={ci.id} 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDay(new Date(year, month, day));
                            setSelectedEventModal(ci);
                          }}
                          title={ci.hangoutLink ? `Click to open Google Meet: ${ci.title}` : ci.title}
                          className={`px-1.5 py-0.5 text-[9px] font-medium rounded truncate border flex items-center justify-between gap-1 transition-all hover:scale-[1.02] cursor-pointer ${
                            ci.isGoogleCalendar 
                              ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100' 
                              : ci.type === 'meeting' 
                              ? 'bg-stone-900 text-white border-stone-800 hover:bg-stone-800' 
                              : ci.type === 'reminder' 
                              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' 
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                          } ${ci.completed ? 'opacity-40 grayscale line-through' : ''}`}
                        >
                          <div className="flex items-center gap-1 truncate">
                            {hasMeet ? (
                              <Video className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                            ) : ci.isGoogleCalendar ? (
                              <CalendarIcon className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                            ) : null}
                            {ci.startTime && <span className="opacity-75 text-[8px]">{ci.startTime}</span>}
                            <span className="truncate">{ci.title}</span>
                          </div>
                          {hasMeet && (
                            <button
                              onClick={(e) => handleOpenEventLink(ci, e)}
                              className="p-0.5 hover:bg-emerald-200 rounded text-emerald-700"
                              title="Join Google Meet directly"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {dayProjects.map(e => (
                      <div key={e.id} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-medium rounded truncate">
                        Proj: {e.name}
                      </div>
                    ))}
                    {dayTasks.map(t => (
                      <div key={t.task.id} className="px-1.5 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 text-[9px] font-medium rounded truncate">
                        Task: {t.task.text}
                      </div>
                    ))}
                    {dayRecurringEx.map(re => (
                      <div key={re.id} className="px-1.5 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 text-[9px] font-medium rounded truncate">
                        Bill: {re.description}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day Operational Report / Agenda Sidebar */}
        <aside className="space-y-6">
          <div className="bg-stone-900 p-5 rounded-xl border border-stone-800 text-white shadow-sm min-h-[550px] flex flex-col">
            <h3 className="text-indigo-400 font-bold uppercase text-[10px] tracking-wider mb-3 flex justify-between items-center">
              <span>Day Operational Agenda</span>
              <ShieldCheck className="w-4 h-4 text-stone-500" />
            </h3>

            {selectedDay ? (
              <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-center pb-3 border-b border-stone-800">
                  <div>
                    <p className="text-white font-semibold text-lg tracking-tight leading-none mb-1">
                      {selectedDay.toLocaleDateString('default', { day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">
                      {selectedDay.toLocaleDateString('default', { weekday: 'long' })}
                    </p>
                  </div>
                  <button 
                    onClick={() => { setEditingItem(null); setShowEditor(true); }} 
                    className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xs hover:bg-indigo-500 transition-all shadow-sm cursor-pointer" 
                    title="Add calendar directive"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {selectedDayData && (
                  <div className="space-y-5">
                    {/* Directives & Meetings */}
                    {(selectedDayData.dayCalendarItems || []).length > 0 && (
                      <div className="space-y-2.5">
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Events & Meetings</p>
                        {selectedDayData.dayCalendarItems.map(ci => (
                          <div 
                            key={ci.id} 
                            onClick={() => setSelectedEventModal(ci)}
                            className={`p-3.5 rounded-xl border transition-all relative group cursor-pointer ${
                              ci.isGoogleCalendar 
                                ? 'bg-blue-950/40 border-blue-800/60 hover:border-blue-500' 
                                : ci.type === 'meeting' 
                                ? 'bg-stone-800/60 border-stone-700/60 hover:border-stone-500' 
                                : ci.type === 'reminder' 
                                ? 'bg-amber-950/30 border-amber-800/50 hover:border-amber-600' 
                                : 'bg-indigo-950/30 border-indigo-800/50 hover:border-indigo-600'
                            } ${ci.completed ? 'opacity-40 grayscale' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {ci.isGoogleCalendar && (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-blue-600 text-white flex items-center gap-1">
                                    <CalendarIcon className="w-2.5 h-2.5" /> Google Calendar
                                  </span>
                                )}
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase bg-stone-700 text-stone-200">
                                  {ci.type}
                                </span>
                                {ci.startTime && (
                                  <span className="text-[10px] font-medium text-stone-300 flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5 text-stone-400" /> {ci.startTime}
                                  </span>
                                )}
                              </div>

                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                {ci.type === 'reminder' && (
                                  <button 
                                    onClick={() => toggleComplete(ci.id)} 
                                    title="Toggle completion" 
                                    className={`w-6 h-6 rounded flex items-center justify-center text-[10px] cursor-pointer ${
                                      ci.completed ? 'bg-emerald-500 text-white' : 'bg-white/10 text-stone-400 hover:bg-white/20'
                                    }`}
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                )}
                                {!ci.isGoogleCalendar && (
                                  <button 
                                    onClick={() => startEdit(ci)} 
                                    title="Edit item" 
                                    className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-stone-400 hover:text-white hover:bg-white/20 cursor-pointer"
                                  >
                                    ✎
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleDeleteItem(ci.id, ci.googleEventId)} 
                                  title="Remove item" 
                                  className="w-6 h-6 bg-rose-500/20 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500 hover:text-white cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <p className={`text-xs font-semibold ${ci.completed ? 'line-through text-stone-500' : 'text-stone-100'}`}>
                              {ci.title}
                            </p>
                            
                            {ci.description && (
                              <p className="text-[11px] text-stone-400 font-normal mt-1 line-clamp-2 leading-relaxed">
                                {ci.description}
                              </p>
                            )}

                            {ci.location && (
                              <p className="text-[10px] text-stone-400 mt-1.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-rose-400" /> {ci.location}
                              </p>
                            )}

                            {/* Meeting Link Buttons */}
                            {ci.hangoutLink && (
                              <div className="mt-3 pt-2 border-t border-stone-800/80 flex items-center gap-2">
                                <a 
                                  href={ci.hangoutLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                                >
                                  <Video className="w-3.5 h-3.5" /> Join Google Meet
                                </a>
                                {ci.htmlLink && (
                                  <a
                                    href={ci.htmlLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 text-stone-400 hover:text-white hover:bg-white/10 rounded-lg transition"
                                    title="View in Google Calendar"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedDayData.dayProjects.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Active Projects</p>
                        {selectedDayData.dayProjects.map(e => (
                          <div key={e.id} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                            <p className="text-xs font-semibold text-white">{e.name}</p>
                            <p className="text-[10px] text-stone-400 mt-0.5">Status: {e.status}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedDayData.dayTasks.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Project Deadlines</p>
                        {selectedDayData.dayTasks.map(t => (
                          <div key={t.task.id} className="p-3 bg-white/5 border border-white/10 rounded-lg flex justify-between items-center">
                            <div>
                              <p className={`text-xs font-semibold ${t.task.completed ? 'text-stone-400 line-through' : 'text-white'}`}>{t.task.text}</p>
                              <p className="text-[10px] text-stone-400 mt-0.5">Project: {t.eventName}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onToggleTaskCompletion && onToggleTaskCompletion(t.eventId, t.task.id)}
                              title={t.task.completed ? 'Mark incomplete' : 'Mark completed'}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition cursor-pointer ${
                                t.task.completed ? 'bg-emerald-500 text-white' : 'bg-white/5 text-stone-400 border border-white/10 hover:border-emerald-400 hover:text-emerald-400'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {(selectedDayData.dayRecurringEx.length > 0 || selectedDayData.dayRecurringIn.length > 0) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Financial Obligations</p>
                        {selectedDayData.dayRecurringEx.map(re => (
                          <div key={re.id} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex justify-between items-center">
                            <div>
                              <p className="text-xs font-semibold text-rose-400">{re.description}</p>
                              <p className="text-[10px] text-stone-400">Expense Due</p>
                            </div>
                            <span className="text-xs font-semibold text-rose-400">-${re.amount}</span>
                          </div>
                        ))}
                        {selectedDayData.dayRecurringIn.map(ri => (
                          <div key={ri.id} className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex justify-between items-center">
                            <div>
                              <p className="text-xs font-semibold text-emerald-400">{ri.description}</p>
                              <p className="text-[10px] text-stone-400">Income Scheduled</p>
                            </div>
                            <span className="text-xs font-semibold text-emerald-400">+${ri.amount}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedDayData.dayCalendarItems.length === 0 && 
                     selectedDayData.dayProjects.length === 0 && 
                     selectedDayData.dayTasks.length === 0 && 
                     selectedDayData.dayRecurringEx.length === 0 && 
                     selectedDayData.dayRecurringIn.length === 0 && (
                      <div className="py-16 text-center opacity-30">
                        <CalendarIcon className="w-10 h-10 mx-auto mb-2 text-stone-400 stroke-1" />
                        <p className="text-xs font-semibold uppercase tracking-wider">No events scheduled</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-40">
                <CalendarIcon className="w-10 h-10 mb-2" />
                <p className="text-xs font-semibold">Select a day on the calendar to view scheduled operations</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Event Details / Meeting Modal */}
      {selectedEventModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-stone-200 shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                    selectedEventModal.isGoogleCalendar ? 'bg-blue-100 text-blue-800' : 'bg-stone-100 text-stone-800'
                  }`}>
                    {selectedEventModal.isGoogleCalendar ? 'Google Calendar' : selectedEventModal.type}
                  </span>
                  {selectedEventModal.hangoutLink && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <Video className="w-3 h-3" /> Google Meet
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => setSelectedEventModal(null)} 
                  className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer transition"
                >
                  ✕
                </button>
              </div>

              <h3 className="text-xl font-bold text-stone-900 mb-3">{selectedEventModal.title}</h3>

              <div className="space-y-3 py-3 border-y border-stone-150 text-xs text-stone-600">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-stone-400" />
                  <span className="font-semibold text-stone-800">{new Date(selectedEventModal.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  {selectedEventModal.startTime && <span className="text-stone-500">at {selectedEventModal.startTime}</span>}
                </div>

                {selectedEventModal.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    <span>{selectedEventModal.location}</span>
                  </div>
                )}

                {selectedEventModal.description && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-stone-700 mb-1">Description</p>
                    <p className="text-stone-600 whitespace-pre-wrap bg-stone-50 p-3 rounded-lg border border-stone-200 leading-relaxed">
                      {selectedEventModal.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                {selectedEventModal.hangoutLink ? (
                  <a
                    href={selectedEventModal.hangoutLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition"
                  >
                    <Video className="w-4 h-4" /> Join Google Meet
                  </a>
                ) : null}

                {selectedEventModal.htmlLink && (
                  <a
                    href={selectedEventModal.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View in Google
                  </a>
                )}

                {selectedEventModal.hangoutLink && (
                  <button
                    onClick={() => copyMeetingLink(selectedEventModal.hangoutLink!)}
                    className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Copied!' : 'Copy Link'}
                  </button>
                )}

                <button
                  onClick={() => handleDeleteItem(selectedEventModal.id, selectedEventModal.googleEventId)}
                  className="py-2.5 px-4 text-rose-600 hover:bg-rose-50 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Directive Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-stone-900 tracking-tight">
                    {editingItem ? 'Edit Calendar Directive' : 'Schedule Event / Meeting'}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">Add to app schedule or synchronize directly with Google</p>
                </div>
                <button 
                  onClick={() => { setShowEditor(false); setEditingItem(null); }} 
                  className="w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-900 transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveItem} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-stone-700 block mb-1">Title / Subject</label>
                  <input 
                    name="title" 
                    defaultValue={editingItem?.title} 
                    required 
                    placeholder="e.g., Board Review & Budget Approval" 
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 outline-none focus:ring-1 focus:ring-indigo-500" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-700 block mb-1">Date</label>
                    <input 
                      type="date" 
                      name="date" 
                      required 
                      defaultValue={editingItem?.date || selectedDay?.toISOString().split('T')[0]} 
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-700 block mb-1">Start Time</label>
                    <input 
                      type="time" 
                      name="startTime" 
                      defaultValue={editingItem?.startTime} 
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-700 block mb-1">Type</label>
                    <select 
                      name="type" 
                      defaultValue={editingItem?.type || 'meeting'} 
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="meeting">Meeting</option>
                      <option value="reminder">Reminder</option>
                      <option value="event">Event</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-700 block mb-1">Recurrence</label>
                    <select 
                      name="recurring" 
                      defaultValue={editingItem?.recurring || 'none'} 
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="none">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-stone-700 block mb-1">Location or Meeting Room</label>
                  <input 
                    name="location" 
                    defaultValue={editingItem?.location} 
                    placeholder="e.g. Conference Room A or Remote" 
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 outline-none focus:ring-1 focus:ring-indigo-500" 
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-stone-700 block mb-1">Description / Notes</label>
                  <textarea 
                    name="description" 
                    defaultValue={editingItem?.description} 
                    placeholder="Operational notes, agenda topics..." 
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-900 outline-none focus:ring-1 focus:ring-indigo-500 h-20 resize-none" 
                  />
                </div>

                {/* Google Calendar Sync Options */}
                {gcalStatus?.connected && !editingItem && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-blue-900">
                      <input type="checkbox" name="syncToGoogle" defaultChecked className="rounded text-blue-600 focus:ring-blue-500" />
                      <span>Sync event to Google Calendar ({gcalStatus.userEmail || 'Connected'})</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-blue-800 pl-5">
                      <input type="checkbox" name="addMeet" defaultChecked className="rounded text-emerald-600 focus:ring-emerald-500" />
                      <span className="flex items-center gap-1">
                        <Video className="w-3 h-3 text-emerald-600" /> Generate Google Meet video link
                      </span>
                    </label>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={creatingInGoogle}
                  className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-xl shadow-xs transition-all text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {creatingInGoogle ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving to Google Calendar...
                    </>
                  ) : editingItem ? (
                    'Update Directive'
                  ) : (
                    'Schedule Event'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
