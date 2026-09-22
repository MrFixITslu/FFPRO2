import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  FileSearch,
  Info,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import { StartupPlanDetails } from '../types';
import { buildBusinessCopilotContext } from '../services/businessCopilotContext';
import { useBusinessCopilot } from '../hooks/useBusinessCopilot';

interface BusinessCopilotPanelProps {
  startupDetails: StartupPlanDetails;
  projectId?: string;
  businessName?: string;
  section: 'costing' | 'plan' | 'forecast';
}

const SECTION_META = {
  costing: {
    label: 'Commercial Model & Pricing',
    step: 1,
    prompts: [
      'Check my pricing and direct costs for problems.',
      'Find any double-counted or misclassified costs.',
      'Check whether my service volumes fit equipment capacity.',
      'Explain my current unit economics and biggest margin risk.'
    ]
  },
  plan: {
    label: 'Plan Narrative & Strategy',
    step: 2,
    prompts: [
      'Check the business plan narrative for financial inconsistencies.',
      'Find claims that are not supported by the current plan data.',
      'Check this plan for lender-readiness gaps.',
      'Summarize the most important narrative issues to fix next.'
    ]
  },
  forecast: {
    label: 'Financial Forecasts & Export',
    step: 3,
    prompts: [
      'Explain my Year 1 revenue using the current plan.',
      'Explain my break-even result.',
      'Why is my Year 1 ending cash at its current level?',
      'Check the forecast for financial red flags.'
    ]
  }
} as const;

function severityStyles(severity: string) {
  if (severity === 'error') return 'bg-rose-50 border-rose-200 text-rose-800';
  if (severity === 'warning') return 'bg-amber-50 border-amber-200 text-amber-900';
  return 'bg-blue-50 border-blue-200 text-blue-800';
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'error' || severity === 'warning') {
    return <AlertTriangle size={13} className="shrink-0 mt-0.5" />;
  }
  return <Info size={13} className="shrink-0 mt-0.5" />;
}

const BusinessCopilotPanel: React.FC<BusinessCopilotPanelProps> = ({
  startupDetails,
  projectId,
  businessName,
  section
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const meta = SECTION_META[section];

  const context = useMemo(
    () => buildBusinessCopilotContext(
      startupDetails,
      {
        page: 'startup-planner',
        workflowStep: meta.step,
        section
      },
      {
        projectId,
        businessName
      }
    ),
    [startupDetails, projectId, businessName, section, meta.step]
  );

  const {
    messages,
    loading,
    error,
    ask,
    clear
  } = useBusinessCopilot(context);

  const issueCount =
    (context.validation?.errors.length || 0) +
    (context.validation?.warnings.length || 0);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    });
  }, [messages, loading, isOpen]);

  const submit = async (text = draft) => {
    const message = text.trim();
    if (!message || loading) return;
    setDraft('');
    await ask(message);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-4 z-[120] flex items-center gap-2 px-4 py-3 rounded-2xl bg-stone-900 text-white border border-stone-800 shadow-xl hover:bg-stone-800 transition-all cursor-pointer"
        title="Open FFPRO Copilot"
      >
        <span className="relative w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
          <Sparkles size={16} className="text-emerald-300" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-stone-900" />
        </span>
        <span className="text-left">
          <span className="block text-xs font-extrabold leading-tight">FFPRO Copilot</span>
          <span className="block text-[9px] text-stone-400 font-semibold mt-0.5">
            {issueCount > 0
              ? `${issueCount} plan issue${issueCount === 1 ? '' : 's'} to review`
              : 'Read-only plan assistant'}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="fixed z-[130] right-3 left-3 bottom-3 top-16 sm:left-auto sm:top-auto sm:right-4 sm:bottom-4 sm:w-[430px] sm:h-[650px] bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <div className="bg-stone-900 text-white px-4 py-3.5 border-b border-stone-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <Sparkles size={17} className="text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-extrabold">FFPRO Copilot</h3>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-700 text-[9px] font-extrabold uppercase tracking-wider text-emerald-300">
                  Read Only
                </span>
              </div>
              <p className="text-[10px] text-stone-400 font-semibold truncate mt-0.5">
                Working on: {meta.label}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-white/10 transition"
            aria-label="Close FFPRO Copilot"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto bg-stone-50 p-3 space-y-3">
        {messages.length === 0 && (
          <>
            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={17} className="text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-stone-900">
                    I can analyze the current FFPRO plan without changing it.
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                    Forecast values come from FFPRO's deterministic financial engine. I can explain them, surface validation issues, and point out inconsistencies. I cannot save plan changes in this version.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-stone-400 px-1">
                Suggested for this section
              </div>
              {meta.prompts.map((prompt, index) => {
                const Icon = index === 0
                  ? FileSearch
                  : index === 1
                    ? AlertTriangle
                    : index === 2
                      ? Calculator
                      : MessageSquareText;
                return (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => submit(prompt)}
                    disabled={loading}
                    className="w-full text-left bg-white hover:bg-emerald-50/50 border border-stone-200 hover:border-emerald-200 rounded-xl p-3 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon size={14} className="text-emerald-700 shrink-0 mt-0.5" />
                      <span className="text-[11.5px] font-semibold text-stone-700 leading-relaxed">{prompt}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {messages.map((message, index) => {
          if (message.role === 'user') {
            return (
              <div key={index} className="flex justify-end">
                <div className="max-w-[88%] bg-emerald-700 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 shadow-xs">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            );
          }

          const response = message.response;
          return (
            <div key={index} className="space-y-2">
              <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-md px-3.5 py-3 shadow-2xs">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={12} className="text-emerald-700" />
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-700">
                    {response?.mode || 'explain'}
                  </span>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>

              {response?.observations && response.observations.length > 0 && (
                <div className="space-y-1.5">
                  {response.observations.map((observation, observationIndex) => (
                    <div
                      key={observationIndex}
                      className={`border rounded-xl px-3 py-2.5 flex items-start gap-2 text-[11px] leading-relaxed ${severityStyles(observation.severity)}`}
                    >
                      <SeverityIcon severity={observation.severity} />
                      <span>{observation.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {response?.calculations && response.calculations.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-stone-100/70 border-b border-stone-200 flex items-center gap-1.5">
                    <Calculator size={12} className="text-stone-600" />
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-stone-600">Calculations</span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {response.calculations.map((calculation, calculationIndex) => (
                      <div key={calculationIndex} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[11px] font-semibold text-stone-600">{calculation.label}</span>
                          <span className="text-[11px] font-extrabold text-stone-900 font-mono text-right">{calculation.value}</span>
                        </div>
                        {calculation.formula && (
                          <div className="text-[10px] text-stone-400 mt-1 font-mono break-words">{calculation.formula}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {response?.sources && response.sources.length > 0 && (
                <div className="px-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-stone-400">Based on</span>
                  {response.sources.map((source, sourceIndex) => (
                    <span
                      key={sourceIndex}
                      className="px-2 py-1 rounded-lg bg-stone-100 border border-stone-200 text-[9.5px] font-semibold text-stone-600"
                      title={source.type}
                    >
                      {source.label}
                    </span>
                  ))}
                </div>
              )}

              {response?.suggestedPrompts && response.suggestedPrompts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {response.suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => submit(prompt)}
                      disabled={loading}
                      className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-md px-3.5 py-3 shadow-2xs flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:120ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:240ms]" />
              </div>
              <span className="text-[10px] font-semibold text-stone-500">Reviewing current FFPRO data…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-[11px] text-rose-800 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 bg-white p-3">
        {messages.length > 0 && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-semibold text-stone-400">
              Context: {businessName || 'Current business plan'} • Step {meta.step}
            </span>
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-1 text-[9.5px] font-bold text-stone-400 hover:text-rose-600 transition"
            >
              <Trash2 size={10} />
              Clear
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Ask about this plan…"
            className="flex-1 resize-none min-h-[42px] max-h-28 px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={!draft.trim() || loading}
            className="w-11 h-11 shrink-0 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message to FFPRO Copilot"
          >
            <Send size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-2 text-[9px] text-stone-400">
          <CheckCircle2 size={10} className="text-emerald-600" />
          <span>Financial figures are read from FFPRO's calculation engine; no plan changes are applied.</span>
        </div>
      </div>
    </div>
  );
};

export default BusinessCopilotPanel;
