import React, { useState, useEffect, useCallback } from 'react';
import { Landmark, RefreshCw, ExternalLink, AlertCircle, Filter, Sparkles } from 'lucide-react';

interface FundingOpportunity {
  id: number;
  title: string;
  funder_name: string | null;
  description: string | null;
  amount_min: number | null;
  amount_max: number | null;
  currency: string | null;
  deadline: string | null;
  deadline_status: 'open' | 'closing_soon' | 'expired' | 'no_deadline';
  eligibility_summary: string | null;
  category: string | null;
  tags: string[];
  source_url: string;
  first_seen_at: string;
}

const DEADLINE_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  closing_soon: { label: 'Closing Soon', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  expired: { label: 'Expired', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  no_deadline: { label: 'Rolling', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
};

function formatAmount(min: number | null, max: number | null, currency: string | null) {
  if (!min && !max) return null;
  const cur = currency || '';
  const fmt = (n: number) => n.toLocaleString();
  if (min && max && min !== max) return `${cur} ${fmt(min)} – ${fmt(max)}`;
  return `${cur} ${fmt(max || min || 0)}`.trim();
}

export const FundingFinder: React.FC = () => {
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [sortBy, setSortBy] = useState<'deadline' | 'amount_desc' | 'newest'>('deadline');
  const [triggering, setTriggering] = useState(false);
  const [queueStats, setQueueStats] = useState<Record<string, number> | null>(null);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter, sortBy });
      const res = await fetch(`/api/funding/opportunities?${params}`, { credentials: 'include' });
      if (!res.ok) {
        setError('Unable to load funding opportunities.');
        return;
      }
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch {
      setError('Unable to load funding opportunities.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sortBy]);

  const fetchQueueStats = useCallback(async () => {
    try {
      const res = await fetch('/api/funding/research/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setQueueStats(data.queue || null);
      }
    } catch {
      // Non-critical — silently skip if this fails.
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
    fetchQueueStats();
  }, [fetchOpportunities, fetchQueueStats]);

  const handleManualTrigger = async () => {
    setTriggering(true);
    try {
      await fetch('/api/funding/research/trigger', { method: 'POST', credentials: 'include' });
      setTimeout(() => {
        fetchQueueStats();
        setTriggering(false);
      }, 2000);
    } catch {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Landmark size={16} />
            </div>
            <h1 className="text-2xl font-light text-slate-800 tracking-tight">
              Funding <span className="font-semibold text-slate-950">Finder</span>
            </h1>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 ml-10">
            Verified grant &amp; funding opportunities, researched automatically
          </p>
        </div>

        <div className="flex items-center gap-2">
          {queueStats && (
            <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
              Queue: {queueStats.queued || 0} pending · {queueStats.completed || 0} done
            </span>
          )}
          <button
            onClick={handleManualTrigger}
            disabled={triggering}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
          >
            <Sparkles size={13} className={triggering ? 'animate-pulse' : ''} />
            {triggering ? 'Researching...' : 'Run Research Now'}
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <Filter size={14} className="text-slate-400" />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'active' | 'all')}
          className="text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white"
        >
          <option value="active">Active only</option>
          <option value="all">All statuses</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white"
        >
          <option value="deadline">Sort: Deadline (soonest)</option>
          <option value="amount_desc">Sort: Amount (highest)</option>
          <option value="newest">Sort: Newest first</option>
        </select>
        <button
          onClick={fetchOpportunities}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {!error && !loading && opportunities.length === 0 && (
        <div className="py-16 text-center bg-white rounded-xl border border-slate-200">
          <Landmark size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">No funding opportunities yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            The research job runs nightly. Click "Run Research Now" to check immediately, or wait for the next scheduled run.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {opportunities.map(op => {
          const badge = DEADLINE_BADGE[op.deadline_status] || DEADLINE_BADGE.no_deadline;
          const amount = formatAmount(op.amount_min, op.amount_max, op.currency);
          return (
            <div key={op.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-slate-800 text-sm leading-snug">{op.title}</h3>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${badge.className}`}>
                  {badge.label}
                </span>
              </div>

              {op.funder_name && (
                <p className="text-xs text-slate-500 font-semibold -mt-2">{op.funder_name}</p>
              )}

              {op.description && (
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{op.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                {amount && (
                  <span className="px-2 py-1 bg-slate-50 rounded-md font-bold text-slate-700 border border-slate-100">
                    {amount}
                  </span>
                )}
                {op.deadline && (
                  <span className="px-2 py-1 bg-slate-50 rounded-md font-mono border border-slate-100">
                    Due {new Date(op.deadline).toLocaleDateString()}
                  </span>
                )}
                {op.category && (
                  <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md font-bold border border-indigo-100">
                    {op.category}
                  </span>
                )}
              </div>

              {op.eligibility_summary && (
                <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                  <strong className="text-slate-600">Eligibility:</strong> {op.eligibility_summary}
                </p>
              )}

              <a
                href={op.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 pt-1"
              >
                View source <ExternalLink size={12} />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};
