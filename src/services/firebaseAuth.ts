import { GmailPlanningNotification } from '../types';

// Stubs replacing legacy client-side Firebase Auth.
// All Google OAuth and Gmail operations are handled securely via server-side OAuth (/api/auth/google, /api/gmail/*).

export const auth: any = null;

export const initFirebaseAuth = (
  _onAuthSuccess?: (user: any, token: string | null) => void,
  _onAuthFailure?: () => void
) => {
  return () => {};
};

export const signInWithGooglePopup = async (): Promise<{ user: any; accessToken: string | null } | null> => {
  window.location.href = '/api/auth/google';
  return null;
};

export const getFirebaseAccessToken = (): string | null => null;

export const setFirebaseAccessToken = (_token: string | null) => {};

export const firebaseLogout = async () => {};

export const fetchDirectGmailNotifications = async (
  _accessToken: string,
  _userTasks: any[] = []
): Promise<GmailPlanningNotification[]> => {
  return [];
};

export const markDirectGmailAsRead = async (
  _messageId: string,
  _accessToken: string
): Promise<boolean> => {
  return false;
};
