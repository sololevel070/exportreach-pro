export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { improveEmail } from '@/lib/ai-gateway';
import { getUserId } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subject, body, contactName } = await request.json();

    if (!subject && !body) {
      return NextResponse.json(
        { error: 'Subject or body is required' },
        { status: 400 }
      );
    }

    try {
      const improved = await improveEmail({
        subject: subject || '',
        body: body || '',
        contactName: contactName || 'there',
        userId,
      });
      return NextResponse.json(improved);
    } catch (aiError) {
      console.error('AI improve failed, returning original:', aiError);
      // Graceful fallback: return the original content so the UI flow never breaks
      return NextResponse.json({
        subject: subject || '',
        body: body || '',
        fallback: true,
        error: 'AI provider not configured or unavailable',
      });
    }
  } catch (error) {
    console.error('Error improving email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
