import crypto from 'crypto';

// AES-256-GCM at-rest encryption for stored secrets (SMTP pass, AI keys).
// Backward compatible: values without the "enc:v1:" prefix are treated as
// legacy plaintext and returned as-is, so existing rows keep working.

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const hex = process.env.SECRETS_ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  // Fall back to a key derived from AUTH_SECRET (set SECRETS_ENCRYPTION_KEY in prod).
  const base = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-insecure-secret';
  return crypto.createHash('sha256').update(base).digest();
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null;
  if (typeof plain !== 'string') return null;
  if (plain.startsWith(PREFIX)) return plain; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(val: string | null | undefined): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val !== 'string' || !val.startsWith(PREFIX)) return (val as string) || null; // legacy plaintext
  try {
    const [ivB64, tagB64, ctB64] = val.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    return null;
  }
}
