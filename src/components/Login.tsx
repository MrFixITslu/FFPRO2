
import React, { useEffect, useState } from 'react';
import { authService, AuthUser } from '../services/authService';

import { APP_LOGO, APP_LOGO_ICON } from '../assets/logo';

interface Props {
  onAuthenticated: (user: AuthUser) => void;
  initialEmail?: string;
  initialMode?: 'login' | 'register';
  resetToken?: string | null;
  onResetHandled?: () => void;
  initialBanner?: { message: string; type: 'error' | 'warning' | 'info'; provider?: string } | null;
}

const OAuthButton: React.FC<{
  provider: 'google' | 'apple';
  label: string;
  icon: string;
  isConfigured: boolean;
  onCustomClick?: () => void;
  onClickIfNotConfigured: (provider: 'google' | 'apple') => void;
}> = ({ provider, label, icon, isConfigured, onCustomClick, onClickIfNotConfigured }) => {
  if (isConfigured) {
    return (
      <button
        type="button"
        onClick={() => {
          if (onCustomClick) {
            onCustomClick();
          } else {
            window.location.href = authService.oauthUrl(provider);
          }
        }}
        className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 rounded-xl font-bold text-stone-800 text-[11px] uppercase tracking-wider transition shadow-2xs cursor-pointer"
      >
        <i className={`${icon} text-stone-700`}></i> Continue with {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClickIfNotConfigured(provider)}
      className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 rounded-xl font-bold text-stone-800 text-[11px] uppercase tracking-wider transition shadow-2xs relative group cursor-pointer"
    >
      <i className={`${icon} text-stone-700`}></i> Continue with {label}
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 text-[8px] font-bold tracking-normal normal-case">
        Configure
      </span>
    </button>
  );
};

const Login: React.FC<Props> = ({ onAuthenticated, initialEmail, initialMode, resetToken, onResetHandled, initialBanner }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'resend' | 'verification-pending'>(initialMode || 'login');
  const [email, setEmail] = useState(initialEmail || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialBanner?.message || null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [showConfigHelp, setShowConfigHelp] = useState(initialBanner?.type === 'warning' && !!initialBanner?.provider);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'facebook' | 'apple' | null>(
    (initialBanner?.provider as any) || null
  );
  const [configTab, setConfigTab] = useState<'env' | 'docker'>('env');

  useEffect(() => {
    let cancelled = false;
    authService.providers().then((providers) => {
      if (!cancelled) setAvailableProviders(providers);
    }).catch(() => {
      if (!cancelled) setAvailableProviders([]);
    });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnverifiedEmail(null);
    setResendSuccess(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await authService.login(email, password);
        onAuthenticated(user);
      } else {
        const result = await authService.register(email, username, password);
        if (result.requiresVerification) {
          setUnverifiedEmail(result.email || email);
          setVerificationNotice(result.message || 'Account created! Please check your email to confirm your address before logging in.');
          setMode('verification-pending');
        } else if (result.user) {
          onAuthenticated(result.user);
        }
      }
    } catch (err: any) {
      if (err.code === 'EMAIL_NOT_VERIFIED' || err.requiresVerification) {
        setUnverifiedEmail(err.email || email);
        setError(err.message || 'Please verify your email address to confirm it is legit before accessing the site.');
      } else {
        setError(err.message || 'Something went wrong.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendFromAlert = async (targetEmail: string) => {
    if (!targetEmail) return;
    setResendLoading(true);
    setResendSuccess(null);
    try {
      const res = await authService.resendVerification(targetEmail);
      setResendSuccess(res.message || 'A fresh verification email has been sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    // Redirect to server OAuth endpoint which handles everything:
    // - Authenticates with Google
    // - Requests Gmail scope (readonly + modify)
    // - Creates/finds user account
    // - Stores encrypted Gmail tokens server-side
    // - Returns user to dashboard after auth
    window.location.href = '/api/auth/google';
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setForgotSent(true);
    } catch (err: any) {
      // The backend always returns a generic success message, but network
      // errors etc. can still throw — show those, not "email doesn't exist".
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendSuccess(null);
    setLoading(true);
    try {
      const res = await authService.resendVerification(email);
      setResendSuccess(res.message || 'A fresh verification email has been sent if an unverified account exists.');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (resetPassword !== resetConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (resetPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(resetToken as string, resetPassword);
      setResetDone(true);
    } catch (err: any) {
      setError(err.message || 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderClick = (provider: 'google' | 'facebook' | 'apple') => {
    setSelectedProvider(provider);
    setShowConfigHelp(true);
  };

  // --- Verification-pending screen: shown after registration ---
  if (mode === 'verification-pending') {
    return (
      <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 overflow-y-auto">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-indigo-50/70 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-stone-100/80 blur-[120px] rounded-full"></div>
        </div>
        <div className="max-w-sm w-full relative z-10 my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">Check Your Email</h1>
            <img
              src={APP_LOGO}
              alt="Fire Finance Pro"
              referrerPolicy="no-referrer"
              className="h-12 w-auto max-w-[240px] mx-auto my-3 object-contain filter drop-shadow-xs"
            />
            <p className="text-indigo-600 text-xs font-bold uppercase tracking-wider mt-1">Verification Required</p>
          </div>

          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-stone-200/90 shadow-sm space-y-4 text-center">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-xl border border-indigo-200">
              <i className="fas fa-envelope-open-text"></i>
            </div>
            
            <div className="space-y-2">
              <p className="text-stone-700 text-xs leading-relaxed font-normal">
                {verificationNotice || 'We have sent a verification email to confirm that your email address is legit before giving access to the site.'}
              </p>
              <div className="py-2 px-3 bg-stone-50 border border-stone-200 rounded-xl text-indigo-700 font-mono text-xs break-all">
                {unverifiedEmail || email}
              </div>
              <p className="text-stone-500 text-[11px] leading-relaxed">
                Please click the verification link in the email to activate your account.
              </p>
            </div>

            {resendSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold leading-relaxed animate-in fade-in">
                <i className="fas fa-check-circle mr-1.5 text-emerald-600"></i> {resendSuccess}
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[9px] font-bold uppercase tracking-wider text-center animate-in shake duration-300">
                <i className="fas fa-exclamation-circle mr-1.5 text-rose-600"></i> {error}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={resendLoading}
                onClick={() => handleResendFromAlert(unverifiedEmail || email)}
                className="w-full py-2.5 bg-stone-50 hover:bg-stone-100 text-stone-800 font-bold rounded-xl shadow-2xs transition-all active:scale-98 disabled:opacity-50 text-xs uppercase tracking-wider border border-stone-200 cursor-pointer"
              >
                {resendLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="fas fa-circle-notch fa-spin text-xs"></i> Resending...
                  </span>
                ) : (
                  'Resend Verification Email'
                )}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setUnverifiedEmail(null); setResendSuccess(null); }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 text-xs uppercase tracking-wider cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Resend verification screen ---
  if (mode === 'resend') {
    return (
      <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 overflow-y-auto">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-indigo-50/70 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-stone-100/80 blur-[120px] rounded-full"></div>
        </div>
        <div className="max-w-sm w-full relative z-10 my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">Resend Verification</h1>
            <img
              src={APP_LOGO}
              alt="Fire Finance Pro"
              referrerPolicy="no-referrer"
              className="h-12 w-auto max-w-[240px] mx-auto my-3 object-contain filter drop-shadow-xs"
            />
            <p className="text-indigo-600 text-xs font-bold uppercase tracking-wider mt-1">Fire Finance Pro Account Security</p>
          </div>

          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-stone-200/90 shadow-sm space-y-4">
            {resendSuccess ? (
              <div className="text-center space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold leading-relaxed">
                  <i className="fas fa-check-circle mr-1.5 text-emerald-600"></i> {resendSuccess}
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setResendSuccess(null); setError(null); }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 uppercase tracking-wider text-xs cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResendSubmit} className="space-y-4">
                <p className="text-stone-600 text-[11px] leading-relaxed">
                  Enter your registered email address to receive a fresh verification link.
                </p>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 ml-0.5">Email</label>
                  <input
                    type="email"
                    aria-label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 rounded-xl outline-none font-semibold text-stone-900 transition-all text-sm placeholder-stone-400 shadow-2xs"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[9px] font-bold uppercase tracking-wider text-center animate-in shake duration-300">
                    <i className="fas fa-exclamation-circle mr-1.5 text-rose-600"></i> {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider text-xs cursor-pointer"
                >
                  {loading ? <i className="fas fa-circle-notch fa-spin text-xs"></i> : <>Send Verification Link <i className="fas fa-chevron-right text-[9px]"></i></>}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="w-full text-center text-xs font-bold text-stone-500 uppercase tracking-wider hover:text-indigo-600 transition cursor-pointer"
                >
                  Back to Sign In
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Reset-password screen: shown when the user arrived via the emailed link ---
  if (resetToken) {
    return (
      <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 overflow-y-auto">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-indigo-50/70 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-stone-100/80 blur-[120px] rounded-full"></div>
        </div>
        <div className="max-w-sm w-full relative z-10 my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">Reset Your Password</h1>
            <img
              src={APP_LOGO}
              alt="Fire Finance Pro"
              referrerPolicy="no-referrer"
              className="h-12 w-auto max-w-[240px] mx-auto my-3 object-contain filter drop-shadow-xs"
            />
            <p className="text-indigo-600 text-xs font-bold uppercase tracking-wider mt-1">Manage your money and projects</p>
          </div>

          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-stone-200/90 shadow-sm space-y-4">
            {resetDone ? (
              <div className="text-center space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold leading-relaxed">
                  <i className="fas fa-check-circle mr-1.5 text-emerald-600"></i> Your password has been reset. You can now log in with your new password.
                </div>
                <button
                  type="button"
                  onClick={() => onResetHandled && onResetHandled()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 uppercase tracking-wider text-xs cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 ml-0.5">New Password</label>
                  <input
                    type="password"
                    aria-label="New password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 rounded-xl outline-none font-semibold text-stone-900 transition-all text-sm placeholder-stone-400 shadow-2xs"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 ml-0.5">Confirm New Password</label>
                  <input
                    type="password"
                    aria-label="Confirm new password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 rounded-xl outline-none font-semibold text-stone-900 transition-all text-sm placeholder-stone-400 shadow-2xs"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[9px] font-bold uppercase tracking-wider text-center animate-in shake duration-300">
                    <i className="fas fa-exclamation-circle mr-1.5 text-rose-600"></i> {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider text-xs cursor-pointer"
                >
                  {loading ? <i className="fas fa-circle-notch fa-spin text-xs"></i> : <>Set New Password <i className="fas fa-chevron-right text-[9px]"></i></>}
                </button>
                <button
                  type="button"
                  onClick={() => onResetHandled && onResetHandled()}
                  className="w-full text-center text-xs font-bold text-stone-500 uppercase tracking-wider hover:text-indigo-600 transition cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Forgot-password screen ---
  if (mode === 'forgot') {
    return (
      <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 overflow-y-auto">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-indigo-50/70 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-stone-100/80 blur-[120px] rounded-full"></div>
        </div>
        <div className="max-w-sm w-full relative z-10 my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">Forgot Password</h1>
            <img
              src={APP_LOGO}
              alt="Fire Finance Pro"
              referrerPolicy="no-referrer"
              className="h-12 w-auto max-w-[240px] mx-auto my-3 object-contain filter drop-shadow-xs"
            />
            <p className="text-indigo-600 text-xs font-bold uppercase tracking-wider mt-1">Manage your money and projects</p>
          </div>

          <div className="bg-white p-6 sm:p-7 rounded-2xl border border-stone-200/90 shadow-sm space-y-4">
            {forgotSent ? (
              <div className="text-center space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold leading-relaxed">
                  <i className="fas fa-check-circle mr-1.5 text-emerald-600"></i> If an account exists for that email, a reset link has been sent. The link expires in 45 minutes.
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setForgotSent(false); setError(null); }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 uppercase tracking-wider text-xs cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <p className="text-stone-600 text-[11px] leading-relaxed">Enter your account email and we'll send you a link to reset your password.</p>
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 ml-0.5">Email</label>
                  <input
                    type="email"
                    aria-label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 rounded-xl outline-none font-semibold text-stone-900 transition-all text-sm placeholder-stone-400 shadow-2xs"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[9px] font-bold uppercase tracking-wider text-center animate-in shake duration-300">
                    <i className="fas fa-exclamation-circle mr-1.5 text-rose-600"></i> {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider text-xs cursor-pointer"
                >
                  {loading ? <i className="fas fa-circle-notch fa-spin text-xs"></i> : <>Send Reset Link <i className="fas fa-chevron-right text-[9px]"></i></>}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="w-full text-center text-xs font-bold text-stone-500 uppercase tracking-wider hover:text-indigo-600 transition cursor-pointer"
                >
                  Back to Sign In
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center p-6 overflow-y-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-indigo-50/70 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-stone-100/80 blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-sm w-full relative z-10 my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-6">
          <img
            src={APP_LOGO}
            alt="Fire Finance Pro"
            referrerPolicy="no-referrer"
            className="h-16 sm:h-20 w-auto max-w-[320px] mx-auto mb-3 object-contain filter drop-shadow-xs"
          />
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Fire Finance Pro</h1>
          <p className="text-indigo-600 text-xs font-bold uppercase tracking-wider mt-1">Manage your money and projects</p>
        </div>

        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-stone-200/90 shadow-sm space-y-4">
          {availableProviders.includes('google') && <>
          <div className="space-y-2">
            <OAuthButton
              provider="google"
              label="Google"
              icon="fab fa-google"
              isConfigured={availableProviders.includes('google')}
              onCustomClick={handleGoogleSignIn}
              onClickIfNotConfigured={handleProviderClick}
            />
          </div>

          <div className="flex items-center gap-3 text-stone-400 text-[8px] font-bold uppercase tracking-wider">
            <div className="flex-1 h-px bg-stone-200" /> or use email <div className="flex-1 h-px bg-stone-200" />
          </div>

          </>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 ml-0.5">Email</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs">
                  <i className="fas fa-envelope"></i>
                </span>
                <input
                  type="email"
                    aria-label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9.5 pr-3.5 py-2.5 bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 rounded-xl outline-none font-semibold text-stone-900 transition-all text-sm placeholder-stone-400 shadow-2xs"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 ml-0.5">Username <span className="text-stone-400 normal-case">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs">
                    <i className="fas fa-user"></i>
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9.5 pr-3.5 py-2.5 bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 rounded-xl outline-none font-semibold text-stone-900 transition-all text-sm placeholder-stone-400 shadow-2xs"
                    placeholder="Username"
                    autoComplete="username"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 ml-0.5">Password</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs">
                  <i className="fas fa-lock"></i>
                </span>
                <input
                  type="password"
                    aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9.5 pr-3.5 py-2.5 bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 rounded-xl outline-none font-semibold text-stone-900 transition-all text-sm placeholder-stone-400 shadow-2xs"
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                />
              </div>
              {mode === 'login' && (
                <div className="text-right mt-1.5">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); }}
                    className="text-xs font-bold text-stone-500 uppercase tracking-wider hover:text-indigo-600 transition"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-2 animate-in shake duration-300">
                <div className="flex items-start gap-2">
                  <i className="fas fa-exclamation-circle text-rose-600 mt-0.5 shrink-0"></i>
                  <p className="font-semibold leading-tight">{error}</p>
                </div>
                {unverifiedEmail && (
                  <button
                    type="button"
                    disabled={resendLoading}
                    onClick={() => handleResendFromAlert(unverifiedEmail)}
                    className="w-full mt-1.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 rounded-lg font-bold text-xs uppercase tracking-wider transition disabled:opacity-50"
                  >
                    {resendLoading ? 'Sending link...' : `Resend verification link to ${unverifiedEmail}`}
                  </button>
                )}
              </div>
            )}

            {resendSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold text-center leading-relaxed">
                <i className="fas fa-check-circle mr-1.5 text-emerald-600"></i> {resendSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider text-xs cursor-pointer"
            >
              {loading ? (
                <i className="fas fa-circle-notch fa-spin text-xs"></i>
              ) : mode === 'login' ? (
                <>Sign in <i className="fas fa-chevron-right text-[9px]"></i></>
              ) : (
                <>Create Account <i className="fas fa-chevron-right text-[9px]"></i></>
              )}
            </button>
          </form>

          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setUnverifiedEmail(null); setResendSuccess(null); }}
              className="w-full text-center text-xs font-bold text-stone-600 uppercase tracking-wider hover:text-indigo-600 transition cursor-pointer"
            >
              {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
            </button>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => { setMode('resend'); setError(null); setResendSuccess(null); }}
                className="w-full text-center text-xs font-medium text-stone-500 hover:text-stone-800 transition cursor-pointer"
              >
                Didn't receive verification email?
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-stone-400 text-[9px] font-bold uppercase tracking-wider">
          Your finances. Your plans. One place.
        </p>
        <p className="mt-2 text-center text-xs text-stone-500">
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition">Terms of Service</a>
          <span className="mx-1.5">·</span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition">Privacy Policy</a>
        </p>
      </div>

      {showConfigHelp && (
        <div className="fixed inset-0 z-[250] bg-stone-950/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 text-sm">
                  <i className={selectedProvider === 'google' ? 'fab fa-google' : 'fab fa-apple'}></i>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 capitalize">{selectedProvider} Integration</h3>
                  <p className="text-[9px] font-semibold text-stone-500 uppercase tracking-wider">Self-Hosted Server Guide</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowConfigHelp(false);
                  setSelectedProvider(null);
                }}
                className="text-stone-400 hover:text-stone-700 transition p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer"
                aria-label="Close"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-stone-200 bg-stone-100/60">
              <button
                type="button"
                onClick={() => setConfigTab('env')}
                className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  configTab === 'env'
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
                }`}
              >
                1. Environment Setup
              </button>
              <button
                type="button"
                onClick={() => setConfigTab('docker')}
                className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  configTab === 'docker'
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
                }`}
              >
                2. Docker &amp; Nginx Setup
              </button>
            </div>

            {/* Content (Scrollable) */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-stone-700">
              {configTab === 'env' && (
                <div className="space-y-3">
                  <p className="text-stone-600 leading-relaxed text-[11px]">
                    To enable <strong>Continue with {selectedProvider === 'google' ? 'Google' : 'Apple'}</strong> on your live deployment, register your application on the developer portal and configure the following environment variables:
                  </p>

                  <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800 font-mono text-xs text-emerald-400 space-y-1 select-all leading-relaxed">
                    {selectedProvider === 'google' && (
                      <>
                        <div className="text-stone-400"># Google Cloud Console OAuth Client</div>
                        <div>GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"</div>
                        <div>GOOGLE_CLIENT_SECRET="your_google_client_secret"</div>
                        <div>GOOGLE_CALLBACK_URL="https://ffpro.v79sl.com/api/auth/google/callback"</div>
                      </>
                    )}
                    {selectedProvider === 'apple' && (
                      <>
                        <div className="text-stone-400"># Apple Developer Portal Sign In</div>
                        <div>APPLE_CLIENT_ID="your_services_id"</div>
                        <div>APPLE_TEAM_ID="your_developer_team_id"</div>
                        <div>APPLE_KEY_ID="your_private_key_id"</div>
                        <div>APPLE_PRIVATE_KEY_PATH="/path/to/key.p8"</div>
                        <div>APPLE_CALLBACK_URL="https://ffpro.v79sl.com/api/auth/apple/callback"</div>
                      </>
                    )}
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10.5px] leading-relaxed text-amber-900">
                    <div className="font-bold uppercase tracking-wider text-[8.5px] text-amber-800 mb-1 flex items-center gap-1.5">
                      <i className="fas fa-exclamation-triangle"></i> Developer Portal Settings
                    </div>
                    Ensure that you add the corresponding Callback URL to your Authorized Redirect URIs in the developer settings portal for {selectedProvider === 'google' ? 'Google Cloud Console' : 'Apple Developers'}!
                  </div>
                </div>
              )}

              {configTab === 'docker' && (
                <div className="space-y-3">
                  <div className="text-stone-600 leading-relaxed text-[11px] space-y-2">
                    <p>
                      Since <strong>Port 3000 is already used</strong> on your server, and your Nginx reverse proxy is running on the Docker network <strong>"proxy_network"</strong>, you can use container-to-container routing:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 mt-1 text-[10.5px]">
                      <li>Nginx and this application container join the <code className="text-indigo-600 font-mono bg-stone-100 px-1 py-0.5 rounded">proxy_network</code> network.</li>
                      <li>Nginx forwards requests directly to the container's service name on port <code className="text-indigo-600 font-mono bg-stone-100 px-1 py-0.5 rounded">3000</code>.</li>
                      <li><strong>No host port mapping is needed</strong>, which avoids any conflict with Port 3000 on the host system!</li>
                    </ul>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">docker-compose.yml</span>
                    </div>
                    <pre className="bg-stone-950 p-3 rounded-xl border border-stone-800 font-mono text-[9px] text-stone-300 overflow-x-auto select-all leading-relaxed max-h-48">
{`version: '3.8'

services:
  fire-finance:
    image: fire-finance-pro:latest
    container_name: fire-finance-app
    restart: unless-stopped
    networks:
      - proxy_network
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your_secure_random_session_secret
      - DATA_ENCRYPTION_KEY=your_32_byte_base64_encryption_key
      - GEMINI_API_KEY=your_gemini_api_key
      ` + (selectedProvider === 'google' ? `- GOOGLE_CLIENT_ID=your_google_client_id
      - GOOGLE_CLIENT_SECRET=your_google_client_secret
      - GOOGLE_CALLBACK_URL=https://ffpro.v79sl.com/api/auth/google/callback` : `- APPLE_CLIENT_ID=your_services_id
      - APPLE_TEAM_ID=your_developer_team_id
      - APPLE_KEY_ID=your_private_key_id
      - APPLE_CALLBACK_URL=https://ffpro.v79sl.com/api/auth/apple/callback`) + `
      - FRONTEND_URL=https://ffpro.v79sl.com

networks:
  proxy_network:
    external: true`}
                    </pre>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">nginx.conf Server Block</span>
                    </div>
                    <pre className="bg-stone-950 p-3 rounded-xl border border-stone-800 font-mono text-[9px] text-stone-300 overflow-x-auto select-all leading-relaxed max-h-48">
{`server {
    listen 80;
    server_name ffpro.v79sl.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ffpro.v79sl.com;

    ssl_certificate /etc/letsencrypt/live/ffpro.v79sl.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ffpro.v79sl.com/privkey.pem;

    location / {
        # Route to container internally on same Docker network
        proxy_pass http://fire-finance-app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-stone-200 bg-stone-50/70 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowConfigHelp(false);
                  setSelectedProvider(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs"
              >
                Got it, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
