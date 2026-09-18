import React, { useState, useEffect } from 'react';
import type { AuthUser } from '../services/authService';
import { authService } from '../services/authService';
import { APP_LOGO } from '../assets/logo';

export function EmailVerificationNotice({ user }: { user: AuthUser }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  
  if (user.emailVerified) return null;

  return (
    <aside className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between" role="status">
      <div className="flex items-center gap-2">
        <i className="fas fa-exclamation-triangle text-amber-600"></i>
        <span>
          Your email address (<strong>{user.email}</strong>) has not been verified yet.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          className="font-bold text-amber-700 hover:text-amber-900 underline disabled:opacity-50 text-[11px] uppercase tracking-wider"
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch('/api/auth/verify-email/send', { method: 'POST' });
              const body = await res.json();
              setMessage(res.ok ? 'Verification link sent!' : (body.error || 'Failed to send email.'));
            } catch {
              setMessage('Could not send verification email. Please retry.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Sending...' : 'Resend Verification Email'}
        </button>
        {message && <span className="text-[11px] font-semibold text-stone-700 ml-2">{message}</span>}
      </div>
    </aside>
  );
}

export function EmailVerificationScreen() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'idle'>(token ? 'verifying' : 'idle');
  const [message, setMessage] = useState<string>(token ? 'Confirming your email address...' : 'Enter your email address to receive a verification link.');
  const [resendEmail, setResendEmail] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const data = await authService.verifyEmail(token);
        if (!isMounted) return;
        setStatus('success');
        setMessage(data.message || 'Your email address has been verified successfully! You can now log in to access the site.');
        try {
          window.history.replaceState({}, '', '/verify-email');
        } catch {
          // ignore
        }
      } catch (err: any) {
        if (!isMounted) return;
        setStatus('error');
        setMessage(err.message || 'This email verification link is invalid, expired, or has already been used.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResendBusy(true);
    try {
      await authService.resendVerification(resendEmail);
      setResendSent(true);
      setMessage(`If an unverified account exists for ${resendEmail}, a new verification link has been sent.`);
    } catch (err: any) {
      setMessage(err.message || 'Failed to send verification email.');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6 overflow-y-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/5 blur-[120px] rounded-full"></div>
      </div>

      <main className="max-w-md w-full relative z-10 my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-6">
          <img
            src={APP_LOGO}
            alt="Fire Finance Pro"
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-xl mx-auto mb-3 shadow-lg ring-2 ring-white/20 object-cover"
          />
          <h1 className="text-xl font-bold text-white tracking-tight">Email Verification</h1>
          <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-wider mt-1">Fire Finance Pro Account Activation</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-lg border border-white/10 shadow-lg space-y-5 text-center">
          {status === 'verifying' && (
            <div className="py-6 space-y-4">
              <div className="w-12 h-12 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Verifying Email Address</h2>
                <p className="text-stone-400 text-xs leading-relaxed">{message}</p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="py-4 space-y-4">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl border border-emerald-500/30">
                <i className="fas fa-check-circle"></i>
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white">Email Confirmed!</h2>
                <p className="text-stone-300 text-xs leading-relaxed">{message}</p>
              </div>
              <div className="pt-2">
                <a
                  href="/"
                  className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow transition-all active:scale-95 uppercase tracking-wider text-[10px]"
                >
                  Proceed to Sign In <i className="fas fa-chevron-right text-[9px]"></i>
                </a>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="py-2 space-y-4">
              <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto text-2xl border border-rose-500/30">
                <i className="fas fa-times-circle"></i>
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white">Verification Failed</h2>
                <p className="text-rose-300 text-xs leading-relaxed">{message}</p>
              </div>

              {/* Resend form */}
              <div className="mt-4 pt-4 border-t border-white/10 text-left">
                <p className="text-stone-300 text-[11px] font-medium mb-3">
                  Need a new verification link? Enter your email address below:
                </p>
                {resendSent ? (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 text-[11px] font-semibold text-center">
                    <i className="fas fa-check-circle mr-1.5"></i> A new verification link has been sent if an unverified account exists.
                  </div>
                ) : (
                  <form onSubmit={handleResend} className="space-y-3">
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-white transition-all text-xs"
                      required
                    />
                    <button
                      type="submit"
                      disabled={resendBusy}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow transition-all active:scale-95 disabled:opacity-50 text-[10px] uppercase tracking-wider"
                    >
                      {resendBusy ? 'Sending link...' : 'Resend Verification Email'}
                    </button>
                  </form>
                )}
              </div>

              <div className="pt-2">
                <a
                  href="/"
                  className="block text-[9px] font-bold text-stone-400 uppercase tracking-wider hover:text-indigo-400 transition"
                >
                  Return to Sign In
                </a>
              </div>
            </div>
          )}

          {status === 'idle' && (
            <div className="py-2 space-y-4 text-left">
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto text-xl border border-indigo-500/30 mb-2">
                  <i className="fas fa-envelope-open-text"></i>
                </div>
                <h2 className="text-sm font-bold text-white">Resend Verification Email</h2>
                <p className="text-stone-400 text-xs mt-1">Enter your registered email address to receive your confirmation link.</p>
              </div>

              {resendSent ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 text-[11px] font-semibold text-center">
                  <i className="fas fa-check-circle mr-1.5"></i> A fresh verification email has been sent. Please check your inbox and spam folder.
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-3">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-white transition-all text-xs"
                    required
                  />
                  <button
                    type="submit"
                    disabled={resendBusy}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow transition-all active:scale-95 disabled:opacity-50 text-[10px] uppercase tracking-wider"
                  >
                    {resendBusy ? 'Sending link...' : 'Send Verification Email'}
                  </button>
                </form>
              )}

              <div className="pt-2 text-center">
                <a
                  href="/"
                  className="block text-[9px] font-bold text-stone-400 uppercase tracking-wider hover:text-indigo-400 transition"
                >
                  Return to Sign In
                </a>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
