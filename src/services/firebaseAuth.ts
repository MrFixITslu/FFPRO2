import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { GmailPlanningNotification } from '../types';

// Initialize Firebase App safely (singleton)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Provider with Gmail read/modify scopes
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.modify');
googleProvider.setCustomParameters({
  prompt: 'consent select_account',
});

// Cache the access token in memory and session storage
let cachedAccessToken: string | null = null;
try {
  cachedAccessToken = sessionStorage.getItem('ffpro_google_access_token');
} catch (e) {}

let isSigningIn = false;

export const initFirebaseAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = getFirebaseAccessToken();
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      cachedAccessToken = null;
      try {
        sessionStorage.removeItem('ffpro_google_access_token');
      } catch (e) {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithGooglePopup = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    if (cachedAccessToken) {
      try {
        sessionStorage.setItem('ffpro_google_access_token', cachedAccessToken);
      } catch (e) {}
    }
    return {
      user: result.user,
      accessToken: cachedAccessToken,
    };
  } catch (error: any) {
    // User closed popup or cancelled
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      console.log('[Firebase Auth] Sign in popup was closed by user.');
      return null;
    }
    console.error('[Firebase Auth] Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getFirebaseAccessToken = (): string | null => {
  if (!cachedAccessToken) {
    try {
      cachedAccessToken = sessionStorage.getItem('ffpro_google_access_token');
    } catch (e) {}
  }
  return cachedAccessToken;
};

export const setFirebaseAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      sessionStorage.setItem('ffpro_google_access_token', token);
    } else {
      sessionStorage.removeItem('ffpro_google_access_token');
    }
  } catch (e) {}
};

export const firebaseLogout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem('ffpro_google_access_token');
  } catch (e) {}
};

/**
 * Fetch unread planning emails directly via Gmail REST API using the bearer token
 */
export const fetchDirectGmailNotifications = async (
  accessToken: string,
  userTasks: { taskId: string; taskTitle: string; projectName?: string; projectId?: string | null }[] = []
): Promise<GmailPlanningNotification[]> => {
  try {
    const searchQuery = 'label:INBOX is:unread';
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`;
    
    const listRes = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!listRes.ok) {
      throw new Error(`Gmail API returned status ${listRes.status}`);
    }

    const listData = await listRes.json();
    const stubs = listData.messages || [];
    if (stubs.length === 0) return [];

    const notifications: GmailPlanningNotification[] = [];

    for (const stub of stubs.slice(0, 8)) {
      try {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${stub.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
        const msgRes = await fetch(msgUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });

        if (!msgRes.ok) continue;

        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('From');
        const to = getHeader('To');
        const subject = getHeader('Subject') || '(No Subject)';
        const dateHeader = getHeader('Date');
        const snippet = msgData.snippet || '';
        const isUnread = Array.isArray(msgData.labelIds) && msgData.labelIds.includes('UNREAD');

        if (!isUnread) continue;

        let cleanFrom = from;
        const senderMatch = from.match(/^"?([^"<]+)"?\s*<.*>$/);
        if (senderMatch && senderMatch[1]) {
          cleanFrom = senderMatch[1].trim();
        }

        // Match with local task
        let matchedTask: any = null;
        const combined = (subject + ' ' + snippet).toLowerCase();
        for (const t of userTasks) {
          const title = (t.taskTitle || '').trim().toLowerCase();
          if (title.length >= 4 && (combined.includes(title) || subject.toLowerCase().includes(title))) {
            matchedTask = t;
            break;
          }
        }

        notifications.push({
          id: msgData.id,
          threadId: msgData.threadId,
          from: cleanFrom || 'Unknown Sender',
          fromRaw: from,
          to,
          subject,
          snippet,
          date: dateHeader ? new Date(dateHeader).toISOString() : new Date(parseInt(msgData.internalDate || Date.now(), 10)).toISOString(),
          isUnread: true,
          taskReference: matchedTask ? {
            taskId: matchedTask.taskId,
            taskTitle: matchedTask.taskTitle,
            projectName: matchedTask.projectName,
            projectId: matchedTask.projectId || null,
            source: 'task',
          } : null,
        });
      } catch (e) {
        console.warn('Failed to parse email message stub', stub.id, e);
      }
    }

    return notifications;
  } catch (err) {
    console.error('Direct Gmail fetch error:', err);
    throw err;
  }
};

/**
 * Mark message as read directly via Gmail REST API
 */
export const markDirectGmailAsRead = async (messageId: string, accessToken: string): Promise<boolean> => {
  try {
    const modifyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`;
    const res = await fetch(modifyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD'],
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Error marking Gmail message read:', err);
    return false;
  }
};
