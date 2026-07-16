import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export type EmailProvider = 'gmail' | 'smtp' | 'resend';

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  settings?: {
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpUser?: string | null;
    smtpPass?: string | null;
    resendApiKey?: string | null;
  };
}

export async function sendEmail(params: SendEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { to, subject, body, from, replyTo, attachments, settings } = params;

  // Try Resend first if API key is available
  if (settings?.resendApiKey) {
    try {
      const resend = new Resend(settings.resendApiKey);
      const result = await resend.emails.send({
        from: from || 'onboarding@resend.dev',
        to: [to],
        subject,
        html: body,
        replyTo: replyTo,
      });
      return { success: true, messageId: result.data?.id };
    } catch (error) {
      console.error('Resend error:', error);
    }
  }

  // Try SMTP if configured
  if (settings?.smtpHost && settings?.smtpUser && settings?.smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort || 587,
        secure: settings.smtpPort === 465,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPass,
        },
      });

      const result = await transporter.sendMail({
        from: from || settings.smtpUser,
        to,
        subject,
        html: body,
        replyTo,
        attachments,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('SMTP error:', error);
      return { success: false, error: String(error) };
    }
  }

  // Fallback to Gmail SMTP (using nodemailer with Gmail)
  if (settings?.smtpUser?.includes('gmail')) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: settings.smtpUser ?? undefined,
          pass: settings.smtpPass ?? undefined,
        },
      });

      const result = await transporter.sendMail({
        from: settings.smtpUser,
        to,
        subject,
        html: body,
        replyTo,
        attachments,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Gmail error:', error);
      return { success: false, error: String(error) };
    }
  }

  return { success: false, error: 'No email provider configured' };
}

/**
 * Substitute {{placeholder}} tokens in a piece of text with the matching lead
 * fields. Accepts both snake_case (DB rows) and camelCase (compose form) keys.
 */
export function renderPlaceholders(text: string, lead: Record<string, any> = {}): string {
  if (!text) return '';
  const get = (snake: string, camel: string, fallback = '') =>
    lead[snake] ?? lead[camel] ?? fallback;
  return text
    .replace(/\{\{\s*company_name\s*\}\}/gi, get('company_name', 'companyName'))
    .replace(/\{\{\s*contact_name\s*\}\}/gi, get('contact_name', 'contactName', 'there'))
    .replace(/\{\{\s*country\s*\}\}/gi, get('country', 'country'))
    .replace(/\{\{\s*product_interest\s*\}\}/gi, get('product_interest', 'productInterest'))
    .replace(/\{\{\s*website\s*\}\}/gi, get('website', 'website'));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Turn a plain-text email body into clean, well-spaced HTML. Blank lines become
 * paragraph breaks and single newlines become <br>. If the body already looks
 * like HTML it is returned untouched so we never double-encode rich content.
 */
export function formatEmailBody(body: string): string {
  if (!body) return '';
  const looksLikeHtml = /<(p|div|br|table|ul|ol|h[1-6]|blockquote|a)[\s>/]/i.test(body);
  if (looksLikeHtml) return body;

  const normalized = body.replace(/\r\n/g, '\n').trim();
  return normalized
    .split(/\n{2,}/)
    .map((para) => {
      const withBreaks = escapeHtml(para).replace(/\n/g, '<br />');
      return `<p style="margin:0 0 16px 0;">${withBreaks}</p>`;
    })
    .join('\n');
}

/**
 * Rewrite every http/https href in the html so clicks are routed through the
 * click-tracking endpoint before redirecting to the original destination.
 * mailto:, anchors (#...), the tracking pixel, and already-wrapped /api/click
 * links are left untouched.
 */
export function rewriteLinksForClickTracking(
  html: string,
  trackingId: string,
  baseUrl: string
): string {
  if (!html) return html;
  const base = baseUrl.replace(/\/+$/, '');
  return html.replace(
    /href=(["'])(https?:\/\/[^"']+)\1/gi,
    (match, quote, url) => {
      // Skip links that already point at our click endpoint.
      if (/\/api\/click\?/i.test(url)) return match;
      const wrapped = `${base}/api/click?e=${trackingId}&u=${encodeURIComponent(url)}`;
      return `href=${quote}${wrapped}${quote}`;
    }
  );
}

/**
 * Build the full HTML document for an outgoing email. The body is formatted for
 * proper spacing and an invisible tracking pixel is appended when a pixel URL is
 * given. When clickOpts is provided, the formatted body has its links rewritten
 * for click tracking before the pixel is inserted.
 */
export function createEmailHtml(
  body: string,
  pixelUrl?: string,
  clickOpts?: { trackingId: string; baseUrl: string }
): string {
  let formatted = formatEmailBody(body);
  if (clickOpts) {
    formatted = rewriteLinksForClickTracking(formatted, clickOpts.trackingId, clickOpts.baseUrl);
  }
  const pixel = pixelUrl
    ? `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none;width:1px;height:1px;" />`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${formatted}
  ${pixel}
</body>
</html>`.trim();
}

/**
 * Resolve the public base URL used to build tracking links. Prefers an explicit
 * NEXT_PUBLIC_APP_URL, then Vercel's auto-injected host, then the request origin.
 * This is what makes open tracking work once the app is deployed publicly.
 */
export function resolveBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3001';
  }
}

/** Build the tracking-pixel URL for a given email tracking id. */
export function getTrackingPixelUrl(baseUrl: string, trackingId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/tracking/${trackingId}`;
}

export function wrapClickTracking(
  url: string,
  trackingBaseUrl: string,
  emailId: string
): string {
  return `${trackingBaseUrl}/click?e=${emailId}&u=${encodeURIComponent(url)}`;
}