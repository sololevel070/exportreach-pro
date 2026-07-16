// Central environment-variable contract. Used by the health check and boot log
// so a self-hoster gets a clear, early signal when configuration is incomplete.

export const REQUIRED_ENV = [
  'NEXT_PUBLIC_APP_URL',
  'AUTH_SECRET',
  'CRON_SECRET',
] as const;

// The data-store URL/key are read with a couple of accepted names.
export function hasInsforgeConfig(): boolean {
  return Boolean(
    (process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL) &&
      process.env.INSFORGE_API_KEY
  );
}

export function hasAnyAiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

export interface EnvReport {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

export function checkEnv(): EnvReport {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) missing.push(key);
  }
  if (!hasInsforgeConfig()) missing.push('INSFORGE_URL + INSFORGE_API_KEY');
  if (!hasAnyAiKey()) warnings.push('No AI key set (GEMINI_API_KEY / OPENAI_API_KEY) — AI features will use fallbacks.');

  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 24) {
    warnings.push('AUTH_SECRET is short — use `openssl rand -hex 48`.');
  }

  return { ok: missing.length === 0, missing, warnings };
}
