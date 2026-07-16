export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

// Distinct, non-empty country values actually present in the user's leads.
// Used to populate the Leads page country filter so its options always match
// the real data (no hardcoded "USA" vs stored "United States" mismatch).
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await insforge.database
      .from('leads')
      .select('country')
      .eq('user_id', userId)
      .not('country', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const set = new Set<string>();
    for (const row of data || []) {
      const c = (row.country || '').trim();
      if (c) set.add(c);
    }

    const countries = Array.from(set).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ countries });
  } catch (error) {
    console.error('Error fetching lead countries:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
