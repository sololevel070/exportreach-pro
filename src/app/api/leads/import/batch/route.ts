export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { BUILTIN_LEAD_COLUMNS } from '@/lib/lead-fields';

// Insert ONE batch of already-mapped leads. The client calls this repeatedly
// (e.g. 50 at a time) so large imports never crash and can show progress.
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leads } = await request.json();
    if (!Array.isArray(leads)) {
      return NextResponse.json({ error: 'leads must be an array' }, { status: 400 });
    }

    const str = (v: any) => (v === undefined || v === null ? '' : String(v).trim());

    // Normalise incoming records to the row shape.
    const normalized = leads.map((l: any) => {
      const row: any = {};
      for (const col of BUILTIN_LEAD_COLUMNS) row[col] = str(l[col]);
      const cf =
        l.custom_fields && typeof l.custom_fields === 'object' ? l.custom_fields : {};
      const customFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(cf)) {
        const val = str(v);
        if (val !== '') customFields[k] = val;
      }
      row.custom_fields = customFields;
      return row;
    });

    // De-dupe by email within this batch and against existing rows for the user.
    const batchEmails = Array.from(
      new Set(normalized.map((r) => r.email.toLowerCase()).filter(Boolean))
    );

    const existingEmails = new Set<string>();
    if (batchEmails.length > 0) {
      const { data: existing } = await insforge.database
        .from('leads')
        .select('email')
        .eq('user_id', userId)
        .in('email', batchEmails);
      (existing || []).forEach((e: any) => e.email && existingEmails.add(String(e.email).toLowerCase()));
    }

    const seen = new Set<string>();
    let skipped = 0;
    const toInsert: any[] = [];

    for (const row of normalized) {
      // email is required (NOT NULL column + this is an email-outreach tool):
      // rows without an email can't be stored, so they're skipped.
      if (!row.email) {
        skipped++;
        continue;
      }
      const key = row.email.toLowerCase();
      if (existingEmails.has(key) || seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);

      toInsert.push({
        user_id: userId,
        source: 'import',
        status: 'pending',
        // company_name / contact_name / email are NOT NULL — use '' (never null).
        company_name: row.company_name || '',
        contact_name: row.contact_name || '',
        email: row.email,
        // Nullable columns.
        country: row.country || null,
        website: row.website || null,
        linked_in: row.linked_in || null,
        product_interest: row.product_interest || null,
        custom_fields: row.custom_fields,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await insforge.database.from('leads').insert(toInsert);
      if (error) {
        console.error('Batch insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ inserted: toInsert.length, skipped });
  } catch (error) {
    console.error('Error in batch import:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
