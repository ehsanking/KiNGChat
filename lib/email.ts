import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

export type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

/**
 * Reads SMTP configuration from environment variables.
 * Returns null if SMTP is not configured.
 */
export function getEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = (process.env.SMTP_FROM?.trim()) || user;

  if (!host || !user || !pass || !from) return null;

  return {
    host,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
    user,
    pass,
    from,
  };
}

export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null;
}

function createTransport(config: EmailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Sends an email using the configured SMTP server.
 * Returns { ok: true } on success or { ok: false, error } on failure.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getEmailConfig();
  if (!config) {
    logger.warn('Email send attempted but SMTP is not configured.');
    return { ok: false, error: 'Email service is not configured.' };
  }

  try {
    const transport = createTransport(config);
    await transport.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    logger.info('Email sent.', { to: options.to, subject: options.subject });
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to send email.', { error: msg, to: options.to });
    return { ok: false, error: 'Failed to send email. Please try again later.' };
  }
}

/**
 * Sends a 6-digit email verification code to the user.
 */
export async function sendVerificationCodeEmail(
  to: string,
  code: string,
  appName = 'Elahe Messenger',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = `Your verification code for ${appName}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f11; margin: 0; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 40px 32px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #fafafa; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Email Verification</h1>
      <p style="color: #a1a1aa; font-size: 14px; margin: 0;">${appName}</p>
    </div>
    <p style="color: #d4d4d8; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      Use the following code to verify your email address. This code expires in <strong style="color: #fafafa;">10 minutes</strong>.
    </p>
    <div style="background: #09090b; border: 1px solid #3f3f46; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
      <span style="font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #f59e0b; font-variant-numeric: tabular-nums;">${code}</span>
    </div>
    <p style="color: #71717a; font-size: 13px; margin: 0; text-align: center;">
      If you did not request this, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `Your verification code for ${appName}: ${code}\n\nThis code expires in 10 minutes.\nIf you did not request this, ignore this email.`;

  return sendEmail({ to, subject, html, text });
}

/**
 * Sends a password reset code to the user.
 */
export async function sendPasswordResetEmail(
  to: string,
  code: string,
  appName = 'Elahe Messenger',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = `Password reset code for ${appName}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f11; margin: 0; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 40px 32px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #fafafa; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Password Reset</h1>
      <p style="color: #a1a1aa; font-size: 14px; margin: 0;">${appName}</p>
    </div>
    <p style="color: #d4d4d8; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      Use the following code to reset your password. This code expires in <strong style="color: #fafafa;">10 minutes</strong>.
    </p>
    <div style="background: #09090b; border: 1px solid #3f3f46; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
      <span style="font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #3b82f6; font-variant-numeric: tabular-nums;">${code}</span>
    </div>
    <p style="color: #71717a; font-size: 13px; margin: 0; text-align: center;">
      If you did not request a password reset, please ignore this email or contact support if you have concerns.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `Password reset code for ${appName}: ${code}\n\nThis code expires in 10 minutes.\nIf you did not request a password reset, ignore this email.`;

  return sendEmail({ to, subject, html, text });
}
