export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { query, update } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getUserId } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current and new password are required' },
        { status: 400 }
      );
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const result = await query('users', { eq: { id: userId }, limit: 1 });
    const user = (result.data?.[0] as any) || null;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the current password (supports bcrypt or, for legacy rows, plaintext).
    const stored = user.password || user.password_hash;
    let valid = false;
    if (stored) {
      if (typeof stored === 'string' && /^\$2[aby]\$/.test(stored)) {
        valid = await bcrypt.compare(currentPassword, stored);
      } else {
        valid = stored === currentPassword;
      }
    }
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    const { success, error } = await update('users', { id: userId }, { password: newHash });
    if (!success) {
      return NextResponse.json({ error: error || 'Could not update password' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
