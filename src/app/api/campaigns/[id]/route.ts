export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

function serialize(campaign: any) {
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
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const { data: campaign, error } = await insforge.database
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Aggregate stats
    const { count: leadsCount } = await insforge.database
      .from('campaign_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id);

    const { data: emails } = await insforge.database
      .from('emails')
      .select('lead_id, status, sent_at, opened_at, clicked_at, replied_at')
      .eq('campaign_id', id);

    const list = emails || [];
    const sentStatuses = new Set(['sent', 'opened', 'clicked', 'replied']);
    const repliedLeadIds = new Set(
      list.filter((e: any) => e.replied_at && e.lead_id).map((e: any) => e.lead_id)
    );
    return NextResponse.json({
      ...serialize(campaign),
      leads: leadsCount || 0,
      sent: list.filter((e: any) => e.sent_at || sentStatuses.has(e.status)).length,
      opened: list.filter((e: any) => e.opened_at).length,
      clicked: list.filter((e: any) => e.clicked_at).length,
      replied: list.filter((e: any) => e.replied_at).length,
      repliedLeads: repliedLeadIds.size,
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const data = await request.json();

    const { data: existing, error: fetchError } = await insforge.database
      .from('campaigns')
      .select('id, followup_after_days')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.description !== undefined) updatePayload.description = data.description || null;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.dailyLimit !== undefined) updatePayload.daily_limit = data.dailyLimit;
    if (data.followupEnabled !== undefined) updatePayload.followup_enabled = data.followupEnabled;
    if (data.followupDays !== undefined) updatePayload.followup_days = data.followupDays;
    // template_id: allow null to clear.
    if (data.templateId !== undefined) updatePayload.template_id = data.templateId || null;
    // followup_after_days: parse int, fallback to existing then 3.
    if (data.followupAfterDays !== undefined) {
      const parsed = parseInt(data.followupAfterDays, 10);
      updatePayload.followup_after_days = Number.isNaN(parsed)
        ? (existing.followup_after_days ?? 3)
        : parsed;
    }
    // followup send hour (0-23, local to the timezone) — null clears it.
    if (data.followupSendHour !== undefined) {
      const h = parseInt(data.followupSendHour, 10);
      updatePayload.followup_send_hour =
        Number.isNaN(h) || h < 0 || h > 23 ? null : h;
    }
    if (data.followupTimezone !== undefined) {
      updatePayload.followup_timezone = data.followupTimezone || null;
    }

    // Scheduled start. Whenever the schedule is (re)configured, clear
    // schedule_started_at so the cron can fire it at the new time.
    let scheduleTouched = false;
    if (data.scheduleEnabled !== undefined) {
      updatePayload.schedule_enabled = !!data.scheduleEnabled;
      scheduleTouched = true;
    }
    if (data.scheduleDate !== undefined) {
      updatePayload.schedule_date = data.scheduleDate || null;
      scheduleTouched = true;
    }
    if (data.scheduleHour !== undefined) {
      const h = parseInt(data.scheduleHour, 10);
      updatePayload.schedule_hour = Number.isNaN(h) || h < 0 || h > 23 ? null : h;
      scheduleTouched = true;
    }
    if (data.scheduleTimezone !== undefined) {
      updatePayload.schedule_timezone = data.scheduleTimezone || null;
      scheduleTouched = true;
    }
    if (scheduleTouched) {
      updatePayload.schedule_started_at = null;
    }

    const { data: updated, error } = await insforge.database
      .from('campaigns')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating campaign:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(serialize(updated));
  } catch (error) {
    console.error('Error updating campaign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const { data: existing, error: fetchError } = await insforge.database
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { error } = await insforge.database.from('campaigns').delete().eq('id', id);

    if (error) {
      console.error('Error deleting campaign:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
