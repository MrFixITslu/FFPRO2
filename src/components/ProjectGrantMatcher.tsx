import React, { useState, useEffect, useCallback } from 'react';
import { Landmark, ExternalLink, Sparkles, CheckCircle2, ShieldCheck, Clock, AlertCircle, RefreshCw, DollarSign } from 'lucide-react';
import { BudgetEvent } from '../types';

interface GrantMatch {
  id: string;
  grant_name: string;
  why_it_matches: string;
  funding_amount: string;
  application_deadline: string;
  deadline_status: 'open' | 'closing_soon' | 'no_deadline' | 'expired';
  view_grant_url: string;
  funder_name?: string;
  category?: string;
  match_score?: number;
  is_active: boolean;
}

interface Props {
  event: BudgetEvent;
  onNavigateToFunding?: () => void;
  compact?: boolean;
}

const DEADLINE_BADGES: Record<string, { label: string; className: string }> = {
  open: { label: 'Active & Open', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closing_soon: { label: 'Closing Soon', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  no_deadline: { label: 'Rolling / Open', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  expired: { label: 'Expired (Excluded)', className: 'bg-rose-50 text-rose-700 border-rose-200' }
};

export const ProjectGrantMatcher: React.FC<Props> = ({ event, onNavigateToFunding, compact = false }) => {
  const [matches, setMatches] = useState<GrantMatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluatedCount, setEvaluatedCount] = useState<number>(0);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        projectId: event.id,
        projectName: event.name || 'Laser Tag Project',
        description: event.notes || event.description || (event.items ? `Project with ${event.items.length} budgeted items` : ''),
        category: event.eventType || 'Recreation & Events',
        budget: event.projectedBudget || 0,
        targetAudience: 'Youth, families, recreation, and local community'
      };

      const res = await fetch('/api/funding/match-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Failed to match project with active grants.');
      }

      const data = await res.json();
      // Strictly enforce active, non-expired only
      const activeOnly = (data.matches || []).filter((m: GrantMatch) => m.deadline_status !== 'expired' && m.is_active !== false);
      setMatches(activeOnly);
      setEvaluatedCount(data.active_grants_evaluated_count || activeOnly.length);
    } catch (err: any) {
      console.error('Error fetching grant matches:', err);
      setError(err?.message || 'Unable to load grant matches.');
    } finally {
      setLoading(false);
    }
  }, [event.id, event.name, event.notes, event.description, event.items, event.eventType, event.projectedBudget]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const displayedMatches = compact ? matches.slice(0, 3) : matches;

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Landmark size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-stone-900">
                AI Grant &amp; Funding Matches
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck size={11} className="text-emerald-600" />
                Active &amp; Non-Expired Only
              </span>
            </div>
            <p className="text-[11px] text-stone-500 font-medium">
              Matched strictly against verified open opportunities for <span className="font-bold text-stone-800">{event.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchMatches}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 transition disabled:opacity-50"
            title="Refresh AI grant matching"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Re-match</span>
          </button>
          {onNavigateToFunding && (
            <button
              onClick={onNavigateToFunding}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
            >
              <span>Explore All Grants</span>
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Policy Notice */}
      <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
        <Sparkles size={14} className="text-indigo-600 shrink-0 mt-0.5" />
        <p className="leading-snug">
          <strong className="text-slate-800">Strict Eligibility Rule:</strong> AI processes only active, open grants. All closed, archived, or expired deadlines are permanently excluded from this matching pipeline.
          {evaluatedCount > 0 && <span className="font-mono text-[10px] ml-1 text-slate-500">({evaluatedCount} active grants evaluated)</span>}
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-8 text-center text-stone-500 text-xs flex flex-col items-center justify-center gap-2">
          <RefreshCw size={20} className="animate-spin text-indigo-600" />
          <p className="font-medium">Evaluating active, non-expired grants for <span className="font-bold text-stone-700">{event.name}</span>...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && displayedMatches.length === 0 && (
        <div className="py-8 text-center bg-stone-50 rounded-xl border border-stone-200 p-4">
          <Landmark size={24} className="mx-auto text-stone-400 mb-2" />
          <p className="text-xs font-bold text-stone-700">No active grant matches found for this project criteria</p>
          <p className="text-[11px] text-stone-500 mt-1 max-w-md mx-auto">
            All expired grants have been excluded. As new active grants are published and verified on the Funding page, they will automatically match here.
          </p>
        </div>
      )}

      {/* Match Cards List */}
      {!loading && displayedMatches.length > 0 && (
        <div className="space-y-3">
          {displayedMatches.map((match) => {
            const badge = DEADLINE_BADGES[match.deadline_status] || DEADLINE_BADGES.open;
            return (
              <div
                key={match.id}
                className="bg-stone-50/70 hover:bg-stone-50 border border-stone-200 hover:border-indigo-200 rounded-xl p-4 transition-all flex flex-col gap-2.5 group"
              >
                {/* Top Row: Grant Name & Deadline Status Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-indigo-900 transition-colors">
                        {match.grant_name}
                      </h3>
                      {match.match_score && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                          {match.match_score}% Match
                        </span>
                      )}
                    </div>
                    {match.funder_name && (
                      <p className="text-[11px] text-stone-500 font-semibold mt-0.5">{match.funder_name}</p>
                    )}
                  </div>

                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Why it matches */}
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/80 text-xs text-stone-700 leading-relaxed">
                  <span className="font-bold text-indigo-700 text-[10px] uppercase tracking-wider block mb-0.5">
                    Why it matches:
                  </span>
                  <p className="text-stone-700">{match.why_it_matches}</p>
                </div>

                {/* Key metadata row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Funding amount */}
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-md text-xs font-bold text-stone-800 border border-stone-200">
                      <DollarSign size={12} className="text-emerald-600" />
                      <span>{match.funding_amount}</span>
                    </div>

                    {/* Application deadline */}
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-md text-xs font-medium text-stone-700 border border-stone-200">
                      <Clock size={12} className="text-amber-500" />
                      <span>Deadline: <strong className="font-semibold text-stone-900">{match.application_deadline}</strong></span>
                    </div>

                    {/* Category tag if available */}
                    {match.category && (
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-100 hidden sm:inline-block">
                        {match.category}
                      </span>
                    )}
                  </div>

                  {/* View Grant Link */}
                  <a
                    href={match.view_grant_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-2xs shrink-0 ml-auto sm:ml-0"
                  >
                    <span>View Grant</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectGrantMatcher;
