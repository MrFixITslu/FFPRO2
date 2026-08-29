import React, { useState, useMemo } from 'react';
import { 
  Activity, Plus, Edit3, Trash2, Search, Filter, Clock, User, 
  Download, Copy, Check, FileText, CheckCircle2, DollarSign, 
  Users, Layers, Shield, Tag, AlertTriangle, Calendar, X,
  ArrowUpDown, ArrowUp, ArrowDown, Sparkles, RefreshCw, LayoutList,
  Table as TableIcon, FileCode, ExternalLink, Save, BookOpen,
  ChevronUp, ChevronDown, CheckSquare, Eye
} from 'lucide-react';
import { EventLog } from '../types';

export type LogSortOption = 'title-asc' | 'title-desc' | 'date-desc' | 'date-asc' | 'type-asc' | 'user-asc';

interface LogsManagerProps {
  logs: EventLog[];
  currentUser: string;
  canEdit?: boolean;
  projectName: string;
  onUpdateLogs: (newLogs: EventLog[]) => void;
  onAddLog?: (log: Omit<EventLog, 'id'>) => void;
  onOpenAsDocument?: (title: string, content: string) => void;
  onSaveToVault?: (title: string, content: string) => void;
}

export const LogsManager: React.FC<LogsManagerProps> = ({
  logs = [],
  currentUser,
  canEdit = true,
  projectName,
  onUpdateLogs,
  onAddLog,
  onOpenAsDocument,
  onSaveToVault
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<LogSortOption>('title-asc');
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'document'>('cards');
  const [copied, setCopied] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  // Edit Log State
  const [editingLog, setEditingLog] = useState<EventLog | null>(null);
  const [editAction, setEditAction] = useState('');
  const [editType, setEditType] = useState<EventLog['type']>('system');
  const [editTimestamp, setEditTimestamp] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDetails, setEditDetails] = useState('');

  // Add Manual Log State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [newType, setNewType] = useState<EventLog['type']>('task');
  const [newTimestamp, setNewTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [newUsername, setNewUsername] = useState(currentUser);
  const [newDetails, setNewDetails] = useState('');

  // Delete Log State
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  // Raw Document Editor Text state
  const initialDocText = useMemo(() => {
    return logs.map(l => 
      `[${l.timestamp}] [${(l.type || 'system').toUpperCase()}] [${l.username || 'System'}] ${l.action}${l.details ? ` -- ${l.details}` : ''}`
    ).join('\n');
  }, [logs]);
  const [rawDocText, setRawDocText] = useState(initialDocText);

  // Helper for type badges & icons
  const getTypeConfig = (type: EventLog['type']) => {
    switch (type) {
      case 'transaction':
        return {
          label: 'Transaction',
          badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          iconBg: 'bg-emerald-600 text-white',
          icon: <DollarSign size={14} className="stroke-[2.5]" />
        };
      case 'task':
        return {
          label: 'Task / Milestone',
          badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          iconBg: 'bg-indigo-600 text-white',
          icon: <CheckCircle2 size={14} className="stroke-[2.5]" />
        };
      case 'file':
        return {
          label: 'Document / Vault',
          badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
          iconBg: 'bg-slate-800 text-white',
          icon: <FileText size={14} className="stroke-[2.5]" />
        };
      case 'team':
        return {
          label: 'Team & Access',
          badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
          iconBg: 'bg-purple-600 text-white',
          icon: <Users size={14} className="stroke-[2.5]" />
        };
      case 'contact':
        return {
          label: 'Stakeholder',
          badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
          iconBg: 'bg-sky-600 text-white',
          icon: <Tag size={14} className="stroke-[2.5]" />
        };
      case 'note':
        return {
          label: 'Manual Note',
          badgeBg: 'bg-teal-50 text-teal-700 border-teal-200',
          iconBg: 'bg-teal-600 text-white',
          icon: <FileText size={14} className="stroke-[2.5]" />
        };
      case 'system':
      default:
        return {
          label: 'System',
          badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
          iconBg: 'bg-amber-600 text-white',
          icon: <Shield size={14} className="stroke-[2.5]" />
        };
    }
  };

  // Counts by category
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: logs.length };
    logs.forEach(l => {
      map[l.type] = (map[l.type] || 0) + 1;
    });
    return map;
  }, [logs]);

  // Filtered & Sorted Logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter(log => {
        if (selectedType !== 'all' && log.type !== selectedType) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchAction = (log.action || '').toLowerCase().includes(q);
          const matchUser = (log.username || '').toLowerCase().includes(q);
          const matchType = (log.type || '').toLowerCase().includes(q);
          const matchDetails = (log.details || '').toLowerCase().includes(q);
          return matchAction || matchUser || matchType || matchDetails;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'title-asc') {
          return (a.action || '').localeCompare(b.action || '', undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'title-desc') {
          return (b.action || '').localeCompare(a.action || '', undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'date-desc') {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
        if (sortBy === 'date-asc') {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        if (sortBy === 'type-asc') {
          return (a.type || '').localeCompare(b.type || '');
        }
        if (sortBy === 'user-asc') {
          return (a.username || '').localeCompare(b.username || '');
        }
        return 0;
      });
  }, [logs, selectedType, searchQuery, sortBy]);

  // Open edit modal
  const handleStartEdit = (log: EventLog) => {
    setEditingLog(log);
    setEditAction(log.action);
    setEditType(log.type || 'system');
    setEditTimestamp(log.timestamp ? new Date(log.timestamp).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16));
    setEditUsername(log.username || currentUser);
    setEditDetails(log.details || '');
  };

  // Save edited log
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog || !editAction.trim()) return;

    const updatedLog: EventLog = {
      ...editingLog,
      action: editAction.trim(),
      type: editType,
      timestamp: new Date(editTimestamp).toISOString(),
      username: editUsername.trim() || currentUser,
      details: editDetails.trim() || undefined
    };

    const updatedLogs = logs.map(l => l.id === editingLog.id ? updatedLog : l);
    onUpdateLogs(updatedLogs);
    setEditingLog(null);
  };

  // Delete a log entry
  const handleConfirmDelete = (logId: string) => {
    const updatedLogs = logs.filter(l => l.id !== logId);
    onUpdateLogs(updatedLogs);
    setDeletingLogId(null);
  };

  // Add new manual log
  const handleSaveNewLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAction.trim()) return;

    const newLogItem: EventLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      action: newAction.trim(),
      type: newType,
      timestamp: new Date(newTimestamp).toISOString(),
      username: newUsername.trim() || currentUser,
      details: newDetails.trim() || undefined
    };

    const updatedLogs = [newLogItem, ...logs];
    onUpdateLogs(updatedLogs);
    
    // Reset form
    setNewAction('');
    setNewDetails('');
    setShowAddModal(false);
  };

  // Copy logs as text
  const handleCopyLogs = () => {
    const text = filteredLogs.map(l => 
      `[${new Date(l.timestamp).toLocaleString()}] [${l.type.toUpperCase()}] ${l.username}: ${l.action}${l.details ? ` (${l.details})` : ''}`
    ).join('\n');
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export logs to CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Date', 'Time', 'Type', 'Author', 'Action Title', 'Details'];
    const rows = filteredLogs.map(l => [
      l.id,
      l.timestamp,
      new Date(l.timestamp).toLocaleDateString(),
      new Date(l.timestamp).toLocaleTimeString(),
      l.type,
      `"${(l.username || '').replace(/"/g, '""')}"`,
      `"${(l.action || '').replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${projectName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate HTML Content for Document Editor
  const generateLogDocumentHtml = () => {
    const htmlRows = logs.map(l => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 11px; color: #64748b; white-space: nowrap;">${new Date(l.timestamp).toLocaleString()}</td>
        <td style="padding: 10px 12px; font-weight: 700; font-size: 11px; text-transform: uppercase; color: #4338ca;">${l.type || 'system'}</td>
        <td style="padding: 10px 12px; font-weight: 700; font-size: 12px; color: #0f172a;">${l.action.replace(/_/g, ' ')}</td>
        <td style="padding: 10px 12px; font-size: 11px; color: #334155;">${l.username || 'System'}</td>
        <td style="padding: 10px 12px; font-size: 11px; color: #64748b;">${l.details || '-'}</td>
      </tr>
    `).join('');

    return `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 28px; max-width: 960px; margin: 0 auto; color: #1e293b;">
        <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">${projectName} — Activity & Audit Log File</h1>
          <p style="font-size: 13px; color: #64748b; margin: 0;">Comprehensive audit record • ${logs.length} Total Registered Entries • Last Updated: ${new Date().toLocaleString()}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; text-align: left; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Timestamp</th>
              <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Category</th>
              <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Action / Description</th>
              <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Author</th>
              <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Details</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows || '<tr><td colspan="5" style="padding: 24px; text-align: center; color: #94a3b8;">No log entries found.</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 32px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; color: #64748b;">
          <strong>Auditing Notice:</strong> This document is generated from the project's internal immutable ledger and system audit events.
        </div>
      </div>
    `;
  };

  const handleOpenDocumentEditor = () => {
    if (onOpenAsDocument) {
      onOpenAsDocument(`${projectName} Activity Log`, generateLogDocumentHtml());
    }
  };

  const handleSaveToVaultClick = () => {
    if (onSaveToVault) {
      onSaveToVault(`${projectName} Activity Log`, generateLogDocumentHtml());
      setSavedStatus('Saved to Vault as .fdoc!');
      setTimeout(() => setSavedStatus(null), 3000);
    }
  };

  // Parse Raw Document text back to logs
  const handleSaveRawTextLogs = () => {
    const lines = rawDocText.split('\n').filter(l => l.trim().length > 0);
    const parsedLogs: EventLog[] = [];

    for (const line of lines) {
      // Format: [ISO timestamp] [TYPE] [User] Action -- details
      const match = line.match(/^\[(.*?)\]\s*\[(.*?)\]\s*\[(.*?)\]\s*(.*?)(?:\s*--\s*(.*))?$/);
      if (match) {
        const [, timeStr, typeStr, userStr, actionStr, detailsStr] = match;
        const validTypes = ['transaction', 'task', 'file', 'team', 'contact', 'note', 'system'];
        const normalizedType = validTypes.includes(typeStr.toLowerCase()) ? (typeStr.toLowerCase() as EventLog['type']) : 'system';
        
        parsedLogs.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          timestamp: isNaN(Date.parse(timeStr)) ? new Date().toISOString() : new Date(timeStr).toISOString(),
          type: normalizedType,
          username: userStr.trim() || currentUser,
          action: actionStr.trim(),
          details: detailsStr ? detailsStr.trim() : undefined
        });
      } else {
        // Fallback simple line
        parsedLogs.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          timestamp: new Date().toISOString(),
          type: 'note',
          username: currentUser,
          action: line.trim()
        });
      }
    }

    if (parsedLogs.length > 0) {
      onUpdateLogs(parsedLogs);
      setSavedStatus('Parsed and updated logs successfully!');
      setTimeout(() => setSavedStatus(null), 3000);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header & Quick Actions Bar */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
              <Activity size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">System & Activity Logs</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-700 border border-indigo-200">
                  {logs.length} Total Records
                </span>
                {savedStatus && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-in fade-in">
                    ✓ {savedStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Sortable and editable audit history tracking transactions, tasks, files, and project execution.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Open Full Document Editor */}
          {onOpenAsDocument && (
            <button
              onClick={handleOpenDocumentEditor}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
              title="Open full editable log document in DocumentEditor"
            >
              <FileText size={14} className="text-indigo-300" />
              <span>Open in Doc Editor (.fdoc)</span>
            </button>
          )}

          {onSaveToVault && (
            <button
              onClick={handleSaveToVaultClick}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              title="Save snapshot as an editable log file in Project Vault"
            >
              <Save size={14} />
              <span>Save Log to Vault</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={() => {
                setNewTimestamp(new Date().toISOString().slice(0, 16));
                setNewUsername(currentUser);
                setShowAddModal(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Plus size={15} className="stroke-[3]" />
              <span>Record Log</span>
            </button>
          )}

          <button
            onClick={handleCopyLogs}
            disabled={filteredLogs.length === 0}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            title="Copy filtered logs to clipboard"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
            title="Export logs as CSV file"
          >
            <Download size={14} />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Tabs, Search & Dedicated Sort Controller */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        {/* Category Tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 flex-1">
            {[
              { id: 'all', label: 'All Logs', count: counts.all || 0 },
              { id: 'transaction', label: 'Transactions', count: counts.transaction || 0 },
              { id: 'task', label: 'Tasks & Milestones', count: counts.task || 0 },
              { id: 'file', label: 'Documents / Files', count: counts.file || 0 },
              { id: 'team', label: 'Team & Access', count: counts.team || 0 },
              { id: 'contact', label: 'Stakeholders', count: counts.contact || 0 },
              { id: 'note', label: 'Manual Notes', count: counts.note || 0 },
              { id: 'system', label: 'System', count: counts.system || 0 },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedType(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                  selectedType === cat.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  selectedType === cat.id ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Feed / Card View"
            >
              <LayoutList size={14} />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View (with sortable columns)"
            >
              <TableIcon size={14} />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              onClick={() => setViewMode('document')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'document' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Raw / Editable Document View"
            >
              <FileCode size={14} />
              <span className="hidden sm:inline">Text / Log File</span>
            </button>
          </div>
        </div>

        {/* Search & Sort Controller */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Search Field */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search logs by action title, author, keyword, or note..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9.5 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Quick Sort Action Chips (Explicit Title Sorting Requested by User) */}
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Sort:</span>
            
            <button
              onClick={() => setSortBy('title-asc')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                sortBy === 'title-asc'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
              }`}
              title="Sort Alphabetically by Action Title (A to Z)"
            >
              <ArrowUp size={13} className={sortBy === 'title-asc' ? 'text-white' : 'text-slate-400'} />
              <span>Title (A → Z)</span>
            </button>

            <button
              onClick={() => setSortBy('title-desc')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                sortBy === 'title-desc'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
              }`}
              title="Sort Alphabetically by Action Title (Z to A)"
            >
              <ArrowDown size={13} className={sortBy === 'title-desc' ? 'text-white' : 'text-slate-400'} />
              <span>Title (Z → A)</span>
            </button>

            <button
              onClick={() => setSortBy('date-desc')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                sortBy === 'date-desc'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
              }`}
              title="Sort by Timestamp: Newest First"
            >
              <Clock size={13} className={sortBy === 'date-desc' ? 'text-white' : 'text-slate-400'} />
              <span>Newest</span>
            </button>

            <button
              onClick={() => setSortBy('date-asc')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                sortBy === 'date-asc'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
              }`}
              title="Sort by Timestamp: Oldest First"
            >
              <Clock size={13} className={sortBy === 'date-asc' ? 'text-white' : 'text-slate-400'} />
              <span>Oldest</span>
            </button>

            {/* Complete Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as LogSortOption)}
                className="pl-3 pr-7 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs outline-none cursor-pointer border border-slate-200 transition"
              >
                <option value="title-asc">Title: A to Z</option>
                <option value="title-desc">Title: Z to A</option>
                <option value="date-desc">Date: Newest First</option>
                <option value="date-asc">Date: Oldest First</option>
                <option value="type-asc">Category Type</option>
                <option value="user-asc">Author Username</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Views: Cards, Table, or Editable Text Document */}
      
      {/* 3A. View Mode: Cards / Timeline Feed */}
      {viewMode === 'cards' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          {filteredLogs.length > 0 ? (
            <div className="space-y-3.5 relative">
              <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-150"></div>

              {filteredLogs.map(log => {
                const cfg = getTypeConfig(log.type);
                const logDate = new Date(log.timestamp);
                const isRecent = Date.now() - logDate.getTime() < 3600000;

                return (
                  <div 
                    key={log.id} 
                    className="group relative flex items-start gap-3 sm:gap-4 z-10 p-4 rounded-2xl bg-slate-50/80 hover:bg-indigo-50/40 border border-slate-200/90 hover:border-indigo-300 transition-all duration-150 shadow-2xs"
                  >
                    {/* Icon Indicator */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${cfg.iconBg}`}>
                      {cfg.icon}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${cfg.badgeBg}`}>
                            {cfg.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                            <User size={12} className="text-slate-400" />
                            <span className="font-bold text-slate-800">{log.username || 'System'}</span>
                          </span>
                          {isRecent && (
                            <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded">
                              Just Now
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 whitespace-nowrap">
                          <Clock size={12} />
                          <span>{logDate.toLocaleDateString()} at {logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      {/* Log Action / Title */}
                      <p className="text-sm font-bold text-slate-900 break-words leading-snug">
                        {log.action.replace(/_/g, ' ')}
                      </p>

                      {log.details && (
                        <p className="text-xs text-slate-600 mt-1.5 bg-white p-2.5 rounded-xl border border-slate-200/70 leading-relaxed font-medium">
                          {log.details}
                        </p>
                      )}
                    </div>

                    {/* Visible Edit & Delete Controls (Always Visible) */}
                    {canEdit && (
                      <div className="flex items-center gap-1.5 shrink-0 self-start">
                        <button
                          onClick={() => handleStartEdit(log)}
                          title="Edit this log record (action title, category, timestamp, or notes)"
                          className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs active:scale-95"
                        >
                          <Edit3 size={13} />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button
                          onClick={() => setDeletingLogId(log.id)}
                          title="Delete this log record"
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl border border-transparent hover:border-rose-200 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                <Activity size={26} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No matching logs found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchQuery 
                  ? `No logs match the query "${searchQuery}". Try changing your search keywords or sorting criteria.` 
                  : 'No activity records found in this category.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 3B. View Mode: Structured Table with Sortable Headers */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th 
                    onClick={() => setSortBy(sortBy === 'title-asc' ? 'title-desc' : 'title-asc')}
                    className="p-3.5 pl-5 cursor-pointer hover:bg-slate-100 transition select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Action Title</span>
                      {sortBy === 'title-asc' && <ArrowUp size={13} className="text-indigo-600" />}
                      {sortBy === 'title-desc' && <ArrowDown size={13} className="text-indigo-600" />}
                      {sortBy !== 'title-asc' && sortBy !== 'title-desc' && <ArrowUpDown size={12} className="text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => setSortBy('type-asc')}
                    className="p-3.5 cursor-pointer hover:bg-slate-100 transition select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Category</span>
                      {sortBy === 'type-asc' && <ArrowUp size={13} className="text-indigo-600" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => setSortBy(sortBy === 'date-desc' ? 'date-asc' : 'date-desc')}
                    className="p-3.5 cursor-pointer hover:bg-slate-100 transition select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Date & Time</span>
                      {sortBy === 'date-desc' && <ArrowDown size={13} className="text-indigo-600" />}
                      {sortBy === 'date-asc' && <ArrowUp size={13} className="text-indigo-600" />}
                      {sortBy !== 'date-desc' && sortBy !== 'date-asc' && <ArrowUpDown size={12} className="text-slate-300" />}
                    </div>
                  </th>
                  <th 
                    onClick={() => setSortBy('user-asc')}
                    className="p-3.5 cursor-pointer hover:bg-slate-100 transition select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Author</span>
                      {sortBy === 'user-asc' && <ArrowUp size={13} className="text-indigo-600" />}
                    </div>
                  </th>
                  <th className="p-3.5">Details & Notes</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map(log => {
                    const cfg = getTypeConfig(log.type);
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition group">
                        <td className="p-3.5 pl-5 font-bold text-slate-900 max-w-xs break-words">
                          {log.action.replace(/_/g, ' ')}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${cfg.badgeBg}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-slate-500 font-medium">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3.5 whitespace-nowrap font-bold text-slate-700">
                          {log.username || 'System'}
                        </td>
                        <td className="p-3.5 text-slate-600 max-w-sm font-medium">
                          {log.details || '-'}
                        </td>
                        <td className="p-3.5 pr-5 text-right whitespace-nowrap">
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleStartEdit(log)}
                                className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                              >
                                <Edit3 size={12} />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => setDeletingLogId(log.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                      No logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3C. View Mode: Raw / Editable Document Log File */}
      {viewMode === 'document' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCode size={16} className="text-indigo-600" />
                <span>Editable Log Document & Raw Trail</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Direct text-based editing of all log records. One log entry per line format: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600 font-mono text-[11px]">[TIMESTAMP] [CATEGORY] [USER] Title -- Details</code>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setRawDocText(initialDocText)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                <span>Reset to Current</span>
              </button>
              {canEdit && (
                <button
                  onClick={handleSaveRawTextLogs}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Save size={13} />
                  <span>Parse & Save Logs</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              rows={16}
              value={rawDocText}
              onChange={e => setRawDocText(e.target.value)}
              className="w-full p-4 bg-slate-900 text-emerald-400 font-mono text-xs leading-relaxed rounded-xl border border-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 transition resize-y selection:bg-indigo-600 selection:text-white"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* 4. Edit Log Modal */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center">
                  <Edit3 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Edit Log Entry</h3>
                  <p className="text-[11px] text-slate-400">Update title, change category, or edit timestamp/notes</p>
                </div>
              </div>
              <button
                onClick={() => setEditingLog(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Action Title / Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editAction}
                  onChange={e => setEditAction(e.target.value)}
                  placeholder="e.g. Completed milestone review..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Category / Type
                  </label>
                  <select
                    value={editType}
                    onChange={e => setEditType(e.target.value as EventLog['type'])}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  >
                    <option value="task">Task / Milestone</option>
                    <option value="transaction">Transaction</option>
                    <option value="file">Document / File</option>
                    <option value="team">Team & Access</option>
                    <option value="contact">Stakeholder</option>
                    <option value="note">Manual Note</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Author / Logger
                  </label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={e => setEditUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Timestamp (Date & Time)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={editTimestamp}
                  onChange={e => setEditTimestamp(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Additional Details & Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={editDetails}
                  onChange={e => setEditDetails(e.target.value)}
                  placeholder="Add context, references, or notes..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingLog(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add Manual Log Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 text-white flex items-center justify-center">
                  <Plus size={18} className="stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Record Log Entry</h3>
                  <p className="text-[11px] text-indigo-100">Manually record an action, milestone, or notes</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-white/80 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveNewLog} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Action Title / Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newAction}
                  onChange={e => setNewAction(e.target.value)}
                  placeholder="e.g. Conducted weekly planning review..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Category / Type
                  </label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as EventLog['type'])}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  >
                    <option value="task">Task / Milestone</option>
                    <option value="transaction">Transaction</option>
                    <option value="file">Document / File</option>
                    <option value="team">Team & Access</option>
                    <option value="contact">Stakeholder</option>
                    <option value="note">Manual Note</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Author / Logger
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newTimestamp}
                  onChange={e => setNewTimestamp(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Detailed Notes / Memo (Optional)
                </label>
                <textarea
                  rows={3}
                  value={newDetails}
                  onChange={e => setNewDetails(e.target.value)}
                  placeholder="Add any extra details, reference numbers, or notes..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Commit Log Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Delete Confirmation Modal */}
      {deletingLogId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Log Entry?</h3>
                <p className="text-xs text-slate-500">This log entry will be permanently removed from the audit trail.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeletingLogId(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDelete(deletingLogId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Delete Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogsManager;
