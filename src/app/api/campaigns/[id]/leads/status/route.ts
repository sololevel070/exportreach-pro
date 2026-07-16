export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

// Bulk move selected leads between Active and Replied within a campaign.
// action: 'mark_replied' | 'mark_active'
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    // Verify the campaign belongs to the user.
    const { data: campaign } = await insforge.database
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];
    const action = body.action;

    if (leadIds.length === 0) return NextResponse.json({ updated: 0 });
    if (action !== 'mark_replied' && action !== 'mark_active') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Restrict to leads the user owns.
    const { data: ownLeads } = await insforge.database
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .in('id', leadIds);
    const ownIds = (ownLeads || []).map((l: any) => l.id);
    if (ownIds.length === 0) return NextResponse.json({ updated: 0 });

    const now = new Date().toISOString();

    if (action === 'mark_replied') {
      // Mark the leads replied and flag their emails in this campaign as replied
      // (so they're excluded from auto follow-ups and show in the Replied tab).
      await insforge.database
        .from('leads')
        .update({ status: 'replied', updated_at: now })
        .eq('user_id', userId)
        .in('id', ownIds);
      await insforge.database
        .from('emails')
        .update({ replied_at: now, status: 'replied' })
        .eq('campaign_id', id)
        .in('lead_id', ownIds);
    } else {
      // Reactivate: clear replied state so follow-ups can resume.
      await insforge.database
        .from('leads')
        .update({ status: 'contacted', updated_at: now })
        .eq('user_id', userId)
        .in('id', ownIds);
      await insforge.database
        .from('emails')
        .update({ replied_at: null, status: 'sent' })
        .eq('campaign_id', id)
        .in('lead_id', ownIds)
        .not('replied_at', 'is', null);
    }

    return NextResponse.json({ updated: ownIds.length });
  } catch (error) {
    console.error('Error updating lead status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
