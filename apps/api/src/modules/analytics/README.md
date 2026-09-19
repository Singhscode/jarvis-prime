# Phase 12 Analytics & Reporting

Analytics & Reporting module for Jarvis Prime. Provides dashboard metrics, revenue reports, daily aggregations, and operational insights across CRM, Finance, Communication, and Automation modules.

## Architecture

```
Existing Platform Data (all modules)
    ↓
analytics.repository.js (scoped queries)
    ↓
analytics.service.js (business logic, auth)
    ↓
analytics.routes.js (HTTP API)
    ↓
Owner Dashboard / Reports
```

## Database Schema

### `analytics_daily_metrics` Table

Stores daily roll-ups across all operational domains:

- **Primary Key**: `id` (UUID)
- **Composite Unique**: `(owner_user_id, metric_date)`
- **Tenant Isolation**: All queries filtered by `owner_user_id`
- **RLS Enabled**: Row-level security enforces owner isolation

#### Columns

**Ownership & Time**
- `owner_user_id` — Owner account ID (FK users)
- `metric_date` — UTC date (YYYY-MM-DD)
- `created_at` — Immutable creation timestamp
- `updated_at` — Updated via trigger

**CRM Metrics**
- `crm_leads_created` — Leads created that day
- `crm_leads_qualified` — Leads qualified that day
- `crm_leads_converted` — Leads converted to clients that day

**Finance Metrics**
- `finance_revenue_minor` — Revenue in minor units (cents/paise)
- `finance_invoices_issued` — Invoices issued that day
- `finance_payments_received_minor` — Payments received (minor units)
- `finance_expenses_submitted` — Expenses submitted that day

**Communication Metrics**
- `communication_threads_created` — Threads created that day
- `communication_messages_sent` — Messages sent that day
- `communication_delivery_failed` — Delivery failures that day

**Automation Metrics**
- `automation_runs_completed` — Runs completed successfully
- `automation_runs_failed` — Runs that failed
- `automation_work_items_completed` — Work items completed

## API Endpoints

All endpoints require JWT authentication. Owner-only access for MVP.

### Dashboard Overview
```
GET /api/analytics/dashboard
```
Returns consolidated metrics across all modules.

**Response**:
```json
{
  "overview": {
    "revenue": { "totalMinor": 500000, "totalMajor": 5000, "currencyCode": "INR" },
    "clients": 10,
    "activeClients": 8,
    "newClientsThisMonth": 2,
    "projects": 5,
    "tasks": { "total": 100, "completed": 75, "completionRate": 75.0 },
    "leads": 25,
    "expenses": { "total": 50, "approved": 40, "totalMinor": 250000, "totalMajor": 2500 }
  },
  "activity24h": {
    "messagesSent": 25,
    "threadsCreated": 5,
    "automationRuns": { "completed": 5, "failed": 1 }
  },
  "generatedAt": "2026-09-16T23:30:00.000Z"
}
```

### Revenue Report
```
GET /api/analytics/revenue?start=YYYY-MM-DD&end=YYYY-MM-DD
```
Revenue aggregation for date range.

**Query Parameters**:
- `start` — Start date (required, format: YYYY-MM-DD)
- `end` — End date (required, format: YYYY-MM-DD)

**Response**:
```json
{
  "period": { "start": "2026-09-01", "end": "2026-09-30" },
  "revenue": {
    "totalMinor": 500000,
    "totalMajor": 5000,
    "currencyCode": "INR",
    "averagePerInvoiceMinor": 100000,
    "averagePerInvoiceMajor": 1000
  },
  "invoiceCount": 5,
  "generatedAt": "2026-09-16T23:30:00.000Z"
}
```

### Daily Metrics
```
GET /api/analytics/daily?start=YYYY-MM-DD&end=YYYY-MM-DD
```
Day-by-day metrics for trend analysis.

**Response**:
```json
{
  "period": { "start": "2026-09-01", "end": "2026-09-30" },
  "metrics": [
    {
      "date": "2026-09-01",
      "crm": { "leadsCreated": 5, "leadsQualified": 2, "leadsConverted": 1 },
      "finance": { "revenueMinor": 100000, "revenueMajor": 1000, ... },
      "communication": { "threadsCreated": 10, "messagesSent": 50, ... },
      "automation": { "runsCompleted": 3, "runsFailed": 0, ... }
    }
  ],
  "count": 30,
  "generatedAt": "2026-09-16T23:30:00.000Z"
}
```

### Client Metrics
```
GET /api/analytics/clients
```
Client counts and activity.

### Project Metrics
```
GET /api/analytics/projects
```
Project statistics.

### Task Metrics
```
GET /api/analytics/tasks
```
Task counts and completion rate.

### Lead Metrics
```
GET /api/analytics/leads
```
CRM lead counts.

### Communication Metrics
```
GET /api/analytics/communication
```
Last 24 hours communication activity.

### Automation Metrics
```
GET /api/analytics/automation
```
Last 24 hours automation run statistics.

### Expense Metrics
```
GET /api/analytics/expenses
```
Expense counts and totals.

## Service Layer

### `analytics.repository.js`

Database access layer with scoped queries:

- `getDailyMetrics(ownerUserId, startDate, endDate)` — Get daily metrics for date range
- `getRevenueStats(ownerUserId, startDate, endDate)` — Sum revenue across period
- `getClientStats(ownerUserId)` — Count clients (total, active, new this month)
- `getProjectStats(ownerUserId)` — Count projects
- `getTaskStats(ownerUserId)` — Count tasks (total, completed, completion rate)
- `getLeadStats(ownerUserId)` — Count leads
- `getCommunicationStats(ownerUserId)` — Last 24h message/thread stats
- `getAutomationStats(ownerUserId)` — Last 24h run completion stats
- `getExpenseStats(ownerUserId)` — Count expenses (total, approved, totals)

### `analytics.service.js`

Business logic and authorization:

- `scope(userId)` — Derive analytics scope (Owner-only MVP)
- `parseDate(dateStr)` — Parse and validate date strings
- `getDashboard(userId)` — Overview dashboard
- `getRevenueReport(userId, startDate, endDate)` — Revenue aggregation
- `getDailyMetrics(userId, startDate, endDate)` — Daily trend data
- `getClientsReport(userId)`
- `getProjectsReport(userId)`
- `getTasksReport(userId)`
- `getLeadsReport(userId)`
- `getCommunicationReport(userId)`
- `getAutomationReport(userId)`
- `getExpensesReport(userId)`

## Authorization

### Scope Derivation

**MVP (Owner-only)**:
1. Check user is active (`status = 'active'`)
2. Check user has Owner role (`role = 'client'`)
3. Check user is NOT a client portal member (no `client_portal_memberships` row)

**Future (Employee with permission)**:
- Check `finance_employee_permissions` for `analytics.read`
- Allow employee to see analytics for their owner's account

### RLS & Tenant Isolation

All queries enforce `owner_user_id` isolation:

```sql
SELECT * FROM analytics_daily_metrics
WHERE owner_user_id = $1  -- Always filtered by owner
AND metric_date >= $2
AND metric_date <= $3
```

RLS policy ensures database-level isolation:
```sql
CREATE POLICY "analytics_owner_isolation"
  ON analytics_daily_metrics
  FOR ALL
  USING (owner_user_id = auth.uid())
```

## Performance Considerations

### Index Strategy

```sql
CREATE INDEX idx_analytics_daily_metrics_owner_date 
  ON analytics_daily_metrics(owner_user_id, metric_date DESC);
```

Enables efficient queries:
- Filter by `owner_user_id` (most selective, first)
- Order by `metric_date DESC` (trending, recent first)

### Query Patterns

**Single day**:
```javascript
await repo.getDailyMetrics(ownerUserId, '2026-09-01', '2026-09-01')
```

**7-day trend**:
```javascript
const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
await repo.getDailyMetrics(ownerUserId, sevenDaysAgo, today)
```

**Monthly aggregation**:
```javascript
// Client-side grouping for calendar month
const metricsByMonth = dailyMetrics.reduce((acc, m) => {
  const month = m.date.slice(0, 7);  // YYYY-MM
  acc[month] = (acc[month] || 0) + m.crm.leadsCreated;
  return acc;
}, {});
```

### No N+1 Queries

All dashboard metrics fetched in parallel:
```javascript
const [revenue, clients, projects, tasks, ...] = await Promise.all([
  repo.getRevenueStats(...),
  repo.getClientStats(...),
  ...
]);
```

### Caching (Future)

Dashboard metrics can be cached 1-6 hours:
- Invalidate on CRM/Finance/Communication mutations
- Daily metrics immutable (can cache 24h+)

## Testing

### Unit Tests: `analytics.test.js`

- Date parsing and validation
- Metric calculations
- Tenant isolation contracts
- Authorization scope
- Edge cases (empty datasets, null values, boundaries)
- Response formats
- Currency conversion

Run:
```bash
npm run test -- apps/api/test/analytics.test.js
```

### Integration Tests: `analytics.postgres.integration.js`

- Table creation and constraints
- UNIQUE constraint enforcement
- CHECK constraint enforcement
- Date range validation
- RLS tenant isolation
- Composite index efficiency
- Aggregation queries
- Data type validation
- Pagination

Run:
```bash
npm run test -- apps/api/integration/analytics.postgres.integration.js
```

## Migration

**File**: `database/supabase/migrations/20260810000041_add_analytics_schema.sql`

Creates:
- `analytics_daily_metrics` table
- Composite unique index on (owner_user_id, metric_date)
- Date index for efficient range queries
- RLS policies for tenant isolation
- Triggers for updated_at

Check migration status:
```bash
npm run db:status
```

## Security

### Authentication Required

All analytics endpoints require valid JWT token:
```javascript
router.use(createAuthMiddleware({ required: true }));
```

### Authorization Enforced

Every service function calls `scope(userId)` to verify access before querying:
- Only Owners (MVP)
- Only Employees with `analytics.read` permission (future)

### Tenant Isolation

- Database: RLS policies
- Application: Every query includes `owner_user_id` filter
- Composite indexes: Enable fast scoped lookups

### Data Redaction

No sensitive data exposed:
- Connection strings never logged
- Raw invoice/payment amounts converted to display format
- No customer PII in analytics
- No internal employee identifiers

## Usage Examples

### Get Dashboard Overview
```javascript
const response = await fetch('http://localhost:3001/api/analytics/dashboard', {
  headers: { Authorization: `Bearer ${jwtToken}` }
});
const { data } = await response.json();
console.log(data.overview.revenue.totalMajor);  // Revenue in INR
```

### Get 30-Day Revenue Trend
```javascript
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
const today = new Date().toISOString().split('T')[0];

const response = await fetch(
  `http://localhost:3001/api/analytics/daily?start=${thirtyDaysAgo}&end=${today}`,
  { headers: { Authorization: `Bearer ${jwtToken}` } }
);
const { data } = await response.json();

// Group by week and sum revenue
const byWeek = data.metrics.reduce((acc, m) => {
  const week = Math.floor((new Date(m.date).getTime() - new Date(thirtyDaysAgo).getTime()) / (7 * 86400000));
  acc[week] = (acc[week] || 0) + m.finance.revenueMajor;
  return acc;
}, {});
```

## Future Extensions (Phase 12.1+)

- Custom dashboards (user-configurable widgets)
- Scheduled reports (nightly email)
- Export formats (PDF, Excel)
- Predictive analytics (ML-driven forecasts)
- Real-time dashboards (Realtime subscription)
- Employee analytics.read permission type
- Report access audit trail
- Data retention policy / archival
- Materialized views for monthly summaries
- Background job for nightly metric aggregation
