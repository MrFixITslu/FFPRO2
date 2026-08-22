import { AppState } from './vaultService';

const BASE = '/api/data';

export interface RemoteDataEnvelope {
  data: AppState | null;
  version: number;
  updatedAt: string | null;
}

export class SyncConflictError extends Error {
  version: number;
  constructor(version: number) {
    super('Data was updated elsewhere since you last loaded it.');
    this.name = 'SyncConflictError';
    this.version = version;
  }
}

async function handle(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 409) {
    throw new SyncConflictError(body.version ?? 0);
  }
  if (!res.ok) {
    throw new Error(body.error || 'Sync request failed.');
  }
  return body;
}

export const dataSyncService = {
  /** Loads the current account's synced data (or null if never synced before). */
  async fetch(): Promise<RemoteDataEnvelope> {
    const res = await fetch(BASE, { 
      credentials: 'include'
    });
    return handle(res);
  },

  /**
   * Saves the full app state under optimistic concurrency: expectedVersion must
   * match what the server currently has, or this throws SyncConflictError so
   * the caller can reload the latest copy instead of silently overwriting it.
   * If force is true, bypasses version check (e.g. for user-triggered Sync Now or auto-reconciliation).
   * If keepalive is true, the request is allowed to outlive the page (tab close,
   * navigation, phone backgrounding) — used to flush pending changes that would
   * otherwise be lost to the debounced autosave timer never getting to run.
   */
  async save(data: AppState, expectedVersion: number, force: boolean = false, keepalive: boolean = false): Promise<{ ok: true; version: number }> {
    const res = await fetch(BASE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive,
      body: JSON.stringify({ data, expectedVersion, force }),
    });
    return handle(res);
  },

  /** Wipes the synced copy for the current account (used by "Purge data"). */
  async clear(): Promise<void> {
    await fetch(BASE, { 
      method: 'DELETE', 
      credentials: 'include'
    });
  },
};
