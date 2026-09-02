import React from 'react';
import { Mail, X, ExternalLink, Trash2, Clock, User, Inbox } from 'lucide-react';
import { GmailPlanningNotification } from '../types';

interface EmailDetailModalProps {
  email: GmailPlanningNotification | null;
  onClose: () => void;
  onDeleteFromDashboard: (emailId: string) => void;
}

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

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200/90 max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="bg-slate-50 p-5 border-b border-slate-200/80 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0 mt-0.5">
              <Mail size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                  <Inbox size={10} />
                  <span>Gmail Message</span>
                </span>
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Clock size={11} />
                  <span>{formattedDate}</span>
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 leading-snug">
                {email.subject || '(No Subject)'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition shrink-0"
            title="Close Popup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sender & Receiver Info */}
        <div className="px-6 py-3 bg-slate-100/50 border-b border-slate-200/60 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <div className="flex items-center gap-1.5">
            <User size={13} className="text-slate-400" />
            <span className="font-semibold text-slate-700">From:</span>
            <span className="font-bold text-slate-900">{email.from}</span>
            {email.fromRaw && email.fromRaw !== email.from && (
              <span className="text-[11px] text-slate-400">({email.fromRaw})</span>
            )}
          </div>
          {email.to && (
            <div className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">To:</span> {email.to}
            </div>
          )}
        </div>

        {/* Email Body / Snippet */}
        <div className="p-6 max-h-[320px] overflow-y-auto font-normal text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
          {email.snippet ? email.snippet : 'No snippet preview available for this message.'}
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleDelete}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition"
            title="Remove from Dashboard without deleting in Gmail"
          >
            <Trash2 size={14} />
            <span>Remove from Dashboard</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleOpenGmail}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition"
            >
              <ExternalLink size={14} />
              <span>Open in Gmail</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
