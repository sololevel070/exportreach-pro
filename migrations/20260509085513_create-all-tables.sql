-- Create all tables for B2B Email Outreach SaaS

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    image TEXT,
    password TEXT,
    email_verified TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    country TEXT,
    website TEXT,
    linked_in TEXT,
    product_interest TEXT,
    status TEXT DEFAULT 'pending',
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    daily_limit INTEGER DEFAULT 50,
    followup_enabled BOOLEAN DEFAULT true,
    followup_days TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Campaign Leads junction table
CREATE TABLE IF NOT EXISTS campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, lead_id)
);

-- 5. Emails table
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    body TEXT,
    status TEXT DEFAULT 'draft',
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    tracking_id TEXT UNIQUE DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Followups table
CREATE TABLE IF NOT EXISTS followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Templates table
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    category TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Tracking Events table
CREATE TABLE IF NOT EXISTS tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT
);

-- 9. User Settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    gmail_connected BOOLEAN DEFAULT false,
    smtp_configured BOOLEAN DEFAULT false,
    smtp_host TEXT,
    smtp_port INTEGER,
    smtp_user TEXT,
    smtp_pass TEXT,
    resend_configured BOOLEAN DEFAULT false,
    resend_api_key TEXT,
    openai_key TEXT,
    signature TEXT,
    company_name TEXT,
    website TEXT,
    whats_app TEXT,
    linked_in_url TEXT,
    twitter_url TEXT,
    daily_limit INTEGER DEFAULT 50,
    warmup_enabled BOOLEAN DEFAULT false,
    warmup_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    size INTEGER,
    type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);

CREATE INDEX IF NOT EXISTS idx_emails_lead_id ON emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_emails_campaign_id ON emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_tracking_id ON emails(tracking_id);

CREATE INDEX IF NOT EXISTS idx_tracking_events_email_id ON tracking_events(email_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_type ON tracking_events(type);

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);

-- Insert default email templates
INSERT INTO templates (id, name, subject, body, category, is_default) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Cold Outreach - Professional', 'Partnership Opportunity - {{company_name}}', 'Dear {{contact_name}},

I hope this email finds you well. I came across {{company_name}} and was impressed by what you do in the {{product_interest}} space.

Given your presence in {{country}}, I believe there could be a valuable synergy between our organizations. We help companies like yours expand their reach and connect with new business opportunities.

Would you be open to a brief call this week to explore how we might be able to support your growth objectives?

Best regards', 'Cold Outreach', true),
    ('22222222-2222-2222-2222-222222222222', 'Follow-up After No Response', 'Following up - {{company_name}}', 'Hi {{contact_name}},

I wanted to follow up on my previous email about {{product_interest}} for {{company_name}}.

I understand you might be busy, so I wanted to bring this back to your attention. We believe this could be particularly valuable for companies like yours looking to expand in {{country}}.

Would you have 15 minutes this week for a quick call?

Best regards', 'Follow-up', true),
    ('33333333-3333-3333-3333-333333333333', 'Intro Call Request', 'Quick call about {{product_interest}}', 'Hi {{contact_name}},

I would love to share some ideas that could help {{company_name}} achieve better results with your {{product_interest}} initiatives.

Would you be open to a brief 15-minute call this week? I can work around your schedule.

Best regards', 'Meeting', true)
ON CONFLICT (id) DO NOTHING;