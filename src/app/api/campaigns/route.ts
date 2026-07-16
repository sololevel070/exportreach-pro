export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await insforge.database
      .from('campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const campaigns = data || [];
    const campaignIds = campaigns.map((c: any) => c.id);

    // Lead counts per campaign (one query, grouped in JS).
    const leadCounts: Record<string, number> = {};
    if (campaignIds.length > 0) {
      const { data: links } = await insforge.database
        .from('campaign_leads')
        .select('campaign_id')
        .in('campaign_id', campaignIds);

      for (const link of links || []) {
        leadCounts[link.campaign_id] = (leadCounts[link.campaign_id] || 0) + 1;
      }
    }

    // Real email aggregates per campaign (one query, grouped in JS).
    // repliedLeadSets tracks DISTINCT lead_ids with replied_at per campaign.
    const stats: Record<
      string,
      { sent: number; opened: number; clicked: number; replied: number }
    > = {};
    const repliedLeadSets: Record<string, Set<string>> = {};
    if (campaignIds.length > 0) {
      const { data: emails } = await insforge.database
        .from('emails')
        .select('campaign_id, lead_id, status, sent_at, opened_at, clicked_at, replied_at')
        .in('campaign_id', campaignIds);

      const sentStatuses = new Set(['sent', 'opened', 'clicked', 'replied']);
      for (const email of emails || []) {
        const cid = email.campaign_id;
        if (!cid) continue;
        const bucket =
          stats[cid] || (stats[cid] = { sent: 0, opened: 0, clicked: 0, replied: 0 });
        if (email.sent_at || sentStatuses.has(email.status)) bucket.sent++;
        if (email.opened_at) bucket.opened++;
        if (email.clicked_at) bucket.clicked++;
        if (email.replied_at) {
          bucket.replied++;
          if (email.lead_id) {
            (repliedLeadSets[cid] || (repliedLeadSets[cid] = new Set<string>())).add(
              email.lead_id
            );
          }
        }
      }
    }

    const campaignsWithCounts = campaigns.map((campaign: any) => {
      const s = stats[campaign.id] || { sent: 0, opened: 0, clicked: 0, replied: 0 };
      return {
        id: campaign.id,
        userId: campaign.user_id,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        dailyLimit: campaign.daily_limit,
        templateId: campaign.template_id,
        followupEnabled: campaign.followup_enabled,
        followupAfterDays: campaign.followup_after_days,
        followupSendHour: campaign.followup_send_hour,
        followupTimezone: campaign.followup_timezone,
        followupDays: campaign.followup_days,
        scheduleEnabled: campaign.schedule_enabled ?? false,
        scheduleDate: campaign.schedule_date,
        scheduleHour: campaign.schedule_hour,
        scheduleTimezone: campaign.schedule_timezone,
        scheduleStartedAt: campaign.schedule_started_at,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
        leads: leadCounts[campaign.id] || 0,
        sent: s.sent,
        opened: s.opened,
        clicked: s.clicked,
        replied: s.replied,
        repliedLeads: repliedLeadSets[campaign.id]?.size || 0,
      };
    });

    return NextResponse.json(campaignsWithCounts);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const data = await request.json();

    const insertRow: Record<string, any> = {
      user_id: userId,
      name: data.name,
      description: data.description || null,
      status: 'draft',
      daily_limit: data.dailyLimit || 50,
      followup_enabled: data.followupEnabled ?? true,
      followup_days: data.followupDays || [2, 5, 10],
    };
    if (data.templateId !== undefined) insertRow.template_id = data.templateId || null;
    if (data.followupAfterDays !== undefined) {
      const parsed = parseInt(data.followupAfterDays, 10);
      if (!Number.isNaN(parsed)) insertRow.followup_after_days = parsed;
    }

    // Scheduled start (optional): only meaningful when enabled.
    insertRow.schedule_enabled = data.scheduleEnabled ?? false;
    if (data.scheduleDate !== undefined) insertRow.schedule_date = data.scheduleDate || null;
    if (data.scheduleHour !== undefined) {
      const h = parseInt(data.scheduleHour, 10);
      insertRow.schedule_hour = Number.isNaN(h) || h < 0 || h > 23 ? null : h;
    }
    if (data.scheduleTimezone !== undefined) {
      insertRow.schedule_timezone = data.scheduleTimezone || null;
    }

    const { data: campaign, error } = await insforge.database
      .from('campaigns')
      .insert([insertRow])
      .select()
      .single();

    if (error) {
      console.error('Error creating campaign:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: campaign.id,
      userId: campaign.user_id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      dailyLimit: campaign.daily_limit,
      templateId: campaign.template_id,
      followupEnabled: campaign.followup_enabled,
      followupAfterDays: campaign.followup_after_days,
      followupDays: campaign.followup_days,
      scheduleEnabled: campaign.schedule_enabled ?? false,
      scheduleDate: campaign.schedule_date,
      scheduleHour: campaign.schedule_hour,
      scheduleTimezone: campaign.schedule_timezone,
      scheduleStartedAt: campaign.schedule_started_at,
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}