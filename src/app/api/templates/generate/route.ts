export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateEmailTemplate } from '@/lib/ai-gateway';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { tone, category, purpose } = await request.json();

    // Resolve an API key from settings first, then environment.
    let apiKey = process.env.GEMINI_API_KEY;
    try {
      const { data: settings } = await insforge.database
        .from('user_settings')
        .select('openai_key')
        .eq('user_id', userId)
        .single();
      if (settings?.openai_key) apiKey = decryptSecret(settings.openai_key) || apiKey;
    } catch (dbError) {
      console.error('Error reading API key from settings:', dbError);
    }

    try {
      const template = await generateEmailTemplate({
        tone: tone || 'professional',
        category,
        purpose,
        apiKey,
        userId,
      });
      return NextResponse.json(template);
    } catch (aiError) {
      console.error('Template generation failed, returning fallback:', aiError);
      // Graceful fallback so the UI flow never breaks if AI is unconfigured.
      return NextResponse.json({
        subject: 'Partnership Opportunity - {{company_name}}',
        body: `Dear {{contact_name}},

I hope this message finds you well. I came across {{company_name}} and was impressed by your work in the {{product_interest}} space.

Given your presence in {{country}}, I believe there could be a strong fit between our organisations. Would you be open to a brief call this week to explore how we might support your growth?

Best regards`,
        fallback: true,
        error: 'AI provider not configured or unavailable',
      });
    }
  } catch (error) {
    console.error('Error generating template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
