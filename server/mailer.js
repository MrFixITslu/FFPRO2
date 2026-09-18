import nodemailer from 'nodemailer';

let transporter = null;
let attemptedInit = false;

function getTransporter() {
  if (attemptedInit) return transporter;
  attemptedInit = true;

  if (!process.env.SMTP_HOST) {
    console.warn('[mailer] SMTP_HOST is not set — invite emails will not be sent. The invite link will be returned to the inviter to share manually.');
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

/**
 * Sends a password-reset email. Never throws — the route always returns a
 * generic success response regardless of send outcome, so email failures
 * can't be used to probe which addresses have accounts.
 */
export async function sendPasswordResetEmail({ toEmail, resetLink }) {
  const t = getTransporter();
  const subject = 'Reset your Fire Finance Pro password';
  const text = `We received a request to reset your Fire Finance Pro password.\n\nReset it here (expires in 45 minutes): ${resetLink}\n\nIf you didn't request this, you can safely ignore this email — your password won't be changed.`;
  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 15px; color: #1e293b;">We received a request to reset your Fire Finance Pro password.</p>
      <a href="${resetLink}" style="display:inline-block; margin-top:16px; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; font-size:13px;">Reset Password</a>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">This link expires in 45 minutes. If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    </div>
  `;


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
    console.error('[mailer] Failed to send password reset email:', err.message);
    return { sent: false };
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function sendVerificationEmail({ toEmail, verificationLink }) {
  const t = getTransporter();
  const subject = 'Confirm your email address - Fire Finance Pro';
  const text = `Welcome to Fire Finance Pro!\n\nPlease confirm your email address to verify your account before accessing the site:\n\n${verificationLink}\n\nThis verification link expires in 24 hours.\n\nIf you did not create an account on Fire Finance Pro, you can safely ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; padding: 32px 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 6px 0; letter-spacing: -0.02em;">Confirm your email address</h1>
        <p style="color: #64748b; font-size: 13px; margin: 0; font-weight: 500;">FIRE FINANCE PRO ACCOUNT VERIFICATION</p>
      </div>
      <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #f1f5f9;">
        <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 12px 0;">
          Thank you for creating an account with <strong>Fire Finance Pro</strong>.
        </p>
        <p style="font-size: 13px; color: #475569; line-height: 1.5; margin: 0;">
          Please confirm your email address to verify that this account is legitimate and activate your access to the platform.
        </p>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${verificationLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">
          Verify Email &amp; Access Site
        </a>
      </div>
      <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
        <p style="margin: 0 0 8px 0;">This verification link will expire in 24 hours. If the button above doesn't work, copy and paste this URL into your browser:</p>
        <p style="margin: 0; word-break: break-all; color: #4f46e5;">${verificationLink}</p>
        <p style="margin: 16px 0 0 0; font-size: 11px; color: #94a3b8;">If you did not register for Fire Finance Pro, no further action is needed.</p>
      </div>
    </div>
  `;

  if (!t) {
    console.log(`[mailer] SMTP not configured. Generated verification link for ${toEmail}:`);
    console.log(`[mailer] Link: ${verificationLink}`);
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
    console.error('[mailer] Failed to send verification email:', err.message);
    return { sent: false };
  }
}
