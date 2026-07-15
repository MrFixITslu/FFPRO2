import { ProjectMember, ProjectInvite, ProjectChatMessage, ProjectRole } from '../types';

const BASE = '/api/projects';
const INVITES_BASE = '/api/invites';

export interface ServerProject {
  id: string;
  ownerId: string;
  name: string;
  projectType: 'event' | 'trip' | 'startup';
  data: any;
  version: number;
  role: ProjectRole;
  updatedAt: string;
}

export class ProjectSyncConflictError extends Error {
  version: number;
  constructor(version: number) {
    super('This shared plan was updated by someone else since you last loaded it.');
    this.name = 'ProjectSyncConflictError';
    this.version = version;
  }
}

async function handle(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 409) {
    throw new ProjectSyncConflictError(body.version ?? 0);
  }
  if (!res.ok) {
    throw new Error(body.error || 'Request failed.');
  }
  return body;
}

export const projectsService = {
  /** All shared plans the current user is a member of (any role). */
  async list(): Promise<ServerProject[]> {
    const res = await fetch(BASE, { credentials: 'include' });
    const body = await handle(res);
    return body.projects;
  },

  /** Promotes a local plan to a shared, multi-user project. Returns the new server id. */
  async create(name: string, projectType: 'event' | 'trip' | 'startup', data: any): Promise<ServerProject> {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, projectType, data }),
    });
    const body = await handle(res);
    return body.project;
  },

  async save(id: string, data: any, expectedVersion: number): Promise<{ version: number; updatedAt: string }> {
    const res = await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data, expectedVersion }),
    });
    return handle(res);
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
    await handle(res);
  },

  async getMembers(id: string): Promise<{ members: ProjectMember[]; invites: ProjectInvite[] }> {
    const res = await fetch(`${BASE}/${id}/members`, { credentials: 'include' });
    return handle(res);
  },

  async removeMember(id: string, userId: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}/members/${userId}`, { method: 'DELETE', credentials: 'include' });
    await handle(res);
  },

  async updateMemberRole(id: string, userId: string, role: ProjectRole): Promise<void> {
    const res = await fetch(`${BASE}/${id}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    await handle(res);
  },

  async invite(id: string, email: string, role: ProjectRole): Promise<{ inviteLink?: string; emailSent?: boolean; addedDirectly?: boolean }> {
    const res = await fetch(`${BASE}/${id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, role }),
    });
    return handle(res);
  },

  async revokeInvite(id: string, inviteId: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}/invites/${inviteId}`, { method: 'DELETE', credentials: 'include' });
    await handle(res);
  },

  async getMessages(id: string, after?: string): Promise<ProjectChatMessage[]> {
    const url = after ? `${BASE}/${id}/messages?after=${encodeURIComponent(after)}` : `${BASE}/${id}/messages`;
    const res = await fetch(url, { credentials: 'include' });
    const body = await handle(res);
    return body.messages;
  },

  async sendMessage(id: string, body: string): Promise<ProjectChatMessage> {
    const res = await fetch(`${BASE}/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ body }),
    });
    const parsed = await handle(res);
    return parsed.message;
  },
};

export interface InvitePreview {
  projectName: string;
  projectType: string;
  email: string;
  role: ProjectRole;
}

export const invitesService = {
  async preview(token: string): Promise<InvitePreview> {
    const res = await fetch(`${INVITES_BASE}/${token}`, { credentials: 'include' });
    return handle(res);
  },

  async accept(token: string): Promise<{ projectId: string; projectName: string }> {
    const res = await fetch(`${INVITES_BASE}/${token}/accept`, {
      method: 'POST',
      credentials: 'include',
    });
    return handle(res);
  },
};
