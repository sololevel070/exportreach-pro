import { createClient } from '@insforge/sdk';

// IMPORTANT: the InsForge API key is a full-access (project_admin) key and MUST
// stay SERVER-ONLY. It is read exclusively from non-public env vars so it can
// never be inlined into the client bundle. This module is imported by server
// code (route handlers / lib) only.
export const insforge = createClient({
  baseUrl: process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL,
  anonKey: process.env.INSFORGE_API_KEY,
});

export const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';