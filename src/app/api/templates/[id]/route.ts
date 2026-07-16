export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

function serialize(template: any) {
  return {
    id: template.id,
    userId: template.user_id,
    name: template.name,
    subject: template.subject,
    body: template.body,
    category: template.category,
    isDefault: template.is_default,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
    usageCount: 0,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data: template, error } = await insforge.database
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(serialize(template));
  } catch (error) {
    console.error('Error fetching template:', error);
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

    // Verify the template exists and is owned by the user
    const { data: existing, error: fetchError } = await insforge.database
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Users may only edit their own templates, not shared default templates.
    if (existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.subject !== undefined) updatePayload.subject = data.subject;
    if (data.body !== undefined) updatePayload.body = data.body;
    if (data.category !== undefined) updatePayload.category = data.category || null;
    if (data.isDefault !== undefined) updatePayload.is_default = !!data.isDefault;

    const { data: updated, error } = await insforge.database
      .from('templates')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(serialize(updated));
  } catch (error) {
    console.error('Error updating template:', error);
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
      .from('templates')
      .select('id, is_default, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Protect seeded default templates from deletion
    if (existing.is_default && existing.user_id === null) {
      return NextResponse.json(
        { error: 'Default templates cannot be deleted' },
        { status: 403 }
      );
    }

    // Users may only delete their own templates, not shared default templates.
    if (existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await insforge.database.from('templates').delete().eq('id', id);

    if (error) {
      console.error('Error deleting template:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
