import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Lightweight custom session auth (httpOnly JWT cookie).
 * Uses `jose` so the same verify logic runs in both the Edge middleware and
 * Node route handlers.
 */

export const SESSION_COOKIE = 'er_session';
const ALG = 'HS256';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  // In production AUTH_SECRET must be set; this dev fallback keeps local runs working.
  return new TextEncoder().encode(s || 'dev-insecure-secret-change-me-please-0001');
}

export interface SessionPayload {
  userId: string;
  email?: string;
  name?: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = (payload.sub as string) || (payload.userId as string);
    if (!userId) return null;
    return { userId, email: payload.email as string | undefined, name: payload.name as string | undefined };
  } catch {
    return null;
  }
}

/**
 * Resolve the authenticated user id for a route handler.
 * Fast path: the `x-user-id` header injected by middleware after it verified the
 * cookie. Fallback: verify the cookie directly (covers routes the middleware
 * treats as public, e.g. /api/auth/me).
 */
export async function getUserId(request: NextRequest): Promise<string | null> {
  const headerId = request.headers.get('x-user-id');
  if (headerId) return headerId;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  return payload?.userId ?? null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE,
};
