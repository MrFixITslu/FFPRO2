import nodemailer from 'nodemailer';

let transporter = null;
let attemptedInit = false;

function getTransporter() {
  if (attemptedInit) return transporter;
  attemptedInit = true;

  if (!process.env.SMTP_HOST) {
    console.warn('[mailer] SMTP_HOST is not set — invite emails will not be sent. The invite link will still be logged and returned to the inviter to share manually.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });

  return transporter;
}

/**
 * Sends a project-invite email. Never throws — a failed/unconfigured send
 * just means the inviter falls back to copying the link, so a missing SMTP
 * config never blocks the invite itself from being created.
 */
export async function sendProjectInviteEmail({ toEmail, projectName, inviterName, role, inviteLink }) {
  const t = getTransporter();
  const subject = `${inviterName} invited you to collaborate on "${projectName}"`;
  const text = `${inviterName} has invited you to join "${projectName}" as a${role === 'editor' ? 'n' : ''} ${role} on Fire Finance Pro.\n\nAccept the invite: ${inviteLink}\n\nIf you weren't expecting this, you can safely ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 15px; color: #1e293b;"><strong>${escapeHtml(inviterName)}</strong> invited you to collaborate on <strong>"${escapeHtml(projectName)}"</strong> as a${role === 'editor' ? 'n' : ''} <strong>${escapeHtml(role)}</strong>.</p>
      <a href="${inviteLink}" style="display:inline-block; margin-top:16px; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; font-size:13px;">Accept Invite</a>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">If you weren't expecting this, you can safely ignore this email.</p>
    </div>
  `;

  console.log(`[mailer] Invite link for ${toEmail}: ${inviteLink}`);

  if (!t) {
    return { sent: false };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@fire-finance.local',
      to: toEmail,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Failed to send invite email:', err.message);
    return { sent: false };
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
