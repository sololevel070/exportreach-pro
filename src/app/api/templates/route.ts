export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get templates for the user OR default templates
    const { data: userTemplates, error: error1 } = await insforge.database
      .from('templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const { data: defaultTemplates, error: error2 } = await insforge.database
      .from('templates')
      .select('*')
      .eq('is_default', true);

    if (error1 || error2) {
      console.error('Error fetching templates:', error1 || error2);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Merge and remove duplicates
    const allTemplates = [...(userTemplates || []), ...(defaultTemplates || [])];
    const uniqueTemplates = allTemplates.filter((template: any, index: number, self: any[]) =>
      index === self.findIndex((t: any) => t.id === template.id)
    );

    const templates = uniqueTemplates.map((template: any) => ({
      id: template.id,
      userId: template.user_id,
      name: template.name,
      subject: template.subject,
      body: template.body,
      category: template.category,
      isDefault: template.is_default,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      usageCount: 0, // Not tracked yet
    }));

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();

    const { data: template, error } = await insforge.database.from('templates').insert([{
      user_id: userId,
      name: data.name,
      subject: data.subject,
      body: data.body,
      category: data.category || null,
      is_default: data.isDefault || false,
    }]).select().single();

    if (error) {
      console.error('Error creating template:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: template.id,
      userId: template.user_id,
      name: template.name,
      subject: template.subject,
      body: template.body,
      category: template.category,
      isDefault: template.is_default,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}