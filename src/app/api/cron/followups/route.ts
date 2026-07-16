export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { decryptSecret } from '@/lib/crypto';
import {
  sendEmail,
  createEmailHtml,
  renderPlaceholders,
  resolveBaseUrl,
  getTrackingPixelUrl,
} from '@/lib/email';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    req.headers.get('x-cron-secret') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return header === secret;
}

// Current hour (0-23) in a given IANA timezone; falls back to UTC on bad input.
function currentHourInZone(tz?: string | null): number {
  if (tz) {
    try {
      const s = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      }).format(new Date());
      let h = parseInt(s, 10);
      if (Number.isNaN(h)) return new Date().getUTCHours();
      if (h === 24) h = 0;
      return h;
    } catch {
      /* invalid timezone → fall through */
    }
  }
  return new Date().getUTCHours();
}

// Should this campaign's follow-ups be sent in the current hourly run?
// - If a send hour is configured, only at that hour in the campaign's timezone.
// - If no send hour is configured, preserve the old daily cadence at 09:00 UTC.
function isCampaignSendHour(campaign: any): boolean {
  const target = campaign.followup_send_hour;
  if (target === null || target === undefined) {
    return new Date().getUTCHours() === 9;
  }
  return currentHourInZone(campaign.followup_timezone) === Number(target);
}

async function resolveTemplate(userId: string, templateId: string | null): Promise<any> {
  if (templateId) {
    const { data } = await insforge.database.from('templates').select('*').eq('id', templateId).single();
    if (data) return data;
  }
  const { data: defaults } = await insforge.database
    .from('templates')
    .select('*')
    .or(`user_id.eq.${userId},is_default.eq.true`)
    .order('is_default', { ascending: false });
  return (defaults || [])[0] || null;
}

async function run(request: NextRequest) {
  const baseUrl = resolveBaseUrl(request);
  const settingsCache: Record<string, any> = {};

  // Campaigns with auto follow-up enabled.
  const { data: campaigns } = await insforge.database
    .from('campaigns')
    .select('*')
    .eq('followup_enabled', true);

  let totalSent = 0;
  const perCampaign: any[] = [];

  for (const campaign of campaigns || []) {
    // Only send during this campaign's configured local send hour.
    if (!isCampaignSendHour(campaign)) {
      perCampaign.push({ campaign: campaign.id, skipped: 'not send hour' });
      continue;
    }

    const days = campaign.followup_after_days || 3;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const template = await resolveTemplate(campaign.user_id, campaign.template_id);
    if (!template) {
      perCampaign.push({ campaign: campaign.id, skipped: 'no template' });
      continue;
    }

    // All sent emails in this campaign + the lead.
    const { data: emails } = await insforge.database
      .from('emails')
      .select('id, lead_id, sent_at, replied_at, leads(*)')
      .eq('campaign_id', campaign.id)
      .not('sent_at', 'is', null);

    if (!emails || emails.length === 0) continue;

    // Group by lead → earliest (initial) email; track whether the lead replied.
    const initialByLead: Record<string, any> = {};
    const repliedLeads = new Set<string>();
    for (const em of emails) {
      if (em.replied_at) repliedLeads.add(em.lead_id);
      const cur = initialByLead[em.lead_id];
      if (!cur || new Date(em.sent_at) < new Date(cur.sent_at)) initialByLead[em.lead_id] = em;
    }

    const initials = Object.values(initialByLead);
    const initialIds = initials.map((e: any) => e.id);

    // Which initial emails already have a follow-up recorded.
    const { data: existingFollowups } = await insforge.database
      .from('followups')
      .select('email_id')
      .in('email_id', initialIds);
    const followedUp = new Set((existingFollowups || []).map((f: any) => f.email_id));

    // Eligible: due, lead not replied, not already followed up, lead has an email.
    const eligible = initials.filter((em: any) => {
      if (repliedLeads.has(em.lead_id)) return false;
      if (followedUp.has(em.id)) return false;
      if (!em.sent_at || em.sent_at > cutoff) return false;
      if (!em.leads?.email) return false;
      return true;
    });

    if (eligible.length === 0) {
      perCampaign.push({ campaign: campaign.id, sent: 0 });
      continue;
    }

    // Sending settings for this campaign's owner (cached per user).
    if (!(campaign.user_id in settingsCache)) {
      const { data: st } = await insforge.database
        .from('user_settings')
        .select('*')
        .eq('user_id', campaign.user_id)
        .single();
      settingsCache[campaign.user_id] = st || null;
    }
    const st = settingsCache[campaign.user_id];
    const sendSettings = st
      ? {
          smtpHost: st.smtp_host,
          smtpPort: st.smtp_port,
          smtpUser: st.smtp_user,
          smtpPass: decryptSecret(st.smtp_pass),
          resendApiKey: decryptSecret(st.resend_api_key),
        }
      : undefined;

    const limit = campaign.daily_limit || 50;
    let sent = 0;

    for (const initial of eligible.slice(0, limit)) {
      const leadRel: any = (initial as any).leads;
      const lead: any = Array.isArray(leadRel) ? leadRel[0] : leadRel;
      if (!lead?.email) continue;
      const subject = `Following up: ${renderPlaceholders(template.subject, lead)}`;
      const body = renderPlaceholders(template.body, lead);
      const trackingId = randomUUID();
      const html = createEmailHtml(body, getTrackingPixelUrl(baseUrl, trackingId), { trackingId, baseUrl });

      const result = await sendEmail({ to: lead.email, subject, body: html, settings: sendSettings });
      const now = new Date().toISOString();

      // New email row for tracking + visibility in the Emails list.
      await insforge.database.from('emails').insert({
        lead_id: lead.id,
        campaign_id: campaign.id,
        subject,
        body,
        status: result.success ? 'sent' : 'failed',
        tracking_id: trackingId,
        message_id: result.messageId || null,
        sent_at: result.success ? now : null,
      });

      // Follow-up record keyed to the INITIAL email (prevents repeat follow-ups).
      await insforge.database.from('followups').insert({
        email_id: initial.id,
        sequence: 1,
        subject,
        body,
        status: result.success ? 'sent' : 'failed',
        sent_at: result.success ? now : null,
      });

      if (result.success) sent++;
    }

    totalSent += sent;
    perCampaign.push({ campaign: campaign.id, sent });
  }

  return { ok: true, totalSent, perCampaign };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await run(request));
  } catch (error) {
    console.error('followups cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
