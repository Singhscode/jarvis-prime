-- ============================================================================
-- JARVIS PRIME — Complete Supabase Database Schema
-- ============================================================================
-- 
-- HOW TO USE:
-- 1. Go to https://supabase.com and create a new project
-- 2. Go to SQL Editor in your project
-- 3. Copy this entire file and paste it
-- 4. Click "Run" to create all tables
-- 
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE 1: LEADS
-- ============================================================================
-- Stores all incoming leads from website, LinkedIn, cold outreach, etc.

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Contact Info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  linkedin_url VARCHAR(500),
  
  -- Company Info
  company VARCHAR(255),
  title VARCHAR(255),
  revenue VARCHAR(50), -- "0-1L", "1-5L", "5-20L", "20L+"
  industry VARCHAR(100),
  company_size VARCHAR(50),
  website VARCHAR(500),
  
  -- Lead Details
  message TEXT,
  source VARCHAR(100) DEFAULT 'website', -- website, linkedin, cold_email, referral
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  
  -- ICP Scoring
  icp_score INTEGER DEFAULT 0,
  icp_qualified BOOLEAN DEFAULT FALSE,
  icp_hot BOOLEAN DEFAULT FALSE,
  icp_reasons TEXT[],
  
  -- Status Tracking
  status VARCHAR(50) DEFAULT 'new',
  -- Possible values: new, contacted, qualified, meeting_booked, proposal_sent, negotiation, won, lost, closed_lost
  
  notes TEXT,
  
  -- Assignment
  assigned_to VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contacted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('new', 'contacted', 'qualified', 'meeting_booked', 'proposal_sent', 'negotiation', 'won', 'lost', 'closed_lost'))
);

-- Index for fast queries
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_icp_score ON leads(icp_score DESC);
CREATE INDEX idx_leads_email ON leads(email);

-- ============================================================================
-- TABLE 2: OUTREACH_LOG
-- ============================================================================
-- Tracks every email, LinkedIn message, call, etc. sent to a lead

CREATE TABLE IF NOT EXISTS outreach_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Lead Reference
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Outreach Details
  channel VARCHAR(50) NOT NULL, -- email, linkedin, phone, sms, whatsapp
  step INTEGER DEFAULT 1, -- Which step in the sequence (1, 2, 3, etc.)
  
  -- Content
  subject VARCHAR(500),
  body TEXT,
  template_used VARCHAR(100),
  
  -- Tracking
  status VARCHAR(50) DEFAULT 'sent', -- draft, scheduled, sent, delivered, opened, clicked, replied, bounced
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  
  -- External IDs
  external_id VARCHAR(255), -- Email provider ID, LinkedIn message ID, etc.
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_channel CHECK (channel IN ('email', 'linkedin', 'phone', 'sms', 'whatsapp')),
  CONSTRAINT valid_outreach_status CHECK (status IN ('draft', 'scheduled', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'))
);

-- Indexes
CREATE INDEX idx_outreach_lead_id ON outreach_log(lead_id);
CREATE INDEX idx_outreach_status ON outreach_log(status);
CREATE INDEX idx_outreach_sent_at ON outreach_log(sent_at DESC);

-- ============================================================================
-- TABLE 3: MEETINGS
-- ============================================================================
-- Tracks all booked calls and meetings

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Lead Reference
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Meeting Details
  title VARCHAR(255) NOT NULL,
  meeting_type VARCHAR(50) DEFAULT 'discovery', -- discovery, demo, proposal, negotiation, onboarding
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  
  -- Location
  location VARCHAR(500), -- Zoom link, Google Meet link, phone number, etc.
  location_type VARCHAR(50) DEFAULT 'video', -- video, phone, in_person
  
  -- Status
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show, rescheduled
  
  -- Notes
  agenda TEXT,
  notes TEXT,
  outcome VARCHAR(100), -- qualified, not_qualified, follow_up, proposal_requested, closed_won, closed_lost
  
  -- External IDs
  calendly_event_id VARCHAR(255),
  calendar_event_id VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_meeting_type CHECK (meeting_type IN ('discovery', 'demo', 'proposal', 'negotiation', 'onboarding')),
  CONSTRAINT valid_meeting_status CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled'))
);

-- Indexes
CREATE INDEX idx_meetings_lead_id ON meetings(lead_id);
CREATE INDEX idx_meetings_scheduled_at ON meetings(scheduled_at);
CREATE INDEX idx_meetings_status ON meetings(status);

-- ============================================================================
-- TABLE 4: DEALS
-- ============================================================================
-- Tracks deals/opportunities through the pipeline

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Lead Reference
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Deal Info
  name VARCHAR(255) NOT NULL,
  value DECIMAL(12, 2), -- Deal value in INR
  currency VARCHAR(3) DEFAULT 'INR',
  
  -- Pipeline Stage
  stage VARCHAR(50) DEFAULT 'qualified',
  -- Stages: qualified, meeting_booked, proposal_sent, negotiation, verbal_yes, contract_sent, closed_won, closed_lost
  
  -- Probability
  probability INTEGER DEFAULT 20, -- Win probability percentage
  expected_close_date DATE,
  
  -- Product/Service
  product_type VARCHAR(100), -- What they're buying
  contract_length INTEGER, -- Months
  monthly_value DECIMAL(12, 2),
  
  -- Notes
  notes TEXT,
  loss_reason VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_deal_stage CHECK (stage IN ('qualified', 'meeting_booked', 'proposal_sent', 'negotiation', 'verbal_yes', 'contract_sent', 'closed_won', 'closed_lost'))
);

-- Indexes
CREATE INDEX idx_deals_lead_id ON deals(lead_id);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_value ON deals(value DESC);

-- ============================================================================
-- TABLE 5: PROSPECTS
-- ============================================================================
-- Stores prospect data for outbound campaigns (before they become leads)

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Contact Info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  linkedin_url VARCHAR(500),
  
  -- Company Info
  company VARCHAR(255),
  title VARCHAR(255),
  industry VARCHAR(100),
  company_size VARCHAR(50),
  website VARCHAR(500),
  location VARCHAR(255),
  
  -- ICP Scoring (pre-outreach)
  icp_score INTEGER DEFAULT 0,
  icp_fit VARCHAR(50), -- perfect, good, maybe, poor
  
  -- Campaign Assignment
  campaign_id UUID,
  sequence_step INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(50) DEFAULT 'new',
  -- new, in_sequence, responded, converted, unsubscribed, bounced
  
  -- Source
  source VARCHAR(100), -- apollo, linkedin_sales_nav, manual, referral
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contacted_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  
  -- Converted Lead Reference
  converted_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_icp_score ON prospects(icp_score DESC);
CREATE INDEX idx_prospects_campaign ON prospects(campaign_id);

-- ============================================================================
-- TABLE 6: CAMPAIGNS
-- ============================================================================
-- Outbound campaign management

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Campaign Info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Type
  type VARCHAR(50) DEFAULT 'email', -- email, linkedin, multi_channel
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- draft, active, paused, completed
  
  -- Settings
  daily_limit INTEGER DEFAULT 50,
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  send_days VARCHAR(50) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  send_start_hour INTEGER DEFAULT 9,
  send_end_hour INTEGER DEFAULT 18,
  
  -- Metrics
  total_prospects INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- ============================================================================
-- TABLE 7: EMAIL_TEMPLATES
-- ============================================================================
-- Reusable email templates for sequences

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Template Info
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100), -- cold_outreach, follow_up, meeting_request, proposal
  
  -- Content
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  
  -- Variables available: {{first_name}}, {{company}}, {{title}}, etc.
  
  -- Metrics
  times_used INTEGER DEFAULT 0,
  open_rate DECIMAL(5, 2),
  reply_rate DECIMAL(5, 2),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TABLE 8: DAILY_METRICS
-- ============================================================================
-- Daily snapshot of key metrics for dashboard

CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Date
  date DATE NOT NULL UNIQUE,
  
  -- Lead Metrics
  new_leads INTEGER DEFAULT 0,
  qualified_leads INTEGER DEFAULT 0,
  hot_leads INTEGER DEFAULT 0,
  
  -- Outreach Metrics
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  linkedin_sent INTEGER DEFAULT 0,
  linkedin_replied INTEGER DEFAULT 0,
  
  -- Meeting Metrics
  meetings_booked INTEGER DEFAULT 0,
  meetings_completed INTEGER DEFAULT 0,
  meetings_no_show INTEGER DEFAULT 0,
  
  -- Deal Metrics
  deals_created INTEGER DEFAULT 0,
  deals_won INTEGER DEFAULT 0,
  deals_lost INTEGER DEFAULT 0,
  revenue_won DECIMAL(12, 2) DEFAULT 0,
  
  -- Pipeline
  pipeline_value DECIMAL(12, 2) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX idx_daily_metrics_date ON daily_metrics(date DESC);

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- Active pipeline view
CREATE OR REPLACE VIEW active_pipeline AS
SELECT 
  d.id,
  d.name as deal_name,
  d.value,
  d.stage,
  d.probability,
  d.expected_close_date,
  l.name as contact_name,
  l.email,
  l.company,
  l.phone
FROM deals d
LEFT JOIN leads l ON d.lead_id = l.id
WHERE d.stage NOT IN ('closed_won', 'closed_lost')
ORDER BY d.value DESC;

-- Hot leads view
CREATE OR REPLACE VIEW hot_leads AS
SELECT *
FROM leads
WHERE icp_hot = TRUE AND status NOT IN ('won', 'lost', 'closed_lost')
ORDER BY created_at DESC;

-- Today's metrics view
CREATE OR REPLACE VIEW today_metrics AS
SELECT *
FROM daily_metrics
WHERE date = CURRENT_DATE;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — Optional, for multi-tenant
-- ============================================================================

-- Enable RLS on all tables (uncomment if needed)
-- ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SAMPLE DATA (Optional — for testing)
-- ============================================================================

-- Uncomment to insert sample data:
/*
INSERT INTO leads (name, email, phone, company, title, revenue, message, source, icp_score, icp_qualified, icp_hot, status)
VALUES 
  ('Rahul Sharma', 'rahul@techagency.in', '+91-9876543210', 'TechAgency India', 'Founder & CEO', '5-20L', 'Looking to automate our outbound sales. Currently doing 5-10 calls/month manually.', 'website', 22, true, true, 'new'),
  ('Priya Patel', 'priya@growthstartup.com', '+91-8765432109', 'GrowthStartup', 'Head of Sales', '1-5L', 'Interested in lead generation services', 'linkedin', 18, true, false, 'new'),
  ('Amit Kumar', 'amit@smallbiz.in', NULL, 'SmallBiz Solutions', 'Owner', '0-1L', 'Student looking to learn about sales', 'website', 5, false, false, 'closed_lost');
*/

-- ============================================================================
-- DONE! Your database is ready.
-- ============================================================================
-- 
-- Next steps:
-- 1. Copy your Supabase URL from Project Settings > API
-- 2. Copy your anon key from Project Settings > API
-- 3. Add both to your .env file:
--    SUPABASE_URL=your_url_here
--    SUPABASE_ANON_KEY=your_key_here
-- 
-- ============================================================================
