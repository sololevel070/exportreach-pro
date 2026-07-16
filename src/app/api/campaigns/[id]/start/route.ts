export const dynamic = 'force-dynamic';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';
import {
  sendEmail,
  createEmailHtml,
  renderPlaceholders,
  resolveBaseUrl,
  getTrackingPixelUrl,
} from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    // 1. Verify the campaign belongs to the user
    const { data: campaign, error: campaignError } = await insforge.database
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // 2. Pick the campaign's chosen template if set, else fall back to a default.
    let template: any = null;
    if (campaign.template_id) {
      const { data: t } = await insforge.database
        .from('templates')
        .select('*')
        .eq('id', campaign.template_id)
        .single();
      template = t || null;
    }
    if (!template) {
      const { data: templates } = await insforge.database
        .from('templates')
        .select('*')
        .or(`user_id.eq.${userId},is_default.eq.true`)
        .order('is_default', { ascending: false });
      template = (templates || [])[0];
    }

    // 3. Load the leads assigned to this campaign
    const { data: campaignLeads } = await insforge.database
      .from('campaign_leads')
      .select('lead_id, leads(*)')
      .eq('campaign_id', id);

    const assignedLeads = (campaignLeads || [])
      .map((cl: any) => cl.leads)
      .filter(Boolean);

    // Do NOT activate the campaign when there is nothing to send.
    if (assignedLeads.length === 0) {
      return NextResponse.json(
        { error: 'No leads are assigned to this campaign. Add leads first.' },
        { status: 400 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { error: 'No template is available to send. Create a template first.' },
        { status: 400 }
      );
    }

    // 4. Idempotency — exclude leads that have already been emailed in this campaign.
    const { data: existingEmails } = await insforge.database
      .from('emails')
      .select('lead_id')
      .eq('campaign_id', id);

    const alreadyEmailed = new Set((existingEmails || []).map((e: any) => e.lead_id));
    const pendingLeads = assignedLeads.filter((lead: any) => !alreadyEmailed.has(lead.id));

    // Everything assigned has already been emailed — mark completed, nothing to do.
    if (pendingLeads.length === 0) {
      await insforge.database
        .from('campaigns')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', id);
      return NextResponse.json({
        message: 'All assigned leads have already been emailed.',
        sent: 0,
        failed: 0,
        total: 0,
      });
    }

    // There is work to do — now it is safe to activate.
    await insforge.database
      .from('campaigns')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id);

    // 5. Fetch sending settings
    const { data: settings } = await insforge.database
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    const sendSettings = settings
      ? {
          smtpHost: settings.smtp_host,
          smtpPort: settings.smtp_port,
          smtpUser: settings.smtp_user,
          smtpPass: decryptSecret(settings.smtp_pass),
          resendApiKey: decryptSecret(settings.resend_api_key),
        }
      : undefined;

    // 6. Send up to the daily limit (only to leads not yet emailed)
    const limit = campaign.daily_limit || 50;
    const batch = pendingLeads.slice(0, limit);
    const baseUrl = resolveBaseUrl(request);
    let sent = 0;
    let failed = 0;

    for (const lead of batch) {
      const subject = renderPlaceholders(template.subject, lead);
      const body = renderPlaceholders(template.body, lead);

      // Unique tracking id per email so opens/clicks are attributed individually.
      const trackingId = randomUUID();
      const html = createEmailHtml(body, getTrackingPixelUrl(baseUrl, trackingId), {
        trackingId,
        baseUrl,
      });

      const result = await sendEmail({
        to: lead.email,
        subject,
        body: html,
        settings: sendSettings,
      });

      const status = result.success ? 'sent' : 'failed';

      const { error: insertError } = await insforge.database.from('emails').insert({
        lead_id: lead.id,
        campaign_id: id,
        subject,
        body,
        status,
        tracking_id: trackingId,
        message_id: result.messageId || null,
        sent_at: result.success ? new Date().toISOString() : null,
      });

      // Count a lead as failed if the send failed OR we couldn't record it.
      if (result.success && !insertError) sent++;
      else failed++;

      if (insertError) {
        console.error('Error inserting email row:', insertError);
      }

      await insforge.database
        .from('leads')
        .update({ status: result.success ? 'contacted' : 'pending' })
        .eq('id', lead.id);
    }

    // 7. If every assigned lead has now been emailed, mark completed; else stay active.
    const remaining = pendingLeads.length - batch.length;
    if (remaining <= 0) {
      await insforge.database
        .from('campaigns')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    return NextResponse.json({
      message: `Sent ${sent} email(s)${failed ? `, ${failed} failed` : ''}.`,
      sent,
      failed,
      total: batch.length,
    });
  } catch (error) {
    console.error('Error starting campaign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
