/**
 * Badge Service
 * Coordinates Mobile App Icon Badging (PWA App Badging API),
 * Service Worker background badging, dynamic favicon counter,
 * and multi-tab synchronization.
 */

class BadgeService {
  private currentCount: number = 0;
  private originalTitle: string = 'Fire Finance Pro';
  private originalFaviconHref: string = '/favicon.png';
  private broadcastChannel: BroadcastChannel | null = null;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private baseIconImage: HTMLImageElement | null = null;
  private isIconLoaded: boolean = false;
  private listeners: Set<(count: number) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      // Cache original title
      this.originalTitle = document.title || 'Fire Finance Pro';

      // Load stored badge count from local persistence
      try {
        const stored = localStorage.getItem('ffpro_badge_count');
        if (stored) {
          this.currentCount = Math.max(0, parseInt(stored, 10) || 0);
        }
      } catch (e) {}

      // Set up multi-tab synchronization via BroadcastChannel
      if ('BroadcastChannel' in window) {
        try {
          this.broadcastChannel = new BroadcastChannel('ffpro_badge_channel');
          this.broadcastChannel.onmessage = (event) => {
            if (event.data && typeof event.data.count === 'number') {
              this.applyBadgeLocally(event.data.count, false);
            }
          };
        } catch (e) {}
      }

      // Storage event listener fallback for browsers without BroadcastChannel
      window.addEventListener('storage', (e) => {
        if (e.key === 'ffpro_badge_count' && e.newValue !== null) {
          const newCount = Math.max(0, parseInt(e.newValue, 10) || 0);
          this.applyBadgeLocally(newCount, false);
        }
      });

      // Initialize Service Worker
      this.initServiceWorker();

      // Preload icon image for canvas drawing
      this.preloadFavicon();
    }
  }

  /**
   * Preload base favicon for dynamic badge generation on browser tabs
   */
  private preloadFavicon() {
    if (typeof window === 'undefined') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = this.originalFaviconHref;
    img.onload = () => {
      this.baseIconImage = img;
      this.isIconLoaded = true;
      if (this.currentCount > 0) {
        this.updateFaviconBadge(this.currentCount);
      }
    };
    img.onerror = () => {
      this.isIconLoaded = false;
    };
  }

  /**
   * Register Service Worker
   */
  private async initServiceWorker() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.serviceWorkerRegistration = reg;

      // Sync initial badge to service worker
      if (this.currentCount > 0 && reg.active) {
        reg.active.postMessage({ type: 'SET_BADGE', count: this.currentCount });
      }
    } catch (err) {
      // SW registration in sandboxed iframe or non-https might fail silently
    }
  }

  /**
   * Format badge count for display (1..99, 99+)
   */
  public formatBadgeCount(count: number): string {
    if (!count || count <= 0) return '';
    if (count > 99) return '99+';
    return String(count);
  }

  /**
   * Update the badge count across all interfaces:
   * 1. Native Mobile Home-Screen / PWA App Badging API
   * 2. Active Service Worker
   * 3. Browser Tab Dynamic Favicon Badge
   * 4. Document Title Prefix `(N) App Name`
   * 5. Multi-Tab Broadcast
   */
  public setBadge(count: number, broadcast: boolean = true): void {
    const sanitizedCount = typeof count === 'number' && Number.isFinite(count) && count >= 0
      ? Math.floor(count)
      : 0;

    this.applyBadgeLocally(sanitizedCount, broadcast);
  }

  /**
   * Clear all badges
   */
  public clearBadge(broadcast: boolean = true): void {
    this.applyBadgeLocally(0, broadcast);
  }

  /**
   * Get current unread notification count
   */
  public getCount(): number {
    return this.currentCount;
  }

  /**
   * Subscribe to badge count changes
   */
  public subscribe(listener: (count: number) => void): () => void {
    this.listeners.add(listener);
    // Initial call
    listener(this.currentCount);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Internal implementation of badge updates
   */
  private applyBadgeLocally(count: number, broadcast: boolean) {
    const prevCount = this.currentCount;
    this.currentCount = count;

    // 1. Persist in localStorage
    try {
      localStorage.setItem('ffpro_badge_count', String(count));
    } catch (e) {}

    // 2. W3C Native App Badging API (Mobile Home Screen & Taskbar)
    if (typeof navigator !== 'undefined') {
      try {
        if ('setAppBadge' in navigator) {
          if (count > 0) {
            navigator.setAppBadge(count).catch(() => {});
          } else {
            navigator.clearAppBadge().catch(() => {});
          }
        }
      } catch (err) {
        // Silent fallback
      }
    }

    // 3. Relay to Service Worker
    try {
      if (this.serviceWorkerRegistration?.active) {
        this.serviceWorkerRegistration.active.postMessage({
          type: count > 0 ? 'SET_BADGE' : 'CLEAR_BADGE',
          count
        });
      } else if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: count > 0 ? 'SET_BADGE' : 'CLEAR_BADGE',
          count
        });
      }
    } catch (err) {}

    // 4. Update Document Title
    try {
      if (count > 0) {
        const badgeStr = this.formatBadgeCount(count);
        document.title = `(${badgeStr}) ${this.originalTitle}`;
      } else {
        document.title = this.originalTitle;
      }
    } catch (err) {}

    // 5. Update Dynamic Favicon
    this.updateFaviconBadge(count);

    // 6. Multi-tab synchronization
    if (broadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ count });
      } catch (e) {}
    }

    // 7. Notify in-memory React listeners if count changed
    if (prevCount !== count || count === 0) {
      this.listeners.forEach(fn => {
        try {
          fn(count);
        } catch (e) {}
      });
    }
  }

  /**
   * Draw badge directly on favicon using HTML5 Canvas
   */
  private updateFaviconBadge(count: number) {
    if (typeof document === 'undefined') return;

    const faviconLink = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
    if (!faviconLink) return;

    if (count <= 0) {
      // Restore standard favicon
      faviconLink.href = this.originalFaviconHref;
      return;
    }

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 64;
      this.canvas.height = 64;
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 64, 64);

    // Draw base icon
    if (this.baseIconImage && this.isIconLoaded) {
      ctx.drawImage(this.baseIconImage, 0, 0, 64, 64);
    } else {
      // Fallback base icon background
      ctx.fillStyle = '#4f46e5';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(4, 4, 56, 56, 12) : ctx.rect(4, 4, 56, 56);
      ctx.fill();

      // Draw "FF" letters
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FF', 32, 34);
    }

    // Draw badge pill in top right corner
    const label = count > 99 ? '99+' : String(count);
    const isWide = count > 9;

    const badgeWidth = isWide ? (count > 99 ? 34 : 26) : 22;
    const badgeHeight = 22;
    const badgeX = 64 - badgeWidth - 1;
    const badgeY = 1;

    // Red badge background with white border
    ctx.fillStyle = '#dc2626'; // Vivid red
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 11);
    } else {
      ctx.arc(badgeX + badgeWidth / 2, badgeY + badgeHeight / 2, 11, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Badge text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isWide ? (count > 99 ? '11px' : '12px') : '13px'} sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 1);

    try {
      faviconLink.href = this.canvas.toDataURL('image/png');
    } catch (e) {
      // Canvas tainted or unsupported
    }
  }

  /**
   * Request push / system notification permissions gracefully on explicit user request
   */
  public async requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      return 'denied';
    }
  }
}

export const badgeService = new BadgeService();
