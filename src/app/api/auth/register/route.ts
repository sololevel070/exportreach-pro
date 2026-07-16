import { NextRequest, NextResponse } from 'next/server';
import { query, insert, isElectron, setDatabaseProvider } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { rateLimit, clientIp, tooMany } from '@/lib/rate-limit';

if (isElectron()) {
  setDatabaseProvider('electron');
}

export async function POST(request: NextRequest) {
  try {
    // Private, single-org deployments should disable open sign-up.
    if (process.env.ALLOW_REGISTRATION === 'false') {
      return NextResponse.json(
        { error: 'Registration is disabled. Contact your administrator for an account.' },
        { status: 403 }
      );
    }

    // Throttle account creation: 5 / hour / IP.
    const rl = rateLimit(`register:${clientIp(request)}`, 5, 60 * 60 * 1000);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existingUser = await query('users', {
      eq: { email },
      limit: 1,
    });

    if (existingUser.data.length > 0) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    const result = await insert('users', {
      id: userId,
      email,
      password: passwordHash,
      name: name || email.split('@')[0],
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Provision the user's settings row in the correct table (user_settings).
    await insert('user_settings', {
      id: uuidv4(),
      user_id: userId,
      daily_limit: 50,
      warmup_enabled: false,
    });

    const token = await signSession({ userId, email, name: name || email.split('@')[0] });
    const response = NextResponse.json({
      user: {
        id: userId,
        email,
        name: name || email.split('@')[0],
      },
    }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}