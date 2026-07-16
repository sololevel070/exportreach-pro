import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

// Pages reachable without a session.
const PUBLIC_PAGES = ['/login', '/register', '/forgot-password'];
// API prefixes reachable without a session (auth endpoints + recipient-facing
// tracking/click pixels, which are hit by external email clients, not the user).
// /api/cron/* does its own shared-secret auth (CRON_SECRET), so the session
// middleware must let it through.
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/tracking', '/api/click', '/api/cron', '/api/health'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never trust an inbound x-user-id; we set it ourselves from the verified token.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-user-id');

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (session) requestHeaders.set('x-user-id', session.userId);

  const isPublicPage = matchesPrefix(pathname, PUBLIC_PAGES);
  const isPublicApi = matchesPrefix(pathname, PUBLIC_API_PREFIXES);
  const isApi = pathname.startsWith('/api');

  // Authenticated, or an explicitly public route → let it through (with header set/stripped).
  if (session || isPublicPage || isPublicApi) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Unauthenticated on a protected route.
  if (isApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static asset files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml)$).*)',
  ],
};
