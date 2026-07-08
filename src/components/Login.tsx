
import React, { useEffect, useState } from 'react';
import { authService, AuthUser } from '../services/authService';

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

const OAuthButton: React.FC<{ provider: 'google' | 'facebook' | 'apple'; label: string; icon: string }> = ({ provider, label, icon }) => (
  <a
    href={authService.oauthUrl(provider)}
    className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded font-bold text-white text-[10px] uppercase tracking-wider transition-all"
  >
    <i className={icon}></i> Continue with {label}
  </a>
);

const Login: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);

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
    setLoading(true);
    try {
      const user = mode === 'login'
        ? await authService.login(email, password)
        : await authService.register(email, username, password);
      onAuthenticated(user);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900 flex items-center justify-center p-6 overflow-y-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/5 blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-sm w-full relative z-10 my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-600 rounded flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-sm ring-1 ring-white/10">
            <i className="fas fa-fingerprint text-xl"></i>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Vault Access</h1>
          <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider mt-1.5">Fire Finance Secure Gateway</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-lg border border-white/10 shadow-lg space-y-4">
          {availableProviders.length > 0 && (
            <div className="space-y-2">
              {availableProviders.includes('google') && <OAuthButton provider="google" label="Google" icon="fab fa-google" />}
              {availableProviders.includes('facebook') && <OAuthButton provider="facebook" label="Facebook" icon="fab fa-facebook" />}
              {availableProviders.includes('apple') && <OAuthButton provider="apple" label="Apple" icon="fab fa-apple" />}
            </div>
          )}

          {availableProviders.length > 0 && (
            <div className="flex items-center gap-3 text-slate-500 text-[8px] font-bold uppercase tracking-wider">
              <div className="flex-1 h-px bg-white/10" /> or use email <div className="flex-1 h-px bg-white/10" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Email</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
                  <i className="fas fa-envelope"></i>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 px-3 py-2 bg-white/5 border border-white/10 rounded outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-white transition-all text-xs"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Username <span className="text-slate-500 normal-case">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
                    <i className="fas fa-user"></i>
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 px-3 py-2 bg-white/5 border border-white/10 rounded outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-white transition-all text-xs"
                    placeholder="Username"
                    autoComplete="username"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
                  <i className="fas fa-lock"></i>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 px-3 py-2 bg-white/5 border border-white/10 rounded outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-white transition-all text-xs"
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400 text-[9px] font-bold uppercase tracking-wider text-center animate-in shake duration-300">
                <i className="fas fa-exclamation-circle mr-1.5"></i> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider text-[10px]"
            >
              {loading ? (
                <i className="fas fa-circle-notch fa-spin text-xs"></i>
              ) : mode === 'login' ? (
                <>Decrypt &amp; Enter <i className="fas fa-chevron-right text-[9px]"></i></>
              ) : (
                <>Create Account <i className="fas fa-chevron-right text-[9px]"></i></>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
            className="w-full text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider hover:text-indigo-400 transition"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        </div>

        <p className="mt-6 text-center text-slate-600 text-[8px] font-bold uppercase tracking-wider">
          Auth-Shield v2.0 • OAuth2 + bcrypt
        </p>
      </div>
    </div>
  );
};

export default Login;
