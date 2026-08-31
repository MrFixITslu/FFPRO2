import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const getProvider = () => {
  const p = new GoogleAuthProvider();
  p.addScope('https://www.googleapis.com/auth/gmail.readonly');
  p.addScope('https://www.googleapis.com/auth/gmail.modify');
  p.setCustomParameters({
    prompt: 'select_account consent',
  });
  return p;
};

const TOKEN_STORAGE_KEY = 'ff_gmail_access_token';

let isSigningIn = false;
let cachedAccessToken: string | null = (typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null);

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const setManualAccessToken = (token: string) => {
  cachedAccessToken = token.trim();
  if (typeof window !== 'undefined') {
    if (cachedAccessToken) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, cachedAccessToken);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const provider = getProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in succeeded, but no Gmail access token was returned.');
    }

    cachedAccessToken = credential.accessToken;
    setManualAccessToken(cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    if (error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized-domain')) {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'unknown-domain';
      const customErr: any = new Error(
        `The domain "${currentHost}" is not in the Firebase Authorized Domains list. Add "${currentHost}" in Firebase Console (Authentication → Settings → Authorized domains) or supply a direct Google token.`
      );
      customErr.code = 'auth/unauthorized-domain';
      customErr.domain = currentHost;
      throw customErr;
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  }
  return null;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};
