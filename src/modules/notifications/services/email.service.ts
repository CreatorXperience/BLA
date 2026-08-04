import nodemailer, { Transporter } from "nodemailer";
import { env, isTest } from "@/config";
import { logger } from "@/shared/logger";

declare global {
  // eslint-disable-next-line no-var
  var __transporter: Transporter | undefined;
}

function createTransport(): Transporter {
  if (isTest || !env.SMTP_HOST) {
    // Test transport captures messages instead of sending.
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
}

export const emailTransport: Transporter = global.__transporter ?? createTransport();

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}

export async function sendEmail(input: SendMailInput): Promise<{ messageId: string } | null> {
  try {
    const info = await emailTransport.sendMail({
      from: input.from ?? env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      attachments: input.attachments,
    });
    logger.info({ to: input.to, subject: input.subject, messageId: info.messageId }, "email sent");
    return { messageId: info.messageId };
  } catch (error) {
    logger.error({ error, to: input.to, subject: input.subject }, "email send failed");
    return null;
  }
}

/** Minimal HTML shell shared by all transactional emails. */
export function renderEmailShell(title: string, bodyHtml: string): string {
  const appUrl = env.APP_URL;
  const appName = env.APP_NAME;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:28px 40px;background-color:#111111;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:4px;">
              ${appName}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;color:#27272a;font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#fafafa;color:#71717a;font-size:12px;line-height:1.5;">
              <p style="margin:0;">You are receiving this because you use ${appName}. If this wasn't you, ignore this email.</p>
              <p style="margin:8px 0 0 0;"><a href="${appUrl}" style="color:#18181b;">${appUrl}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
