export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { decryptSecret } from '@/lib/crypto';
import { fetchReplySignals, isGmailAccount } from '@/lib/imap';

// Secured by a shared secret so only the scheduler can trigger it.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    req.headers.get('x-cron-secret') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return header === secret;
}

async function run() {
  // All users who have Gmail SMTP credentials configured.
  const { data: settingsRows } = await insforge.database
    .from('user_settings')
    .select('user_id, smtp_user, smtp_pass, smtp_host');

  let totalMarked = 0;
  const perUser: any[] = [];

  for (const s of settingsRows || []) {
    if (!s.smtp_user || !s.smtp_pass || !isGmailAccount(s.smtp_user, s.smtp_host)) continue;

    let signals;
    try {
      signals = await fetchReplySignals({ user: s.smtp_user, pass: decryptSecret(s.smtp_pass) || '', sinceDays: 14 });
    } catch (e: any) {
      console.error('IMAP poll failed for user', s.user_id, e?.message);
      perUser.push({ user: s.user_id, error: e?.message || 'imap error' });
      continue;
    }

    if (signals.fromAddresses.size === 0 && signals.inReplyTo.size === 0) {
      perUser.push({ user: s.user_id, marked: 0 });
      continue;
    }

    // This user's sent, not-yet-replied emails (with the lead's email + our message id).
    const { data: emails } = await insforge.database
      .from('emails')
      .select('id, lead_id, message_id, leads!inner(user_id, email)')
      .eq('leads.user_id', s.user_id)
      .is('replied_at', null)
      .not('sent_at', 'is', null);

    let marked = 0;
    const now = new Date().toISOString();
    for (const em of emails || []) {
      const leadRel: any = (em as any).leads;
      const leadObj = Array.isArray(leadRel) ? leadRel[0] : leadRel;
      const leadEmail = (leadObj?.email || '').toLowerCase().trim();
      const matchFrom = leadEmail && signals.fromAddresses.has(leadEmail);
      const matchIrt =
        em.message_id &&
        signals.inReplyTo.has(String(em.message_id).replace(/[<>]/g, '').trim());
      if (matchFrom || matchIrt) {
        await insforge.database
          .from('emails')
          .update({ replied_at: now, status: 'replied' })
          .eq('id', em.id);
        await insforge.database
          .from('leads')
          .update({ status: 'replied' })
          .eq('id', em.lead_id);
        marked++;
      }
    }

    totalMarked += marked;
    perUser.push({ user: s.user_id, marked });
  }

  return { ok: true, totalMarked, perUser };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await run());
  } catch (error) {
    console.error('poll-replies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Allow GET as well so simple schedulers can trigger it.
export async function GET(request: NextRequest) {
  return POST(request);
}
