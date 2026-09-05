type RealtimeEventName = 
  | 'connected'
  | 'project_updated'
  | 'user_data_updated'
  | 'chat_message'
  | 'project_membership_updated'
  | 'notifications_updated'
  | 'status_change';

type EventHandler = (payload: any) => void;

class RealtimeService {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;
  private currentStatus: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
  private watchedProjects: Set<string> = new Set();

  public get status(): 'connected' | 'connecting' | 'disconnected' {
    return this.currentStatus;
  }

  private setStatus(status: 'connected' | 'connecting' | 'disconnected') {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.emit('status_change', { status });
    }
  }

  public connect(): void {
    if (this.eventSource || this.currentStatus === 'connecting') return;
    this.isExplicitlyClosed = false;
    this.setStatus('connecting');

    try {
      this.eventSource = new EventSource('/api/realtime/stream', {
        withCredentials: true
      });

      this.eventSource.addEventListener('open', () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        // Re-watch any projects
        this.watchedProjects.forEach(pid => this.sendWatch(pid));
      });

      this.eventSource.addEventListener('connected', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('connected', data);
        } catch (err) {
          // ignore json parse error
        }
      });

      this.eventSource.addEventListener('project_updated', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('project_updated', data);
        } catch (err) {
          console.error('[realtime] parse project_updated error:', err);
        }
      });

      this.eventSource.addEventListener('user_data_updated', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('user_data_updated', data);
        } catch (err) {
          console.error('[realtime] parse user_data_updated error:', err);
        }
      });

      this.eventSource.addEventListener('chat_message', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('chat_message', data);
        } catch (err) {
          console.error('[realtime] parse chat_message error:', err);
        }
      });

      this.eventSource.addEventListener('project_membership_updated', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('project_membership_updated', data);
        } catch (err) {
          console.error('[realtime] parse project_membership_updated error:', err);
        }
      });

      this.eventSource.addEventListener('notifications_updated', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('notifications_updated', data);
        } catch (err) {
          console.error('[realtime] parse notifications_updated error:', err);
        }
      });

      this.eventSource.onerror = async () => {
        this.cleanup();
        this.setStatus('disconnected');
        if (!this.isExplicitlyClosed) {
          // Check if session is still active before looping
          if (this.reconnectAttempts >= 2) {
            try {
              const res = await fetch('/api/auth/me', { credentials: 'include' });
              if (!res.ok) {
                // Not authenticated on server, stop reconnect loop
                this.isExplicitlyClosed = true;
                return;
              }
            } catch {
              // Network down, proceed with backoff
            }
          }
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.warn('[realtime] Failed to initialize EventSource:', err);
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isExplicitlyClosed) return;
    const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    this.setStatus('disconnected');
  }

  public watchProject(projectId: string): void {
    if (!projectId) return;
    this.watchedProjects.add(projectId);
    if (this.currentStatus === 'connected') {
      this.sendWatch(projectId);
    }
  }

  public unwatchProject(projectId: string): void {
    if (!projectId) return;
    this.watchedProjects.delete(projectId);
    if (this.currentStatus === 'connected') {
      fetch('/api/realtime/unwatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId })
      }).catch(() => {});
    }
  }

  private sendWatch(projectId: string) {
    fetch('/api/realtime/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ projectId })
    }).catch(() => {});
  }

  public on(event: RealtimeEventName, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  public off(event: RealtimeEventName, handler: EventHandler): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  private emit(event: string, payload: any) {
    const set = this.handlers.get(event);
    if (set) {
      set.forEach(h => {
        try {
          h(payload);
        } catch (err) {
          console.error(`[realtime] Error in handler for event "${event}":`, err);
        }
      });
    }
  }
}

export const realtimeService = new RealtimeService();
