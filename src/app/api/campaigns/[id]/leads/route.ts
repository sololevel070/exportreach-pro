export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

function serializeLead(lead: any) {
  return {
    id: lead.id,
    userId: lead.user_id,
    companyName: lead.company_name,
    contactName: lead.contact_name,
    email: lead.email,
    country: lead.country,
    website: lead.website,
    linkedIn: lead.linked_in,
    productInterest: lead.product_interest,
    status: lead.status,
    source: lead.source,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
  };
}

async function getCampaign(id: string, userId: string) {
  const { data: campaign, error } = await insforge.database
    .from('campaigns')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (error || !campaign) return null;
  return campaign;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const campaign = await getCampaign(id, userId);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Lead ids already assigned to this campaign.
    const { data: links } = await insforge.database
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', id);

    const assignedIds = (links || []).map((l: any) => l.lead_id);
    const assignedSet = new Set(assignedIds);

    // Lead ids that have REPLIED to THIS campaign (filter in JS, matching
    // the rest of the codebase's replied_at handling).
    const { data: campaignEmails } = await insforge.database
      .from('emails')
      .select('lead_id, replied_at')
      .eq('campaign_id', id);

    const repliedSet = new Set(
      (campaignEmails || [])
        .filter((e: any) => e.replied_at && e.lead_id)
        .map((e: any) => e.lead_id)
    );

    // All of the user's leads, then split into active / replied / available.
    const { data: leads } = await insforge.database
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const active: any[] = [];
    const replied: any[] = [];
    const available: any[] = [];
    for (const lead of leads || []) {
      if (assignedSet.has(lead.id)) {
        // Replied if they replied to this campaign's email OR were marked replied.
        if (repliedSet.has(lead.id) || lead.status === 'replied') replied.push(serializeLead(lead));
        else active.push(serializeLead(lead));
      } else {
        available.push(serializeLead(lead));
      }
    }

    return NextResponse.json({ active, replied, available });
  } catch (error) {
    console.error('Error fetching campaign leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const campaign = await getCampaign(id, userId);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];

    if (leadIds.length === 0) {
      return NextResponse.json({ added: 0 });
    }

    // Only assign leads that actually belong to this user.
    const { data: ownLeads } = await insforge.database
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .in('id', leadIds);

    const ownIds = new Set((ownLeads || []).map((l: any) => l.id));

    // Filter out ids already assigned so the UNIQUE(campaign_id, lead_id)
    // constraint never errors.
    const { data: existing } = await insforge.database
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', id)
      .in('lead_id', leadIds);

    const alreadyAssigned = new Set((existing || []).map((l: any) => l.lead_id));

    const toInsert = leadIds
      .filter((leadId) => ownIds.has(leadId) && !alreadyAssigned.has(leadId))
      .map((leadId) => ({ campaign_id: id, lead_id: leadId }));

    if (toInsert.length === 0) {
      return NextResponse.json({ added: 0 });
    }

    const { error } = await insforge.database
      .from('campaign_leads')
      .insert(toInsert);

    if (error) {
      console.error('Error assigning leads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ added: toInsert.length });
  } catch (error) {
    console.error('Error assigning leads:', error);
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

    const campaign = await getCampaign(id, userId);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];

    if (leadIds.length === 0) {
      return NextResponse.json({ removed: 0 });
    }

    // Only remove leads that actually belong to this user.
    const { data: ownLeads } = await insforge.database
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .in('id', leadIds);

    const ownIds = (ownLeads || []).map((l: any) => l.id);

    if (ownIds.length === 0) {
      return NextResponse.json({ removed: 0 });
    }

    const { error } = await insforge.database
      .from('campaign_leads')
      .delete()
      .eq('campaign_id', id)
      .in('lead_id', ownIds);

    if (error) {
      console.error('Error removing leads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ removed: ownIds.length });
  } catch (error) {
    console.error('Error removing leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
