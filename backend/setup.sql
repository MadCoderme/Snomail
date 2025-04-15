-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sequences Table
CREATE TABLE sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sequence Steps Table
CREATE TABLE sequence_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    step_number INT NOT NULL, -- Order of the step (1, 2, 3...)
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    delay_days INT NOT NULL DEFAULT 1, -- Delay *before* this step (in days)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sequence_id, step_number) -- Ensure unique step order per sequence
);

-- Campaigns Table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE RESTRICT, -- Don't delete sequence if used by campaign
    from_email VARCHAR(255) NOT NULL,
    smtp_config JSONB NOT NULL, -- Store host, port, user, pass (securely!), secure flag
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed', 'error'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Contacts Table (Tracks individual contact progress)
CREATE TABLE campaign_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_email VARCHAR(255) NOT NULL,
    contact_data JSONB NOT NULL, -- Store {firstName, company, ...}
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'sent', 'replied', 'bounced', 'unsubscribed', 'completed', 'failed'
    current_step_number INT NOT NULL DEFAULT 0, -- Which step they are on (0 = not started)
    next_send_time TIMESTAMPTZ, -- When the next email is scheduled
    scheduled_job_id VARCHAR(255), -- Optional: Store node-schedule job name/id for cancellation
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, contact_email) -- Ensure a contact is only added once per campaign
);

-- Indexes for performance
CREATE INDEX idx_campaign_contacts_status ON campaign_contacts(status);
CREATE INDEX idx_campaign_contacts_next_send_time ON campaign_contacts(next_send_time);
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- Optional: Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sequence_steps_updated_at BEFORE UPDATE ON sequence_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaign_contacts_updated_at BEFORE UPDATE ON campaign_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();