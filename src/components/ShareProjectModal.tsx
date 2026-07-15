import React, { useState, useEffect, useCallback } from 'react';
import { X, Mail, Trash2, Copy, Check, Loader2, Crown } from 'lucide-react';
import { projectsService } from '../services/projectsService';
import { ProjectMember, ProjectInvite, ProjectRole } from '../types';

interface Props {
  projectId: string;
  projectName: string;
  currentUserId?: string;
  currentUserRole: ProjectRole;
  onClose: () => void;
}

const ShareProjectModal: React.FC<Props> = ({ projectId, projectName, currentUserId, currentUserRole, onClose }) => {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('editor');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canManage = currentUserRole === 'owner' || currentUserRole === 'editor';
  const isOwner = currentUserRole === 'owner';

  const load = useCallback(async () => {
    try {
      const data = await projectsService.getMembers(projectId);
      setMembers(data.members);
      setInvites(data.invites);
    } catch (err: any) {
      setError(err.message || 'Failed to load collaborators.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    setLastInviteLink(null);
    try {
      const result = await projectsService.invite(projectId, email.trim(), role);
      setEmail('');
      if (result.addedDirectly) {
        await load();
      } else if (result.inviteLink) {
        if (!result.emailSent) setLastInviteLink(result.inviteLink);
        await load();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send invite.');
    } finally {
      setSending(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this person from the project?')) return;
    try {
      await projectsService.removeMember(projectId, userId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: ProjectRole) => {
    try {
      await projectsService.updateMemberRole(projectId, userId, newRole);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update role.');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await projectsService.revokeInvite(projectId, inviteId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invite.');
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl border border-slate-200 shadow-sm max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-950 tracking-tight truncate">Share "{projectName}"</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Collaborate with others</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {canManage && (
            <form onSubmit={handleInvite} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Invite by email</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@email.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as ProjectRole)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button
                  type="submit"
                  disabled={!email.trim() || sending}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
                </button>
              </div>
              {error && <p className="text-[11px] text-red-500">{error}</p>}
              {lastInviteLink && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
                  <p className="text-[11px] text-amber-700 flex-1 min-w-0">
                    No email server configured — share this link manually:
                  </p>
                  <button onClick={() => copyLink(lastInviteLink)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-white border border-amber-200 text-amber-600">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </form>
          )}

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Members ({members.length})</p>
            {loading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.userId} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-600 uppercase shrink-0">
                        {(m.displayName || m.username || m.email)[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {m.displayName || m.username || m.email} {m.userId === currentUserId && <span className="text-slate-400 font-normal">(you)</span>}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.role === 'owner' ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          <Crown className="w-3 h-3" /> Owner
                        </span>
                      ) : isOwner ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.userId, e.target.value as ProjectRole)}
                          className="text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{m.role}</span>
                      )}
                      {(isOwner && m.role !== 'owner') || m.userId === currentUserId && m.role !== 'owner' ? (
                        <button onClick={() => handleRemoveMember(m.userId)} title="Remove" className="w-7 h-7 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {invites.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pending invites ({invites.length})</p>
              <div className="space-y-2">
                {invites.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 bg-amber-50/50 border border-amber-100 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{inv.email}</p>
                      <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Awaiting response · {inv.role}</p>
                    </div>
                    {canManage && (
                      <button onClick={() => handleRevokeInvite(inv.id)} title="Revoke invite" className="w-7 h-7 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareProjectModal;
