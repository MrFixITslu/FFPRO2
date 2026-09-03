import React, { useState, useEffect } from 'react';
import { Users, AlertCircle, Loader2 } from 'lucide-react';
import Login from './Login';
import { invitesService, InvitePreview } from '../services/projectsService';
import { AuthUser } from '../services/authService';

interface Props {
  token: string;
  currentUser: AuthUser | null;
  onAuthenticated: (user: AuthUser) => void;
  onAccepted: (projectId: string, projectName: string) => void;
  onCancel: () => void;
  onSwitchAccount: () => void;
}

const InviteAcceptScreen: React.FC<Props> = ({ token, currentUser, onAuthenticated, onAccepted, onCancel, onSwitchAccount }) => {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invitesService.preview(token)
      .then(p => { if (!cancelled) setPreview(p); })
      .catch(err => { if (!cancelled) setError(err.message || 'This invite link is invalid or has expired.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const result = await invitesService.accept(token);
      onAccepted(result.projectId, result.projectName);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite.');
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] bg-stone-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="fixed inset-0 z-[200] bg-stone-900 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-lg p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-white font-semibold text-sm mb-1">Invite unavailable</p>
          <p className="text-stone-400 text-xs mb-5">{error}</p>
          <button onClick={onCancel} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[10px] uppercase tracking-wider transition-all">
            Go to app
          </button>
        </div>
      </div>
    );
  }

  const emailMismatch = !!currentUser && preview && currentUser.email.toLowerCase() !== preview.email.toLowerCase();

  if (!currentUser || emailMismatch) {
    return (
      <>
        <div className="fixed inset-0 z-[199] bg-stone-900 flex items-start justify-center pt-10 px-6 pointer-events-none">
          <div className="max-w-sm w-full bg-indigo-600/10 border border-indigo-500/20 rounded-lg p-4 text-center pointer-events-auto">
            <Users className="w-5 h-5 text-indigo-300 mx-auto mb-2" />
            <p className="text-white text-sm font-semibold">
              You've been invited to "{preview?.projectName}"
            </p>
            <p className="text-stone-400 text-[11px] mt-1">
              {emailMismatch
                ? <>You're logged in with a different account. Log in as <strong className="text-stone-300">{preview?.email}</strong> to accept, or <button onClick={onSwitchAccount} className="underline text-indigo-300">switch accounts</button>.</>
                : <>Sign in or create an account with <strong className="text-stone-300">{preview?.email}</strong> to join as a{preview?.role === 'editor' ? 'n' : ''} {preview?.role}.</>
              }
            </p>
          </div>
        </div>
        {!emailMismatch && (
          <Login onAuthenticated={onAuthenticated} initialEmail={preview?.email} initialMode="register" />
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-stone-900 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-lg p-6 text-center">
        <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-6 h-6 text-white" />
        </div>
        <p className="text-white font-bold text-lg mb-1">Join "{preview?.projectName}"?</p>
        <p className="text-stone-400 text-xs mb-1">
          You'll be added as a{preview?.role === 'editor' ? 'n' : ''} <strong className="text-stone-300">{preview?.role}</strong>.
        </p>
        <p className="text-stone-500 text-[10px] mt-3 mb-5">Signed in as {currentUser.email}</p>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Accept & Join Project'}
          </button>
          <button onClick={onCancel} className="w-full py-2.5 text-stone-400 hover:text-white font-bold rounded text-[10px] uppercase tracking-wider transition-all">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteAcceptScreen;
