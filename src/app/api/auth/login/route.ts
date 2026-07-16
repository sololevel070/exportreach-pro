import { NextRequest, NextResponse } from 'next/server';
import { query, isElectron, setDatabaseProvider } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { rateLimit, clientIp, tooMany } from '@/lib/rate-limit';

if (isElectron()) {
  setDatabaseProvider('electron');
}

export async function POST(request: NextRequest) {
  try {
    // Throttle to blunt credential-stuffing / brute force: 10 attempts / 5 min / IP.
    const rl = rateLimit(`login:${clientIp(request)}`, 10, 5 * 60 * 1000);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const result = await query('users', {
      eq: { email },
      limit: 1,
    });

    if (result.error || result.data.length === 0) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = result.data[0] as any;
    const dbPassword: string | undefined = user.password || user.password_hash;

    // Only bcrypt hashes are accepted — no plaintext-comparison fallback.
    let isValidPassword = false;
    if (dbPassword && /^\$2[aby]\$/.test(dbPassword)) {
      try {
        isValidPassword = await bcrypt.compare(password, dbPassword);
      } catch (e) {
        console.error('Bcrypt compare error:', e);
      }
    }

    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = await signSession({ userId: user.id, email: user.email, name: user.name });
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
      },
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}