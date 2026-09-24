import { EmailVerificationNotice } from './EmailVerification';
import React, { useState, useEffect } from 'react';
import { Users, AlertCircle, Loader2 } from 'lucide-react';
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

  if (!currentUser) {
    sessionStorage.setItem('ffpro_pending_invite', token);
    window.location.replace('/api/platform/start');
    return (
      <div className="fixed inset-0 z-[200] bg-stone-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto w-6 h-6 text-indigo-300 animate-spin" />
          <p className="mt-3 text-sm text-stone-300">Sign in through V79 Hub to continue this invite.</p>
        </div>
      </div>
    );
  }

  if (emailMismatch) {
    return (
      <div className="fixed inset-0 z-[200] bg-stone-900 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-lg p-6 text-center">
          <Users className="w-7 h-7 text-indigo-300 mx-auto mb-3" />
          <p className="text-white text-sm font-semibold">This invite is for {preview?.email}</p>
          <p className="mt-2 text-stone-400 text-xs">Your current V79 finance account uses {currentUser.email}. Use the matching Hub account or ask the project owner to send a new invite.</p>
          <button onClick={onSwitchAccount} className="mt-5 w-full py-2.5 bg-indigo-600 text-white font-bold rounded text-[10px] uppercase tracking-wider">Return to V79 Hub</button>
        </div>
      </div>
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
        <EmailVerificationNotice user={currentUser} />
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
