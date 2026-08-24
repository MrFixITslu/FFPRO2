export interface GatewayConnection {
  workspace_number: string;
  enabled: boolean;
  updated_at: string;
}

export interface GatewayLastEvent {
  external_id: string;
  amount: string;
  currency: string;
  received_at: string;
}

export interface GatewayConnectionStatus {
  connection: GatewayConnection | null;
  lastEvent: GatewayLastEvent | null;
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Request failed (HTTP ${res.status}).`);
  }
  return res.json();
}

export const gatewayService = {
  async getConnection(provider: string): Promise<GatewayConnectionStatus> {
    const res = await fetch(`/api/gateway/connections/${encodeURIComponent(provider)}`, {
      credentials: 'include',
    });
    return handle(res);
  },

  async saveConnection(provider: string, workspaceNumber: string, enabled: boolean): Promise<{ ok: true }> {
    const res = await fetch(`/api/gateway/connections/${encodeURIComponent(provider)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ workspaceNumber, enabled }),
    });
    return handle(res);
  },

  async deleteConnection(provider: string): Promise<{ ok: true }> {
    const res = await fetch(`/api/gateway/connections/${encodeURIComponent(provider)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handle(res);
  },
};
