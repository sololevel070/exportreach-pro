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

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await request.json();
    const { subject, body, status, campaignId, lead: leadInfo } = payload;
    let { leadId } = payload;

    if (!subject || !body) {
      return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
    }

    let lead: { email: string } | null = null;
    // Context used to substitute {{placeholders}} in the subject/body.
    let leadCtx: Record<string, any> = leadInfo || {};

    if (leadId) {
      // Use an existing lead
      const { data: existingLead, error: leadError } = await insforge.database
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !existingLead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }
      lead = existingLead;
      leadCtx = existingLead;
    } else if (leadInfo?.email) {
      // Direct send (e.g. from Compose) — find or create a lead so history is tracked
      const { data: found } = await insforge.database
        .from('leads')
        .select('id, email')
        .eq('user_id', userId)
        .eq('email', leadInfo.email)
        .limit(1);

      if (found && found.length > 0) {
        leadId = found[0].id;
        lead = { email: found[0].email };
      } else {
        const { data: created, error: createError } = await insforge.database
          .from('leads')
          .insert({
            user_id: userId,
            company_name: leadInfo.companyName || 'Unknown',
            contact_name: leadInfo.contactName || leadInfo.email,
            email: leadInfo.email,
            country: leadInfo.country || null,
            website: leadInfo.website || null,
            product_interest: leadInfo.productInterest || null,
            source: 'compose',
            status: 'pending',
          })
          .select('id, email')
          .single();

        if (createError || !created) {
          return NextResponse.json({ error: 'Could not create lead for direct send' }, { status: 500 });
        }
        leadId = created.id;
        lead = { email: created.email };
      }
    } else {
      return NextResponse.json(
        { error: 'A lead ID or recipient email is required' },
        { status: 400 }
      );
    }

    if (!lead) {
      return NextResponse.json({ error: 'Could not resolve recipient' }, { status: 400 });
    }

    // Substitute placeholders so both the stored copy and the sent email show
    // real lead values with proper formatting.
    const renderedSubject = renderPlaceholders(subject, leadCtx);
    const renderedBody = renderPlaceholders(body, leadCtx);

    // Generate the tracking id up front so the open-tracking pixel and the stored
    // row share the same value.
    const trackingId = randomUUID();

    let sendResult = null;
    let errorMsg = null;

    if (status === 'sent') {
      // Fetch user settings for email configuration
      const { data: settings, error: settingsError } = await insforge.database
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('Error fetching settings:', settingsError);
      }

      // Build the HTML body with the open-tracking pixel and click tracking embedded.
      const baseUrl = resolveBaseUrl(request);
      const trackingUrl = getTrackingPixelUrl(baseUrl, trackingId);
      const html = createEmailHtml(renderedBody, trackingUrl, { trackingId, baseUrl });

      // Attempt to send the email
      sendResult = await sendEmail({
        to: lead.email,
        subject: renderedSubject,
        body: html,
        settings: settings ? {
          smtpHost: settings.smtp_host,
          smtpPort: settings.smtp_port,
          smtpUser: settings.smtp_user,
          smtpPass: decryptSecret(settings.smtp_pass),
          resendApiKey: decryptSecret(settings.resend_api_key),
        } : undefined,
      });

      if (!sendResult.success) {
        errorMsg = sendResult.error || 'Failed to send email';
      }
    }

    const emailStatus = errorMsg ? 'failed' : (status || 'pending');

    const { data, error } = await insforge.database
      .from('emails')
      .insert({
        lead_id: leadId,
        subject: renderedSubject,
        body: renderedBody,
        status: emailStatus,
        campaign_id: campaignId || null,
        tracking_id: trackingId,
        sent_at: (status === 'sent' && !errorMsg) ? new Date().toISOString() : null,
        // Removed 'error' column as it doesn't exist in the schema
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating email:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Automatically update lead status
    await insforge.database
      .from('leads')
      .update({ status: emailStatus })
      .eq('id', leadId);

    if (errorMsg) {
      return NextResponse.json({ ...data, error: errorMsg }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = insforge.database
      .from('emails')
      .select('*, leads!inner(company_name, contact_name), campaigns(name)')
      .eq('leads.user_id', userId);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching emails:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const emails = (data || []).map((email: any) => ({
      id: email.id,
      lead: email.leads ? `${email.leads.contact_name} - ${email.leads.company_name}` : 'Unknown',
      leadId: email.lead_id,
      subject: email.subject,
      body: email.body,
      status: email.status,
      campaign: email.campaigns ? email.campaigns.name : 'Direct',
      campaignId: email.campaign_id,
      sentAt: email.sent_at,
      openedAt: email.opened_at,
      clickedAt: email.clicked_at,
      repliedAt: email.replied_at,
      // Removed email.error reference
      createdAt: email.created_at,
    }));

    return NextResponse.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}