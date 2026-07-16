export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { checkEnv } from '@/lib/env';
import { insforge } from '@/lib/insforge';

// Liveness + readiness probe for Docker / reverse proxies / uptime monitors.
// Returns 200 when configured and the data store is reachable, 503 otherwise.
export async function GET() {
  const env = checkEnv();
  let db: 'ok' | 'unreachable' | 'unconfigured' = 'unconfigured';

  if (env.ok) {
    try {
      const { error } = await insforge.database
        .from('users')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      db = error ? 'unreachable' : 'ok';
    } catch {
      db = 'unreachable';
    }
  }

  const healthy = env.ok && db === 'ok';
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      db,
      missingEnv: env.missing,
      warnings: env.warnings,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
