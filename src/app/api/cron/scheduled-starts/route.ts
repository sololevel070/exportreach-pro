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

// Current wall-clock stamp (YYYYMMDDHH as an integer) in a given IANA timezone.
// Falls back to UTC on bad/missing input. Used only to compare against a
// campaign's scheduled local moment, so DST is handled naturally (both sides
// are wall-clock in the same zone).
function stampInZone(tz?: string | null): number {
  const zone = tz || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    let hh = get('hour');
    if (hh === '24') hh = '00';
    return parseInt(`${get('year')}${get('month')}${get('day')}${hh}`, 10);
  } catch {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    return parseInt(`${y}${m}${day}${h}`, 10);
  }
}

// A campaign's scheduled local moment as a YYYYMMDDHH integer.
function scheduledStamp(dateStr: string, hour: number): number {
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return NaN;
  return parseInt(`${y}${m}${d}${String(hour).padStart(2, '0')}`, 10);
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

  // Campaigns with a scheduled start that hasn't fired yet.
  const { data: campaigns } = await insforge.database
    .from('campaigns')
    .select('*')
    .eq('schedule_enabled', true)
    .is('schedule_started_at', null);

  let totalStarted = 0;
  const perCampaign: any[] = [];

  for (const campaign of campaigns || []) {
    // Need a valid date; hour defaults to 9 if unset.
    if (!campaign.schedule_date) {
      perCampaign.push({ campaign: campaign.id, skipped: 'no date' });
      continue;
    }
    const hour = campaign.schedule_hour == null ? 9 : Number(campaign.schedule_hour);
    const due = scheduledStamp(campaign.schedule_date, hour);
    if (Number.isNaN(due)) {
      perCampaign.push({ campaign: campaign.id, skipped: 'bad date' });
      continue;
    }
    // Not yet time (compare wall-clock in the campaign's timezone).
    if (stampInZone(campaign.schedule_timezone) < due) {
      perCampaign.push({ campaign: campaign.id, skipped: 'not due' });
      continue;
    }

    // Claim it immediately so a slow send can't be double-fired by an overlapping run.
    await insforge.database
      .from('campaigns')
      .update({ schedule_started_at: new Date().toISOString() })
      .eq('id', campaign.id);

    // Resolve template (campaign's, else a default).
    const template = await resolveTemplate(campaign.user_id, campaign.template_id);
    if (!template) {
      perCampaign.push({ campaign: campaign.id, skipped: 'no template' });
      continue;
    }

    // Leads assigned to the campaign.
    const { data: campaignLeads } = await insforge.database
      .from('campaign_leads')
      .select('lead_id, leads(*)')
      .eq('campaign_id', campaign.id);
    const assignedLeads = (campaignLeads || []).map((cl: any) => cl.leads).filter(Boolean);
    if (assignedLeads.length === 0) {
      perCampaign.push({ campaign: campaign.id, skipped: 'no leads' });
      continue;
    }

    // Idempotency — skip leads already emailed in this campaign.
    const { data: existingEmails } = await insforge.database
      .from('emails')
      .select('lead_id')
      .eq('campaign_id', campaign.id);
    const alreadyEmailed = new Set((existingEmails || []).map((e: any) => e.lead_id));
    const pendingLeads = assignedLeads.filter((lead: any) => !alreadyEmailed.has(lead.id));
    if (pendingLeads.length === 0) {
      await insforge.database
        .from('campaigns')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', campaign.id);
      perCampaign.push({ campaign: campaign.id, started: 0 });
      continue;
    }

    await insforge.database
      .from('campaigns')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', campaign.id);

    // Sending settings for the owner (cached per user).
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
    const batch = pendingLeads.slice(0, limit);
    let sent = 0;

    for (const lead of batch) {
      const subject = renderPlaceholders(template.subject, lead);
      const body = renderPlaceholders(template.body, lead);
      const trackingId = randomUUID();
      const html = createEmailHtml(body, getTrackingPixelUrl(baseUrl, trackingId), { trackingId, baseUrl });

      const result = await sendEmail({ to: lead.email, subject, body: html, settings: sendSettings });

      await insforge.database.from('emails').insert({
        lead_id: lead.id,
        campaign_id: campaign.id,
        subject,
        body,
        status: result.success ? 'sent' : 'failed',
        tracking_id: trackingId,
        message_id: result.messageId || null,
        sent_at: result.success ? new Date().toISOString() : null,
      });

      await insforge.database
        .from('leads')
        .update({ status: result.success ? 'contacted' : 'pending' })
        .eq('id', lead.id);

      if (result.success) sent++;
    }

    // If everything assigned is now emailed, mark completed; else stay active.
    if (pendingLeads.length - batch.length <= 0) {
      await insforge.database
        .from('campaigns')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', campaign.id);
    }

    totalStarted++;
    perCampaign.push({ campaign: campaign.id, started: sent });
  }

  return { ok: true, totalStarted, perCampaign };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await run(request));
  } catch (error) {
    console.error('scheduled-starts cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
