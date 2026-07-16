import { NextResponse } from 'next/server';

// Lightweight in-memory rate limiter (fixed window).
//
// Effective for a self-hosted single-container deployment. On multi-instance
// serverless it is best-effort per-instance; use a Redis-backed limiter for a
// hardened multi-node setup.

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

function prune(now: number) {
  if (store.size < 5000) return;
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}

export interface RateResult {
  ok: boolean;
  retryAfter: number; // seconds
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  prune(now);
  const b = store.get(key);
  if (!b || b.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return (
    xff.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
