import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ToastProvider } from './components/Toast';
import { installApiFetch } from './services/apiFetch';
// Retire legacy bearer sessions; production uses HttpOnly cookies only.
localStorage.removeItem('ffpro_session_token');
installApiFetch();
createRoot(document.getElementById('root')!).render(
  <StrictMode><ToastProvider><Suspense fallback={<div role="status" className="p-8">Loading…</div>}><App /></Suspense></ToastProvider></StrictMode>
);
