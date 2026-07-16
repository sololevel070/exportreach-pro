import { ImapFlow } from 'imapflow';

export interface ReplySignals {
  fromAddresses: Set<string>;
  inReplyTo: Set<string>;
}

/** Heuristic: IMAP reply detection currently only supports Gmail (imap.gmail.com). */
export function isGmailAccount(smtpUser?: string, smtpHost?: string): boolean {
  const u = (smtpUser || '').toLowerCase();
  const h = (smtpHost || '').toLowerCase();
  return (
    u.includes('gmail') || u.includes('googlemail') ||
    h.includes('gmail') || h.includes('google')
  );
}

/**
 * Connect to a Gmail inbox over IMAP and collect signals that identify replies:
 * the sender addresses and any In-Reply-To message-ids from recent messages.
 * The caller matches these against sent leads/emails. Read-only; never deletes.
 */
export async function fetchReplySignals(opts: {
  user: string;
  pass: string;
  host?: string;
  sinceDays?: number;
}): Promise<ReplySignals> {
  const fromAddresses = new Set<string>();
  const inReplyTo = new Set<string>();

  const client = new ImapFlow({
    host: opts.host || 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: opts.user, pass: opts.pass },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - (opts.sinceDays ?? 14) * 86400000);
      const uids = await client.search({ since }, { uid: true });
      if (Array.isArray(uids) && uids.length > 0) {
        for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
          const addr = msg.envelope?.from?.[0]?.address;
          if (addr) fromAddresses.add(addr.toLowerCase().trim());
          const irt = (msg.envelope as any)?.inReplyTo;
          if (irt) inReplyTo.add(String(irt).replace(/[<>]/g, '').trim());
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  return { fromAddresses, inReplyTo };
}
