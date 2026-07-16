export const dynamic = 'force-dynamic';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';
import {
  sendEmail,
  createEmailHtml,
  resolveBaseUrl,
  getTrackingPixelUrl,
} from '@/lib/email';
import { generateFollowupEmail } from '@/lib/ai-gateway';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { emailId, send } = await request.json();

    if (!emailId) {
      return NextResponse.json({ error: 'emailId is required' }, { status: 400 });
    }

    // 1. Load the original email + its lead
    const { data: original, error: emailError } = await insforge.database
      .from('emails')
      .select('*, leads(*)')
      .eq('id', emailId)
      .single();

    if (emailError || !original) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const lead = original.leads || {};

    // Ownership: the email's lead must belong to the current user.
    if (lead.user_id && lead.user_id !== userId) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // 2. Generate the follow-up content (graceful fallback if AI is unavailable)
    let followup: { subject: string; body: string };
    try {
      followup = await generateFollowupEmail({
        previousEmail: `Subject: ${original.subject}\n\n${original.body || ''}`,
        contactName: lead.contact_name || 'there',
        country: lead.country,
        productInterest: lead.product_interest,
        type: 'no_reply',
        userId,
      });
    } catch (aiError) {
      console.error('Follow-up AI generation failed, using fallback:', aiError);
      followup = {
        subject: `Following up - ${original.subject}`,
        body: `Hi ${lead.contact_name || 'there'},\n\nI wanted to gently follow up on my previous email. I understand you may be busy — would you have a few minutes this week for a quick chat?\n\nBest regards`,
      };
    }

    // 3. Determine the sequence number for this follow-up
    const { count } = await insforge.database
      .from('followups')
      .select('*', { count: 'exact', head: true })
      .eq('email_id', emailId);

    const sequence = (count || 0) + 1;

    // 4. Optionally send it
    let status = 'pending';
    let sentAt: string | null = null;
    // Shared tracking id so the follow-up's opens/clicks resolve to the same
    // emails row we insert below.
    const trackingId = randomUUID();

    if (send) {
      // Guard against a lead with no email address — we can't send to nobody.
      if (!lead.email) {
        return NextResponse.json(
          { error: 'Lead has no email address; cannot send follow-up' },
          { status: 400 }
        );
      }

      const { data: settings } = await insforge.database
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      const baseUrl = resolveBaseUrl(request);
      const html = createEmailHtml(
        followup.body,
        getTrackingPixelUrl(baseUrl, trackingId),
        { trackingId, baseUrl }
      );

      const result = await sendEmail({
        to: lead.email,
        subject: followup.subject,
        body: html,
        settings: settings
          ? {
              smtpHost: settings.smtp_host,
              smtpPort: settings.smtp_port,
              smtpUser: settings.smtp_user,
              smtpPass: decryptSecret(settings.smtp_pass),
              resendApiKey: decryptSecret(settings.resend_api_key),
            }
          : undefined,
      });
      status = result.success ? 'sent' : 'failed';
      sentAt = result.success ? new Date().toISOString() : null;

      // Insert the follow-up into the emails table so it shows up in the Emails
      // list and its opens/clicks are tracked like any other sent email.
      await insforge.database.from('emails').insert({
        lead_id: original.lead_id,
        campaign_id: original.campaign_id,
        subject: followup.subject,
        body: followup.body,
        status: result.success ? 'sent' : 'failed',
        sent_at: result.success ? sentAt : null,
        tracking_id: trackingId,
      });
    }

    // 5. Persist the follow-up record
    const { data: record, error } = await insforge.database
      .from('followups')
      .insert({
        email_id: emailId,
        sequence,
        subject: followup.subject,
        body: followup.body,
        status,
        sent_at: sentAt,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving follow-up:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: record.id,
      subject: followup.subject,
      body: followup.body,
      sequence,
      status,
    });
  } catch (error) {
    console.error('Error creating follow-up:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const emailId = new URL(request.url).searchParams.get('emailId');

    if (!emailId) {
      return NextResponse.json({ error: 'emailId is required' }, { status: 400 });
    }

    // Ownership: the email must belong to the current user.
    const { data: owner } = await insforge.database
      .from('emails')
      .select('id, leads!inner(user_id)')
      .eq('id', emailId)
      .eq('leads.user_id', userId)
      .maybeSingle();
    if (!owner) {
      return NextResponse.json([]);
    }

    const { data, error } = await insforge.database
      .from('followups')
      .select('*')
      .eq('email_id', emailId)
      .order('sequence', { ascending: true });

    if (error) {
      console.error('Error fetching follow-ups:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const followups = (data || []).map((f: any) => ({
      id: f.id,
      sequence: f.sequence,
      subject: f.subject,
      body: f.body,
      status: f.status,
      sentAt: f.sent_at,
      createdAt: f.created_at,
    }));

    return NextResponse.json(followups);
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
