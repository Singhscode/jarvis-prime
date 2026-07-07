// TypeScript interfaces for all Jarvis Prime API request/response types.
// Shared between frontend components for consistency and type safety.

// ---- Common ----

export interface Prospect {
  id: string;
  client_id: string;
  full_name: string;
  first_name?: string;
  title: string;
  company: string;
  industry?: string;
  location?: string;
  email: string;
  linkedin_url?: string;
  source: string;
  stage: 'new' | 'qualified' | 'contacted' | 'replied' | 'booked' | 'unsubscribed';
  step: number;
  score?: number;
  hot?: boolean;
  next_action_at?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

export interface Client {
  id: string;
  name: string;
  icp_titles: string[];
  icp_industries: string[];
  icp_locations: string[];
  icp_keywords: string[];
  active: boolean;
  config?: ClientConfig;
  created_at: string;
}

export interface ClientConfig {
  maxSteps?: number;
  followupDays?: number[];
  dailySendLimit?: number;
  dailyProspectLimit?: number;
  scoringWeights?: ScoringWeights;
  qualifyThreshold?: number;
  hotThreshold?: number;
  disqualifiers?: string[];
}

export interface ScoringWeights {
  title: number;
  industry: number;
  location: number;
  keyword: number;
  email: number;
}

export interface Campaign {
  id: string;
  client_id: string;
  name: string;
  channels: ('email' | 'linkedin')[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  ab_test_enabled?: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

// ---- API Request Types ----

export interface EnrichmentRequest {
  action: 'search' | 'find_agencies' | 'enrich_batch';
  params?: Record<string, unknown>;
  dry_run?: boolean;
}

export interface OutreachRequest {
  action: 'send_email' | 'send_followup' | 'send_alert';
  prospect?: Prospect;
  step?: number;
  dry_run?: boolean;
}

export interface LinkedInRequest {
  action: 'connect' | 'message' | 'view_profile' | 'check_replies';
  prospect?: Partial<Prospect>;
  message?: string;
  dry_run?: boolean;
}

export interface CampaignCreateRequest {
  clientId: string;
  campaignData: {
    name: string;
    channels: ('email' | 'linkedin')[];
    ab_test_enabled?: boolean;
    metadata?: Record<string, unknown>;
  };
}

export interface CalendarBookRequest {
  name: string;
  email: string;
  notes?: string;
  start?: string;
  timeZone?: string;
}

// ---- API Response Types ----

export interface HealthResponse {
  status: 'ok' | 'degraded';
  engine: string;
  version: string;
  mode: 'dry-run' | 'live';
  dryRun: boolean;
  env: string;
  uptime: number;
  uptimeHuman: string;
  providers: Record<string, boolean>;
  configured: string[];
  missing: string[];
  memory: { rss: string; heap: string };
  scheduler: string;
  timestamp: string;
}

export interface DeepHealthResponse {
  status: 'healthy' | 'degraded';
  checks: {
    database: boolean;
    providers: Record<string, boolean>;
  };
  timestamp: string;
}

export interface DashboardResponse {
  overview: {
    prospects: number;
    contacted: number;
    replied: number;
    booked: number;
    replyRate: string;
    bookRate: string;
  };
  today: {
    emailsSent: number;
    replies: number;
    replyRate: string;
    meetingsBooked: number;
  };
  channels?: {
    email: { sent: number; opens: number; replies: number; rate: string };
    linkedin: { actions: number; connects: number; messages: number; replies: number; rate: string };
  };
}

export interface FunnelResponse {
  stages: {
    name: string;
    count: number;
    percentage: string;
  }[];
}

export interface ABTestResult {
  testId: string;
  variants: {
    name: string;
    sent: number;
    opens: number;
    replies: number;
    rate: string;
    winner?: boolean;
  }[];
}

export interface SchedulerStatus {
  jobs: {
    id: string;
    name: string;
    schedule: string;
    lastRun?: string;
    nextRun?: string;
    status: 'active' | 'paused';
  }[];
}

// ---- Provider Types ----

export interface ProviderStatus {
  database: boolean;
  apollo: boolean;
  hunter: boolean;
  groq: boolean;
  openai: boolean;
  resend: boolean;
  sendgrid: boolean;
  linkedin: boolean;
  calcom: boolean;
  telegram: boolean;
  slack: boolean;
  whatsapp: boolean;
  scheduler: boolean;
}
