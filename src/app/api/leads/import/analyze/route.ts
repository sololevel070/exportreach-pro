import { NextRequest, NextResponse } from 'next/server';
import { mapImportHeaders } from '@/lib/ai-gateway';
import { getUserId } from '@/lib/auth';
import { getLeadFieldDefs } from '@/lib/lead-fields';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { headers, sampleRows } = await request.json();

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return NextResponse.json(
        { error: 'Headers are required for analysis.' },
        { status: 400 }
      );
    }

    if (!sampleRows || !Array.isArray(sampleRows)) {
      return NextResponse.json(
        { error: 'Sample rows are required for analysis context.' },
        { status: 400 }
      );
    }

    // Include the user's admin-defined custom fields as mapping targets.
    const customDefs = await getLeadFieldDefs(userId);
    const extraFields = customDefs.map((d) => ({ key: d.key, label: d.label, desc: d.label }));

    const suggestions = await mapImportHeaders({
      headers,
      sampleRows,
      userId,
      extraFields,
    });

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error('Error in lead import mapping analysis:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to analyze headers with AI' },
      { status: 500 }
    );
  }
}
