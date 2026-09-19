// Types for GET /api/analytics/dashboard.
// Mirrors the response shape returned by
// apps/api/src/modules/analytics/analytics.service.js `getDashboard`.

export type AnalyticsDashboard = {
  overview: {
    revenue: { totalMinor: number; totalMajor: number; currencyCode: string };
    clients: number;
    activeClients: number;
    newClientsThisMonth: number;
    projects: number;
    tasks: { total: number; completed: number; completionRate: number };
    leads: number;
    expenses: { total: number; approved: number; totalMinor: number; totalMajor: number };
  };
  activity24h: {
    messagesSent: number;
    threadsCreated: number;
    automationRuns: { completed: number; failed: number };
  };
  generatedAt: string;
};
