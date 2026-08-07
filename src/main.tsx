import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// --- Global API Session Token Interceptor ---
// Intercepts relative /api fetches to handle third-party cookie restrictions (iframe sandboxing)
const originalFetch = window.fetch;
const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const token = localStorage.getItem('ffpro_session_token');
  let isApi = false;
  let url = '';

  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else if (input && typeof input === 'object' && 'url' in input) {
    url = (input as any).url;
  }

  // Ensure it is an API call
  if (url.startsWith('/api/') || url.startsWith('api/') || url.includes('/api/')) {
    isApi = true;
    if (token) {
      init = init || {};
      if (!init.headers) {
        init.headers = {};
      }
      if (init.headers instanceof Headers) {
        init.headers.set('x-session-id', token);
      } else if (Array.isArray(init.headers)) {
        // If it's an array of headers, insert/replace the custom header
        const index = init.headers.findIndex(([k]) => k.toLowerCase() === 'x-session-id');
        if (index >= 0) {
          init.headers[index] = ['x-session-id', token];
        } else {
          init.headers.push(['x-session-id', token]);
        }
      } else {
        (init.headers as Record<string, string>)['x-session-id'] = token;
      }
    }
  }

  const response = await originalFetch(input, init);

  if (isApi) {
    // Save token if returning from successful login, register, or session checks
    if (url.includes('/api/auth/login') || url.includes('/api/auth/register') || url.includes('/api/auth/me') || url.includes('/api/auth/session-state')) {
      if (response.ok) {
        try {
          const clone = response.clone();
          const json = await clone.json();
          if (json && json.token) {
            localStorage.setItem('ffpro_session_token', json.token);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    } else if (url.includes('/api/auth/logout')) {
      if (response.ok) {
        localStorage.removeItem('ffpro_session_token');
      }
    }
  }

  return response;
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    configurable: true,
    writable: true,
    enumerable: true
  });
} catch (e) {
  console.warn('Failed to override window.fetch via Object.defineProperty, falling back to direct assignment:', e);
  try {
    (window as any).fetch = customFetch;
  } catch (err) {
    console.error('Failed to override window.fetch entirely:', err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
