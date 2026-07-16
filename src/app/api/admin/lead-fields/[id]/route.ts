export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { FIELD_TYPES, type FieldType } from '@/lib/lead-fields';

// Edit a field's label/type/order. The key is intentionally immutable so stored
// values in leads.custom_fields stay addressable.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof body.label === 'string' && body.label.trim()) updateData.label = body.label.trim();
    if (FIELD_TYPES.includes(body.type)) updateData.type = body.type as FieldType;
    if (typeof body.sortOrder === 'number') updateData.sort_order = body.sortOrder;

    const { data, error } = await insforge.database
      .from('lead_field_defs')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Field not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      key: data.key,
      label: data.label,
      type: data.type,
      sortOrder: data.sort_order,
    });
  } catch (error) {
    console.error('Error updating lead field:', error);
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

    const { error } = await insforge.database
      .from('lead_field_defs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Existing values in leads.custom_fields are left intact but simply stop showing.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead field:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
