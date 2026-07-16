export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';

export async function GET(request: NextRequest) {
  const reqUrl = new URL(request.url);
  const { searchParams } = reqUrl;
  const trackingId = searchParams.get('e');
  const encodedUrl = searchParams.get('u');
  // Absolute fallback so NextResponse.redirect always gets a valid URL.
  const homeUrl = new URL('/', reqUrl.origin).toString();

  // Decode the destination URL up front so we can always fall back to it.
  let decodedUrl = homeUrl;
  if (encodedUrl) {
    try {
      decodedUrl = decodeURIComponent(encodedUrl);
    } catch {
      decodedUrl = encodedUrl;
    }
  }
  const isHttp = /^https?:\/\//i.test(decodedUrl);

  try {
    if (trackingId) {
      const { data: email } = await insforge.database
        .from('emails')
        .select('*')
        .eq('tracking_id', trackingId)
        .single();

      if (email) {
        await insforge.database.from('tracking_events').insert([{
          email_id: email.id,
          type: 'click',
          timestamp: new Date().toISOString(),
          ip_address: request.headers.get('x-forwarded-for') || 'unknown',
          user_agent: request.headers.get('user-agent') || 'unknown',
        }]);

        // Advance-only status: a click never downgrades a replied email, but we
        // still record clicked_at.
        const emailUpdate: Record<string, any> = {
          clicked_at: new Date().toISOString(),
        };
        if (email.status !== 'replied') {
          emailUpdate.status = 'clicked';
        }
        await insforge.database
          .from('emails')
          .update(emailUpdate)
          .eq('id', email.id);

        // Advance-only status for the lead as well.
        const { data: lead } = await insforge.database
          .from('leads')
          .select('status')
          .eq('id', email.lead_id)
          .single();

        if (lead && lead.status !== 'replied') {
          await insforge.database
            .from('leads')
            .update({ status: 'clicked' })
            .eq('id', email.lead_id);
        }
      }
    }
  } catch (error) {
    console.error('Error tracking click:', error);
  }

  return NextResponse.redirect(isHttp ? decodedUrl : homeUrl, 302);
}
