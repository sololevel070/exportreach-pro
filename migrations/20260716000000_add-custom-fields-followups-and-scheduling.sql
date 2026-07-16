-- Catch-up migration.
--
-- These schema changes were originally applied incrementally against the live
-- database and were never captured as migration files, so a fresh install from
-- `create-all-tables` alone produced an incomplete schema (campaign save, lead
-- import and the scheduler would all fail).
--
-- Everything here is idempotent (IF NOT EXISTS), so it is safe to run on a
-- brand-new database AND on an existing one that already has some columns.

-- ── 1. Custom lead fields (Admin → Lead Fields) ─────────────────────────────
-- Non-built-in imported/mapped values are stored here as JSON.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

-- User-defined field definitions that drive the import mapper and lead forms.
CREATE TABLE IF NOT EXISTS public.lead_field_defs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  key        text NOT NULL,
  label      text NOT NULL,
  type       text NOT NULL DEFAULT 'text',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_field_defs_user_key_unique UNIQUE (user_id, key)
);

-- ── 2. Campaign template + follow-up tuning ─────────────────────────────────
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.templates(id),
  ADD COLUMN IF NOT EXISTS followup_after_days integer DEFAULT 3,
  -- Hour (0-23) local to followup_timezone. NULL = legacy 09:00 UTC cadence.
  ADD COLUMN IF NOT EXISTS followup_send_hour integer,
  ADD COLUMN IF NOT EXISTS followup_timezone text;

-- ── 3. IMAP reply matching ──────────────────────────────────────────────────
-- Stores the outgoing Message-ID so inbound In-Reply-To can be matched.
ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS message_id text;

-- ── 4. Scheduled campaign start ─────────────────────────────────────────────
-- The campaign auto-starts at schedule_date + schedule_hour in schedule_timezone.
-- schedule_started_at is the idempotency marker set by /api/cron/scheduled-starts
-- when it fires; the API resets it to NULL whenever the schedule is reconfigured.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_date date,
  ADD COLUMN IF NOT EXISTS schedule_hour smallint,
  ADD COLUMN IF NOT EXISTS schedule_timezone text,
  ADD COLUMN IF NOT EXISTS schedule_started_at timestamptz;
