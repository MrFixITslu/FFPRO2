import React from 'react';
import { Mail, X, ExternalLink, Trash2, Clock, User, Check, FolderKanban, CheckSquare, Receipt, Plane } from 'lucide-react';
import { GmailPlanningNotification } from '../types';

interface EmailDetailModalProps {
  email: GmailPlanningNotification | null;
  onClose: () => void;
  onDeleteFromDashboard: (emailId: string) => void;
  onMarkAsRead?: (emailId: string) => void;
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

const getEntryTypeDetails = (email: GmailPlanningNotification) => {
  const subject = email.subject || '';
  const snippet = email.snippet || '';
  const text = `${subject} ${snippet}`.toLowerCase();
  const isLinkedToProject = Boolean(email.taskReference?.projectName || email.taskReference?.taskId);

  if (isLinkedToProject || text.includes('project') || text.includes('task') || text.includes('milestone') || text.includes('roadmap') || text.includes('deadline') || text.includes('sprint')) {
    return {
      type: 'project' as const,
      label: 'Project Milestone',
      icon: FolderKanban,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      avatarBg: 'bg-indigo-600 text-white',
    };
  }
  if (text.includes('invoice') || text.includes('receipt') || text.includes('bill') || text.includes('payment') || text.includes('statement') || text.includes('$')) {
    return {
      type: 'financial' as const,
      label: 'Invoice & Billing',
      icon: Receipt,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      avatarBg: 'bg-emerald-600 text-white',
    };
  }
  if (text.includes('flight') || text.includes('hotel') || text.includes('trip') || text.includes('reservation') || text.includes('ticket') || text.includes('booking')) {
    return {
      type: 'travel' as const,
      label: 'Travel & Booking',
      icon: Plane,
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      avatarBg: 'bg-cyan-600 text-white',
    };
  }
  return {
    type: 'email' as const,
    label: 'Email Message',
    icon: Mail,
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    avatarBg: 'bg-stone-800 text-white',
  };
};

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  onClose,
  onDeleteFromDashboard,
  onMarkAsRead,
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

  const handleRead = () => {
    if (onMarkAsRead) {
      onMarkAsRead(email.id);
    }
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
  const entryType = getEntryTypeDetails(email);
  const TypeIcon = entryType.icon;

  return (
    <div className="fixed inset-0 z-[300] bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-stone-200/90 max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Executive Header Bar */}
        <div className="bg-stone-50/80 p-5 border-b border-stone-200/80 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className={`w-10 h-10 rounded-xl ${entryType.avatarBg} font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 tracking-wider shadow-xs relative`}>
              {monogram}
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white text-stone-900 flex items-center justify-center shadow-xs border border-stone-200">
                <TypeIcon size={9} />
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-md border flex items-center gap-1.5 ${entryType.color}`}>
                  <TypeIcon size={11} />
                  <span>{entryType.label}</span>
                </span>
                <span className="text-[11px] font-medium text-stone-400 flex items-center gap-1">
                  <Clock size={11} />
                  <span>{formattedDate}</span>
                </span>
              </div>
              <h3 className="text-base font-bold text-stone-900 leading-snug tracking-tight">
                {email.subject || '(No Subject)'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition shrink-0"
            title="Close Popup"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Linked Project Banner (if linked to a planner project or task) */}
        {email.taskReference && (
          <div className="mx-5 my-3 p-3 bg-indigo-50/75 border border-indigo-200/85 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <FolderKanban size={15} />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-indigo-950 flex items-center gap-1.5 truncate">
                  <span>Project: {email.taskReference.projectName || 'Planner Project'}</span>
                </div>
                {email.taskReference.taskTitle && (
                  <div className="text-[11px] text-indigo-700 flex items-center gap-1 truncate mt-0.5 font-medium">
                    <CheckSquare size={11} className="shrink-0" />
                    <span className="truncate">Task: {email.taskReference.taskTitle}</span>
                  </div>
                )}
              </div>
            </div>
            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md shrink-0 border border-indigo-200">
              Linked Project
            </span>
          </div>
        )}

        {/* Sender & Receiver Info */}
        <div className="px-6 py-3 bg-stone-50/40 border-b border-stone-200/60 flex flex-wrap items-center justify-between text-xs text-stone-600 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <User size={13} className="text-stone-400 shrink-0" />
            <span className="font-semibold text-stone-600">From:</span>
            <span className="font-bold text-stone-900 truncate">{email.from}</span>
            {email.fromRaw && email.fromRaw !== email.from && (
              <span className="text-[11px] text-stone-400 truncate">({email.fromRaw})</span>
            )}
          </div>
          {email.to && (
            <div className="text-[11px] text-stone-500 shrink-0">
              <span className="font-semibold text-stone-600">To:</span> {email.to}
            </div>
          )}
        </div>

        {/* Email Body / Snippet */}
        <div className="p-6 max-h-[320px] overflow-y-auto font-normal text-stone-700 text-sm leading-relaxed whitespace-pre-wrap selection:bg-indigo-100">
          {email.snippet ? email.snippet : 'No snippet preview available for this message.'}
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-stone-50/80 border-t border-stone-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleDelete}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition"
              title="Permanently delete from dashboard across all devices"
            >
              <Trash2 size={14} />
              <span>Delete from Dashboard</span>
            </button>
            {onMarkAsRead && (
              <button
                onClick={handleRead}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 transition shadow-2xs"
                title="Mark as read and remove from unread briefing"
              >
                <Check size={14} className="text-emerald-600" />
                <span>Mark Read</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleOpenGmail}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 shadow-xs transition"
            >
              <ExternalLink size={14} />
              <span>Open in Gmail</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-600 bg-white hover:bg-stone-100 border border-stone-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
