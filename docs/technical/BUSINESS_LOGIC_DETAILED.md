# 🧠 JARVIS PRIME — Detailed Business Logic

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Core Algorithms](#core-algorithms)
3. [Decision Trees](#decision-trees)
4. [Data Models](#data-models)
5. [Integration Points](#integration-points)
6. [Business Rules](#business-rules)
7. [Scaling & Performance](#scaling--performance)

---

## 🏗️ System Architecture

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                              │
│  Website (Next.js) + Mobile App + Dashboard + API Clients   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS/REST/Webhooks
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  APPLICATION LAYER                           │
│  Engine Server (Node.js + Express) Port 3001                │
│  ├─ Router: Request handling & routing                      │
│  ├─ Controllers: Business logic orchestration               │
│  ├─ Services: Domain logic (enrichment, scoring, etc)       │
│  ├─ Agents: AI-powered decision making                      │
│  └─ Middleware: Auth, validation, error handling            │
└────────────────────────┬────────────────────────────────────┘
                         │ SQL/gRPC
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  DATA LAYER                                  │
│  PostgreSQL (Supabase) + Redis Cache + File Storage        │
│  ├─ Clients: Company/agency records                         │
│  ├─ Prospects: B2B contact information                      │
│  ├─ Messages: Email records (subject, body, status)        │
│  ├─ Events: Tracking (opens, clicks, replies)              │
│  ├─ Sequences: Email templates + rules                     │
│  └─ Suppression: Unsubscribed/bounced emails               │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow Example

```
Client Makes Request
    ↓
API Gateway (Express Router)
    ↓
Authentication Middleware
    ↓
Request Validation
    ↓
Business Logic (Service/Agent)
    ↓
Database Query/Update
    ↓
Response Formatting
    ↓
Client Receives Response
    ↓
(Async) Event Logging & Webhooks
```

---

## 🧮 Core Algorithms

### 1. ICP (Ideal Customer Profile) Scoring Algorithm

**Purpose**: Calculate how well a prospect matches the client's ideal customer

**Inputs**:
- Prospect data (title, company, industry, location, keywords)
- Client ICP config (icp_titles, icp_industries, icp_locations, icp_keywords)

**Algorithm**:

```javascript
function calculateICPScore(prospect, clientICP) {
  let score = 0;
  let maxScore = 100;

  // Title matching (30 points max)
  const titleMatch = clientICP.icp_titles.some(title => 
    prospect.title.toLowerCase().includes(title.toLowerCase())
  );
  score += titleMatch ? 30 : 0;

  // Industry matching (30 points max)
  const industryMatch = clientICP.icp_industries.some(industry =>
    prospect.industry.toLowerCase().includes(industry.toLowerCase())
  );
  score += industryMatch ? 30 : 0;

  // Keyword matching (20 points max)
  const keywordMatches = prospect.keywords.filter(keyword =>
    clientICP.icp_keywords.includes(keyword)
  ).length;
  const keywordScore = Math.min((keywordMatches / clientICP.icp_keywords.length) * 20, 20);
  score += keywordScore;

  // Location matching (10 points max)
  const locationMatch = clientICP.icp_locations.some(location =>
    prospect.location.toLowerCase().includes(location.toLowerCase())
  );
  score += locationMatch ? 10 : 0;

  // Recency bonus (10 points max)
  const daysSinceUpdate = Math.floor((Date.now() - prospect.updated_at) / (1000 * 60 * 60 * 24));
  const recencyScore = Math.max(10 - (daysSinceUpdate * 0.5), 0);
  score += recencyScore;

  return Math.min(score, maxScore);
}

// Classification
if (score >= 80) return { qualified: true, hot: true };
if (score >= 70) return { qualified: true, hot: false };
return { qualified: false, hot: false };
```

**Example**:
```
Prospect: John Smith, CEO, SaaS Company, San Francisco

Client ICP:
  - Titles: [CEO, Founder, VP Sales]
  - Industries: [SaaS, Marketing, Tech]
  - Locations: [USA, Canada]
  - Keywords: [scaling, growth, automation]

Scoring:
  - Title match (CEO in [CEO, ...]) = 30 ✓
  - Industry match (SaaS in [SaaS, ...]) = 30 ✓
  - Keywords (scaling, automation mentioned) = 15
  - Location match (San Francisco in USA) = 10 ✓
  - Recency (updated 2 days ago) = 9
  = 94 points → QUALIFIED, HOT ✓
```

---

### 2. Email Personalization Engine

**Purpose**: Generate personalized email subject & body for each prospect

**Inputs**:
- Prospect data (name, title, company, industry, recent news)
- Client hook (value proposition)
- Email template (variables)

**Algorithm**:

```javascript
async function generatePersonalizedEmail(prospect, client, template) {
  // Get prospect context
  const context = await enrichProspectContext(prospect);
  
  // Use GPT-4 to generate personalization
  const prompt = `
    Generate a personalized cold email for:
    - Prospect: ${prospect.full_name}, ${prospect.title} at ${prospect.company}
    - Their industry: ${prospect.industry}
    - Recent activity: ${context.recentNews}
    - Our value prop: ${client.value_prop}
    - Email goal: ${template.goal}
    
    Requirements:
    - Use their first name
    - Reference something specific about their company
    - Show we understand their industry
    - Include unique hook (not generic)
    - Max 150 words
    - End with clear CTA
  `;
  
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 300
  });
  
  return {
    subject: generateSubject(prospect, context),
    body: response.choices[0].message.content,
    personalizedHook: context.hook
  };
}

function generateSubject(prospect, context) {
  const templates = [
    `Quick idea for ${prospect.company}'s ${prospect.title} role`,
    `${prospect.first_name}, saw ${prospect.company} just ${context.recentActivity}`,
    `${prospect.first_name}'s thoughts on ${context.industry} trends?`,
    `Opportunity for ${prospect.company}`,
    `Quick question about ${prospect.company}'s ${prospect.industry} strategy`
  ];
  
  return selectRandomTemplate(templates);
}
```

**Example Output**:
```
To: john@company.com

Subject: Quick idea for SaaS Company's CEO role

Body:
Hi John,

I noticed SaaS Company just raised a Series B. Congrats!

With your focus on scaling internationally, we help companies like yours automate outbound prospecting and increase qualified meetings by 40%.

[Company name] went from 5 to 20 demos/week using our system.

Quick call next week?

Best,
[Founder]
```

---

### 3. Reply Classification Algorithm

**Purpose**: Automatically classify email replies into intent categories

**Categories**:
- `INTERESTED` - Prospect wants to talk
- `NOT_INTERESTED` - Prospect explicitly declined
- `NEEDS_FOLLOWUP` - Unclear or needs more info
- `BOUNCE` - Email invalid or undeliverable
- `UNSUBSCRIBE` - Prospect asked to be removed

**Algorithm**:

```javascript
async function classifyReply(emailText, prospectContext) {
  const keywords = {
    INTERESTED: [
      'sure', 'yes', 'interested', 'sounds good', 'let\'s talk', 
      'send calendar', 'book a time', 'free next', 'available', 
      'schedule', 'time works', 'call me'
    ],
    NOT_INTERESTED: [
      'no', 'not interested', 'no thanks', 'don\'t', 
      'unsubscribe me', 'remove me', 'not relevant', 'spam'
    ],
    UNSUBSCRIBE: [
      'unsubscribe', 'stop emailing', 'remove', 'opt out'
    ]
  };

  // Simple keyword matching first
  for (const [category, words] of Object.entries(keywords)) {
    const matches = words.filter(word => 
      emailText.toLowerCase().includes(word)
    );
    if (matches.length >= 2) return category;
  }

  // Use AI for ambiguous cases
  const prompt = `
    Classify this reply into one category:
    INTERESTED, NOT_INTERESTED, NEEDS_FOLLOWUP, BOUNCE, UNSUBSCRIBE
    
    Email: "${emailText}"
    
    Prospect context: ${JSON.stringify(prospectContext)}
    
    Reply with ONLY the category.
  `;

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0
  });

  const category = response.choices[0].message.content.trim();
  return category || 'NEEDS_FOLLOWUP';
}
```

**Example Classifications**:
```
Input: "Sounds great! Let's set up a call next Tuesday"
Output: INTERESTED ✓

Input: "Not interested, thanks"
Output: NOT_INTERESTED ✓

Input: "Hi, is this the right email for you?"
Output: NEEDS_FOLLOWUP ✓

Input: "Email Address not found in system"
Output: BOUNCE ✓

Input: "Remove me from this list please"
Output: UNSUBSCRIBE ✓
```

---

### 4. Daily Limit Enforcement Algorithm

**Purpose**: Ensure system respects rate limits and daily caps

**Rules**:
- Max 100 emails/day (configurable)
- Max 500 new prospects/day
- Max 10 emails to same prospect per month
- 3-day cooldown between follow-ups
- Respect user's timezone

**Algorithm**:

```javascript
async function checkDailyLimits(client) {
  const today = startOfDay(now());
  
  // Check email sent today
  const emailsSentToday = await db.query(
    `SELECT COUNT(*) as count FROM messages 
     WHERE client_id = ? AND created_at >= ? AND status IN ('sent', 'dry_run')`,
    [client.id, today]
  );

  if (emailsSentToday[0].count >= client.daily_send_limit) {
    return {
      allowed: false,
      reason: `Daily limit of ${client.daily_send_limit} reached`,
      retryAt: endOfDay(now())
    };
  }

  // Check prospects sourced today
  const prospectsSourced = await db.query(
    `SELECT COUNT(*) as count FROM prospects 
     WHERE client_id = ? AND created_at >= ?`,
    [client.id, today]
  );

  if (prospectsSourced[0].count >= client.daily_prospect_limit) {
    return {
      allowed: false,
      reason: `Daily prospect limit of ${client.daily_prospect_limit} reached`,
      retryAt: endOfDay(now())
    };
  }

  return { allowed: true };
}

async function getProspectsReadyForOutreach(client, limit = 50) {
  const threeDaysAgo = addDays(now(), -3);
  
  return await db.query(`
    SELECT * FROM prospects 
    WHERE client_id = ?
      AND stage IN ('queued', 'contacted')
      AND next_action_at <= NOW()
      AND (last_email_sent IS NULL OR last_email_sent <= ?)
    ORDER BY icp_score DESC, hot DESC
    LIMIT ?
  `, [client.id, threeDaysAgo, limit]);
}
```

---

## 🌳 Decision Trees

### Prospect Routing Decision Tree

```
New Prospect Arrives
│
├─ Valid email?
│  NO → REJECT (add to suppression)
│  YES ↓
│
├─ In suppression list?
│  YES → REJECT (unsubscribed/bounced)
│  NO ↓
│
├─ Already exists in DB?
│  YES → UPDATE & UPDATE STAGE
│  NO → INSERT & STAGE = 'new'
│  ↓
│
├─ Enrich data (Apollo/Hunter)
│  ↓
├─ Calculate ICP score
│  ↓
├─ Score >= 70?
│  NO → KEEP AS 'new', qualified=false
│  YES → MOVE TO 'queued', qualified=true
│  ↓
│  │
│  ├─ Score >= 85?
│  │  YES → Mark as hot=true
│  │  NO → hot=false
│  │
│  └─ Schedule next action (3 days)
```

### Email Sending Decision Tree

```
Time to Send Emails (e.g., 9 AM)
│
├─ Daily limits respected?
│  NO → WAIT until next day
│  YES ↓
│
├─ Get due prospects (stage='queued' AND next_action_at <= now)
│  ↓
├─ Sort by: icp_score DESC, hot DESC
│  ↓
├─ For each prospect:
│  │
│  ├─ Generate personalized email
│  │
│  ├─ Check before sending:
│  │  ├─ Email valid?
│  │  ├─ Sent today < limit?
│  │  └─ Recipient not suppressed?
│  │
│  ├─ YES → Send via Resend API
│  │         Update prospect.stage = 'contacted'
│  │         Log message in DB
│  │         Set next_action_at = now + 3 days
│  │
│  └─ NO → Skip & Log reason
│
└─ Send Slack notification (sent 45/50 emails)
```

### Reply Handling Decision Tree

```
New Reply Received
│
├─ Find matching prospect (by email)
│  NOT FOUND → LOG ERROR, SKIP
│  ↓
│
├─ Classify reply intent
│  ↓
├─ INTERESTED?
│  │
│  YES ├─ Create meeting (calendar invite)
│  │    ├─ Update stage = 'booked'
│  │    ├─ Send confirmation email
│  │    ├─ Notify sales team (Slack)
│  │    └─ Log conversion event
│  │
│  NO ↓
│
├─ NOT_INTERESTED?
│  │
│  YES ├─ Add to suppression list
│  │    ├─ Update stage = 'disqualified'
│  │    ├─ Send unsubscribe confirmation
│  │    └─ Log event
│  │
│  NO ↓
│
├─ UNSUBSCRIBE REQUEST?
│  │
│  YES ├─ Add to suppression (ASAP)
│  │    ├─ Remove from all sequences
│  │    └─ Log compliance event
│  │
│  NO ↓
│
└─ NEEDS_FOLLOWUP?
   ├─ Alert sales team
   ├─ Keep in sequence
   └─ Set manual review flag
```

---

## 📊 Data Models

### Client Table

```javascript
{
  id: UUID,
  name: String,                           // "Acme Marketing"
  contact_email: String,                  // "founder@acme.com"
  
  // ICP Configuration
  icp_titles: String[],                   // ["CEO", "VP Sales", "Founder"]
  icp_industries: String[],               // ["SaaS", "B2B", "Tech"]
  icp_locations: String[],                // ["India", "USA"]
  icp_keywords: String[],                 // ["scaling", "growth"]
  
  // Limits
  daily_prospect_limit: Integer,          // 500
  daily_send_limit: Integer,              // 100
  
  // Integration
  crm_id: String,                         // For CRM sync
  webhook_url: String,                    // Callback URL
  
  status: Enum,                           // "active" | "paused" | "suspended"
  created_at: Timestamp,
  updated_at: Timestamp,
}
```

### Prospect Table

```javascript
{
  id: UUID,
  client_id: UUID,                        // Foreign key
  
  // Contact Info
  email: String,                          // Primary identifier
  full_name: String,
  first_name: String,
  title: String,
  company: String,
  
  // Enriched Data
  linkedin_url: String,
  industry: String,
  location: String,
  company_size: String,
  
  // Scoring
  icp_score: Integer,                     // 0-100
  qualified: Boolean,
  hot: Boolean,                           // High priority
  
  // Pipeline Stage
  stage: Enum,                            // "new" | "qualified" | "queued" | "contacted" | "replied" | "booked" | "disqualified"
  step: Integer,                          // Which email in sequence
  next_action_at: Timestamp,              // When to send next
  
  // Metadata
  source: String,                         // "apollo" | "hunter" | "manual"
  score_reasons: String[],
  
  created_at: Timestamp,
  updated_at: Timestamp,
  
  UNIQUE: (client_id, email)              // One prospect per client per email
}
```

### Message Table

```javascript
{
  id: UUID,
  prospect_id: UUID,                      // Foreign key
  client_id: UUID,                        // Foreign key
  
  // Email Content
  channel: String,                        // "email"
  step: Integer,                          // Sequence step
  subject: String,
  body: String,
  
  // Sending
  status: Enum,                           // "pending" | "sent" | "dry_run" | "failed"
  provider_id: String,                    // Resend message ID
  error: String,                          // If failed
  sent_at: Timestamp,
  
  created_at: Timestamp
}
```

### Event Table (Tracking)

```javascript
{
  id: UUID,
  prospect_id: UUID,
  message_id: UUID,
  
  type: Enum,                             // "sent" | "open" | "click" | "reply" | "bounce" | "unsubscribe"
  meta: JSON,                             // Extra data
  
  // Examples:
  // type: "open" → meta: { timestamp, client_ip, device }
  // type: "click" → meta: { link, timestamp, client_ip }
  // type: "reply" → meta: { reply_body, classification }
  
  created_at: Timestamp
}
```

### Suppression Table

```javascript
{
  email: String,                          // Primary key
  reason: Enum,                           // "unsubscribe" | "bounce" | "complaint" | "invalid"
  prospect_count: Integer,                // How many prospects had this
  created_at: Timestamp
}
```

---

## 🔌 Integration Points

### External APIs

#### 1. Apollo (Prospect Sourcing)
```
GET /api/v1/prospects/search
{
  "query": "SaaS founder India",
  "limit": 100,
  "filters": {
    "titles": ["CEO", "Founder"],
    "industries": ["SaaS"],
    "locations": ["India"]
  }
}

Response: [{email, name, title, company, ...}, ...]
```

#### 2. Hunter (Email Finder)
```
GET /api/v2/domain-search
{
  "domain": "company.com",
  "limit": 100
}

Response: [{email, name, title, ...}, ...]
```

#### 3. Resend (Email Sending)
```
POST /emails
{
  "from": "founder@jarvis.io",
  "to": "prospect@company.com",
  "subject": "...",
  "html": "...",
  "reply_to": "..."
}

Response: { id: "msg_123", created_at, ... }
```

#### 4. OpenAI (AI Features)
```
POST /chat/completions
{
  "model": "gpt-4",
  "messages": [{role, content}, ...],
  "temperature": 0.7,
  "max_tokens": 300
}

Response: { choices: [{ message: { content } }] }
```

#### 5. Webhook (Reply Incoming)
```
POST /webhook/reply (from Resend)
{
  "message_id": "msg_123",
  "from": "prospect@company.com",
  "to": "founder@jarvis.io",
  "subject": "Re: Quick idea...",
  "text": "Sounds great!",
  "timestamp": "2026-07-03T10:00:00Z"
}
```

---

## 📋 Business Rules

### Email Sequencing Rules

```
Rule 1: Multi-Step Sequences
- Step 1: Initial outreach (Day 0)
- Step 2: First follow-up (Day 3, if no reply)
- Step 3: Second follow-up (Day 5, if no reply)
- Step 4: Final touch (Day 7, if no reply)

Rule 2: Personalization
- Every email must include prospect name
- Every email must reference their company or industry
- Subject must be unique (not templated)

Rule 3: Frequency Capping
- Max 1 email per day per prospect
- Min 24 hours between different prospects
- Max 4 emails in 30 days to same prospect

Rule 4: Reply Handling
- INTERESTED: Stop sequence, create meeting
- NOT_INTERESTED: Stop sequence, add to suppression
- NO REPLY BY DAY 7: Mark as "no-response"
```

### Scoring Rules

```
Rule 1: ICP Scoring
- Title match: +30 points
- Industry match: +30 points
- Keywords: +20 points (distributed)
- Location match: +10 points
- Recency bonus: +10 points (decreasing)

Rule 2: Qualification Thresholds
- Score >= 80: Hot prospect (high priority)
- Score 70-79: Qualified (normal priority)
- Score < 70: Not qualified (add later)

Rule 3: Re-scoring
- Re-score every 7 days
- Update score if new data available
- Lower score if prospect engaged negatively
```

### Suppression Rules

```
Rule 1: Automatic Suppression
- Any "unsubscribe" link click
- "bounce" event from email provider
- Complaint/spam report
- Explicit "remove me" in reply

Rule 2: Hard vs Soft Bounce
- Hard bounce (invalid email): Permanent suppression
- Soft bounce (mailbox full): Try again in 3 days

Rule 3: Compliance
- Honor GDPR/CAN-SPAM (unsubscribe links required)
- 48-hour removal after unsubscribe request
- Log all suppression reasons for audit
```

---

## ⚡ Scaling & Performance

### Database Optimization

```sql
-- Indexes for common queries
CREATE INDEX idx_prospects_client_stage 
  ON prospects(client_id, stage);

CREATE INDEX idx_prospects_due 
  ON prospects(client_id, next_action_at) 
  WHERE stage IN ('queued', 'contacted');

CREATE INDEX idx_messages_client_date 
  ON messages(client_id, created_at DESC);

CREATE INDEX idx_events_prospect 
  ON events(prospect_id) 
  WHERE type IN ('reply', 'bounce');

CREATE INDEX idx_suppression_email 
  ON suppression(email);
```

### Caching Strategy

```javascript
// Redis cache for frequently accessed data
cache.set(`client:${clientId}:config`, clientICP, 3600);  // 1 hour
cache.set(`prospects:hot:${clientId}`, hotProspects, 300); // 5 min
cache.set(`limits:${clientId}:today`, limits, 60);         // 1 min
```

### Batch Processing

```javascript
// Instead of sending 100 emails one-by-one
// Process in batches of 10 for better performance
async function sendOutreachBatch(prospects, batchSize = 10) {
  for (let i = 0; i < prospects.length; i += batchSize) {
    const batch = prospects.slice(i, i + batchSize);
    await Promise.all(batch.map(p => sendEmail(p)));
    await delay(1000);  // 1 second between batches (rate limit)
  }
}
```

### Monitoring & Alerts

```javascript
// Alert if reply rate drops below threshold
if (dailyReplyRate < 0.15) {
  slack.sendAlert(
    `⚠️ Reply rate dropped to ${dailyReplyRate}%. Check email quality.`
  );
}

// Alert if daily limits hit
if (emailsSentToday > dailyLimit * 0.9) {
  slack.sendAlert(`📊 Approaching daily limit: ${emailsSentToday}/${dailyLimit}`);
}
```

---

**This document covers the complete business logic, algorithms, and data models for JARVIS PRIME. Use this to onboard new engineers and make strategic decisions.**

