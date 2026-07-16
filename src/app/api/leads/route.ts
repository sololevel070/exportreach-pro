export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insert, update, remove, isElectron, setDatabaseProvider } from '@/lib/db';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

if (isElectron()) {
  setDatabaseProvider('electron');
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Escape PostgREST `or`/`ilike` reserved characters so a search term can't
// break out of the filter expression.
function escapeSearchTerm(term: string): string {
  return term.replace(/([%,()\\])/g, '\\$1');
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = (searchParams.get('search') || '').trim();
    const status = searchParams.get('status') || '';
    const country = searchParams.get('country') || '';
    const offset = (page - 1) * limit;

    // Build the base query with all active filters applied BEFORE pagination so
    // both the returned rows and the count (count: 'exact' reflects the full
    // filtered set, not just the current page) come from the same filters.
    let leadsQuery = insforge.database
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (status && status !== 'all') {
      leadsQuery = leadsQuery.eq('status', status);
    }

    if (country && country !== 'all' && country !== 'All') {
      leadsQuery = leadsQuery.eq('country', country);
    }

    if (search) {
      const term = escapeSearchTerm(search);
      leadsQuery = leadsQuery.or(
        `company_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%`
      );
    }

    const { data, count, error } = await leadsQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count || 0;

    const leads = (data || []).map((lead: any) => ({
      id: lead.id,
      userId: lead.user_id,
      companyName: lead.company_name,
      contactName: lead.contact_name,
      email: lead.email,
      phone: lead.phone,
      country: lead.country,
      website: lead.website,
      linkedIn: lead.linked_in,
      productInterest: lead.product_interest,
      customFields: lead.custom_fields || {},
      status: lead.status,
      source: lead.source,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
    }));

    return NextResponse.json({
      leads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const data = await request.json();

    const companyName = typeof data.companyName === 'string' ? data.companyName.trim() : '';
    const contactName = typeof data.contactName === 'string' ? data.contactName.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';

    // Validate required fields
    if (!companyName || !contactName || !email) {
      return NextResponse.json(
        { error: 'Company name, contact name, and email are required' },
        { status: 400 }
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // Dedupe: reject if a lead with the same email already exists for this user
    const { data: existing } = await insforge.database
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A lead with this email already exists' },
        { status: 409 }
      );
    }

    const customFields =
      data.customFields && typeof data.customFields === 'object' ? data.customFields : {};

    const leadData = {
      id: crypto.randomUUID(),
      user_id: userId,
      company_name: companyName,
      contact_name: contactName,
      email,
      country: data.country || null,
      website: data.website || null,
      linked_in: data.linkedIn || null,
      product_interest: data.productInterest || null,
      custom_fields: customFields,
      source: data.source || 'manual',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await insert('leads', leadData);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const lead = result.data as any;
    return NextResponse.json({
      id: lead.id,
      userId: lead.user_id,
      companyName: lead.company_name,
      contactName: lead.contact_name,
      email: lead.email,
      country: lead.country,
      website: lead.website,
      linkedIn: lead.linked_in,
      productInterest: lead.product_interest,
      customFields: lead.custom_fields || {},
      status: lead.status,
      source: lead.source,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    for (const id of ids) {
      const result = await remove('leads', { id, user_id: userId });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    }

    return NextResponse.json({ message: `Deleted ${ids.length} leads` });
  } catch (error) {
    console.error('Error deleting leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { ids, status } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    for (const id of ids) {
      const result = await update('leads', { id, user_id: userId }, { status });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    }

    return NextResponse.json({ message: `Updated ${ids.length} leads` });
  } catch (error) {
    console.error('Error updating leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}