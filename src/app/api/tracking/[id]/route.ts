import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: email } = await insforge.database
      .from('emails')
      .select('*')
      .eq('tracking_id', id)
      .single();

    if (!email) {
      return new NextResponse('Not Found', { status: 404 });
    }

    await insforge.database.from('tracking_events').insert([{
      email_id: email.id,
      type: 'open',
      timestamp: new Date().toISOString(),
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
    }]);

    // First-open semantics: only stamp opened_at the first time.
    // Advance-only status: never downgrade a clicked/replied email back to opened.
    const emailUpdate: Record<string, any> = {};
    if (!email.opened_at) {
      emailUpdate.opened_at = new Date().toISOString();
    }
    if (!['clicked', 'replied'].includes(email.status)) {
      emailUpdate.status = 'opened';
    }
    if (Object.keys(emailUpdate).length > 0) {
      await insforge.database
        .from('emails')
        .update(emailUpdate)
        .eq('id', email.id);
    }

    // Advance-only status for the lead as well.
    const { data: lead } = await insforge.database
      .from('leads')
      .select('status')
      .eq('id', email.lead_id)
      .single();

    if (lead && !['clicked', 'replied'].includes(lead.status)) {
      await insforge.database
        .from('leads')
        .update({ status: 'opened' })
        .eq('id', email.lead_id);
    }

    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    return new NextResponse(pixel, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error tracking open:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}