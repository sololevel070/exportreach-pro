export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import {
  getLeadFieldDefs,
  slugifyKey,
  RESERVED_FIELD_KEYS,
  FIELD_TYPES,
  type FieldType,
} from '@/lib/lead-fields';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const fields = await getLeadFieldDefs(userId);
    return NextResponse.json(fields);
  } catch (error) {
    console.error('Error listing lead fields:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const type: FieldType = FIELD_TYPES.includes(body.type) ? body.type : 'text';
    const key = slugifyKey(body.key || label);

    if (!label) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }
    if (!key) {
      return NextResponse.json({ error: 'Could not derive a valid field key from the label' }, { status: 400 });
    }
    if (RESERVED_FIELD_KEYS.has(key)) {
      return NextResponse.json(
        { error: `"${key}" is a reserved field name. Choose a different label.` },
        { status: 400 }
      );
    }

    // Determine the next sort order.
    const existing = await getLeadFieldDefs(userId);
    if (existing.some((f) => f.key === key)) {
      return NextResponse.json({ error: 'A field with this key already exists' }, { status: 409 });
    }
    const sortOrder = existing.length;

    const { data, error } = await insforge.database
      .from('lead_field_defs')
      .insert([{ user_id: userId, key, label, type, sort_order: sortOrder }])
      .select()
      .single();

    if (error) {
      // Unique violation safety net.
      if (String(error.message || '').toLowerCase().includes('duplicate') || error.code === '23505') {
        return NextResponse.json({ error: 'A field with this key already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { id: data.id, key: data.key, label: data.label, type: data.type, sortOrder: data.sort_order },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating lead field:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
