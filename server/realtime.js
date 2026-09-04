import { EventEmitter } from 'events';
import { projectsDb } from './projectsDb.js';

class RealtimeHub extends EventEmitter {
  constructor() {
    super();
    // Map of userId -> Set of client connection objects { res, req, userId, projectIds: Set<string> }
    this.clients = new Map();
    this.heartbeatInterval = null;
  }

  startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((clientSet) => {
        clientSet.forEach((client) => {
          try {
            client.res.write(':keepalive\n\n');
          } catch (err) {
            // Socket closed or failed, will be cleaned up on close event
          }
        });
      });
    }, 15000);
  }

  addClient(userId, req, res) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    const client = {
      userId,
      req,
      res,
      projectIds: new Set(),
      connectedAt: new Date().toISOString()
    };
    this.clients.get(userId).add(client);
    this.startHeartbeat();

    // Send initial connected handshake
    this.sendToClient(client, 'connected', {
      status: 'ok',
      userId,
      serverTime: new Date().toISOString()
    });

    req.on('close', () => {
      this.removeClient(userId, client);
    });

    return client;
  }

  removeClient(userId, client) {
    const clientSet = this.clients.get(userId);
    if (clientSet) {
      clientSet.delete(client);
      if (clientSet.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  sendToClient(client, event, data) {
    try {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.warn('[realtime] Failed to send to client:', err?.message || err);
    }
  }

  watchProject(userId, projectId) {
    const clientSet = this.clients.get(userId);
    if (clientSet) {
      clientSet.forEach((client) => {
        client.projectIds.add(projectId);
      });
    }
  }

  unwatchProject(userId, projectId) {
    const clientSet = this.clients.get(userId);
    if (clientSet) {
      clientSet.forEach((client) => {
        client.projectIds.delete(projectId);
      });
    }
  }

  /**
   * Broadcast a user's personal data change across their active devices / tabs
   */
  broadcastUserDataUpdate(userId, payload) {
    const clientSet = this.clients.get(userId);
    if (!clientSet || clientSet.size === 0) return;
    const message = {
      userId,
      version: payload.version,
      updatedAt: payload.updatedAt || new Date().toISOString(),
      updatedBy: payload.updatedBy || userId,
      type: 'user_data'
    };
    clientSet.forEach((client) => {
      this.sendToClient(client, 'user_data_updated', message);
    });
  }

  /**
   * Broadcast shared project changes in real time to all project members
   */
  async broadcastProjectUpdate(projectId, payload) {
    try {
      // Find all members who have access to this project
      const members = await projectsDb.listMembers(projectId);
      const memberUserIds = new Set(members.map(m => m.userId));

      const message = {
        projectId,
        project: payload.project,
        version: payload.version || payload.project?.version,
        updatedAt: payload.updatedAt || new Date().toISOString(),
        updatedBy: payload.updatedBy,
        type: 'project_update'
      };

      // Broadcast strictly to connected clients that are verified members of this project
      this.clients.forEach((clientSet, userId) => {
        if (memberUserIds.has(userId)) {
          clientSet.forEach((client) => {
            this.sendToClient(client, 'project_updated', message);
          });
        }
      });
    } catch (err) {
      console.error('[realtime] broadcastProjectUpdate error:', err);
    }
  }

  /**
   * Broadcast real-time chat messages to all project collaborators
   */
  async broadcastProjectMessage(projectId, message) {
    try {
      const members = await projectsDb.listMembers(projectId);
      const memberUserIds = new Set(members.map(m => m.userId));

      const payload = {
        projectId,
        message,
        timestamp: new Date().toISOString()
      };

      this.clients.forEach((clientSet, userId) => {
        if (memberUserIds.has(userId)) {
          clientSet.forEach((client) => {
            this.sendToClient(client, 'chat_message', payload);
          });
        }
      });
    } catch (err) {
      console.error('[realtime] broadcastProjectMessage error:', err);
    }
  }

  /**
   * Broadcast membership changes (e.g. member added, removed, role updated)
   */
  async broadcastProjectMembership(projectId, payload) {
    try {
      const members = await projectsDb.listMembers(projectId);
      const memberUserIds = new Set(members.map(m => m.userId));
      if (payload.affectedUserId) {
        memberUserIds.add(payload.affectedUserId);
      }

      this.clients.forEach((clientSet, userId) => {
        if (memberUserIds.has(userId)) {
          clientSet.forEach((client) => {
            this.sendToClient(client, 'project_membership_updated', {
              projectId,
              ...payload,
              timestamp: new Date().toISOString()
            });
          });
        }
      });
    } catch (err) {
      console.error('[realtime] broadcastProjectMembership error:', err);
    }
  }
}

export const realtimeHub = new RealtimeHub();
