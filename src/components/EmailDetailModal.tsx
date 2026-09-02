import React from 'react';
import { Mail, X, ExternalLink, Trash2, Clock, User, Inbox, Tag } from 'lucide-react';
import { GmailPlanningNotification } from '../types';

interface EmailDetailModalProps {
  email: GmailPlanningNotification | null;
  onClose: () => void;
  onDeleteFromDashboard: (emailId: string) => void;
}

const getSenderMonogram = (fromStr: string) => {
  if (!fromStr) return 'EM';
  const clean = fromStr.replace(/<.*?>/, '').replace(/["']/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'EM';
};

const getCategoryDetails = (subject: string, snippet: string) => {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (text.includes('invoice') || text.includes('receipt') || text.includes('bill') || text.includes('payment') || text.includes('statement') || text.includes('$')) {
    return { label: 'Invoice & Billing', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (text.includes('flight') || text.includes('hotel') || text.includes('trip') || text.includes('reservation') || text.includes('ticket')) {
    return { label: 'Travel & Booking', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
  }
  if (text.includes('project') || text.includes('task') || text.includes('meeting') || text.includes('review') || text.includes('update') || text.includes('roadmap')) {
    return { label: 'Project Milestone', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
  return { label: 'General Correspondence', color: 'bg-slate-100 text-slate-700 border-slate-200' };
};

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  onClose,
  onDeleteFromDashboard,
}) => {
  if (!email) return null;

  const handleOpenGmail = () => {
    const url = email.threadId
      ? `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`
      : `https://mail.google.com/mail/u/0/#inbox/${email.id}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = () => {
    onDeleteFromDashboard(email.id);
    onClose();
  };

  const formattedDate = email.date
    ? new Date(email.date).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown Date';

  const monogram = getSenderMonogram(email.from);
  const category = getCategoryDetails(email.subject || '', email.snippet || '');

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200/90 max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Executive Header Bar */}
        <div className="bg-slate-50/80 p-5 border-b border-slate-200/80 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 tracking-wider shadow-xs">
              {monogram}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-md border flex items-center gap-1 ${category.color}`}>
                  <Tag size={9} />
                  <span>{category.label}</span>
                </span>
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Clock size={11} />
                  <span>{formattedDate}</span>
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 leading-snug tracking-tight">
                {email.subject || '(No Subject)'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition shrink-0"
            title="Close Popup"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sender & Receiver Info */}
        <div className="px-6 py-3 bg-slate-50/40 border-b border-slate-200/60 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <User size={13} className="text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-600">From:</span>
            <span className="font-bold text-slate-900 truncate">{email.from}</span>
            {email.fromRaw && email.fromRaw !== email.from && (
              <span className="text-[11px] text-slate-400 truncate">({email.fromRaw})</span>
            )}
          </div>
          {email.to && (
            <div className="text-[11px] text-slate-500 shrink-0">
              <span className="font-semibold text-slate-600">To:</span> {email.to}
            </div>
          )}
        </div>

        {/* Email Body / Snippet */}
        <div className="p-6 max-h-[320px] overflow-y-auto font-normal text-slate-700 text-sm leading-relaxed whitespace-pre-wrap selection:bg-indigo-100">
          {email.snippet ? email.snippet : 'No snippet preview available for this message.'}
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleDelete}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition"
            title="Permanently delete from dashboard across all devices"
          >
            <Trash2 size={14} />
            <span>Delete from Dashboard</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleOpenGmail}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-xs transition"
            >
              <ExternalLink size={14} />
              <span>Open in Gmail</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
