-- Add AI provider and OpenAI-compatible configuration columns to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'google',
ADD COLUMN IF NOT EXISTS openai_compatible_key TEXT,
ADD COLUMN IF NOT EXISTS openai_compatible_base_url TEXT,
ADD COLUMN IF NOT EXISTS openai_compatible_model TEXT,
ADD COLUMN IF NOT EXISTS openai_compatible_thinking BOOLEAN DEFAULT false;
