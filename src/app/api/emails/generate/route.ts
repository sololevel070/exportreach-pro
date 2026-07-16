export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateOutreachEmail, type EmailTone } from '@/lib/openai';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { companyName, contactName, country, productInterest, website, linkedIn, tone } = body;

    if (!companyName || !contactName) {
      return NextResponse.json(
        { error: 'Company name and contact name are required' },
        { status: 400 }
      );
    }

    // Try to get key from database first, then environment variable
    let apiKey = process.env.GEMINI_API_KEY;
    try {
      const { data: settings } = await insforge.database
        .from('user_settings')
        .select('openai_key')
        .eq('user_id', userId)
        .single();

      if (settings?.openai_key) {
        apiKey = decryptSecret(settings.openai_key) || apiKey;
      }
    } catch (dbError) {
      console.error('Error reading API key from database settings:', dbError);
    }

    // Try to generate with Gemini if API key is configured
    try {
      if (!apiKey) {
        throw new Error('Gemini API key is not configured');
      }

      const email = await generateOutreachEmail({
        companyName,
        contactName,
        country,
        productInterest,
        website,
        linkedIn,
        tone: (tone as EmailTone) || 'professional',
        apiKey,
        userId,
      });
      return NextResponse.json(email);
    } catch (openaiError) {
      console.error('Generation error, falling back to mock:', openaiError);
      // If AI generation fails or key is missing, return a mock response flagged
      // as a fallback so the UI can tell the user AI wasn't actually used.
      return NextResponse.json({
        fallback: true,
        subject: `Partnership Opportunity - ${companyName}`,
        body: `Dear ${contactName},

I hope this email finds you well. I came across ${companyName} and was impressed by what you do in the ${productInterest || 'B2B space'}.

Given your presence in ${country || 'the international market'}, I believe there could be a valuable synergy between our organizations.

Would you be open to a brief call this week to explore how we might be able to support your growth objectives?

Best regards`
      });
    }
  } catch (error) {
    console.error('Error generating email:', error);
    return NextResponse.json(
      { error: 'Failed to generate email' },
      { status: 500 }
    );
  }
}