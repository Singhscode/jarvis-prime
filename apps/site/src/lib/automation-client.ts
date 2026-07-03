/**
 * Automation Client
 * Website calls the unified engine server for all automations
 * All API keys are kept in /engine/.env, not on website
 */

export interface AutomationRequest {
  action: string;
  params?: Record<string, any>;
  dry_run?: boolean;
  prospect?: Record<string, any>;
  step?: number;
}

export interface AutomationResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

// Get engine server URL from environment
function getEngineUrl(): string {
  const url = process.env.NEXT_PUBLIC_ENGINE_SERVER_URL;
  if (!url) {
    console.warn('NEXT_PUBLIC_ENGINE_SERVER_URL not set. Automation features will be unavailable.');
    return '';
  }
  return url;
}

// Get shared secret from server-side environment (SSR only)
function getEngineSecret(): string {
  return process.env.AUTOMATION_SERVER_SECRET || '';
}

/**
 * Make authenticated request to engine server
 * Should only be called from Next.js API routes (server-side)
 */
export async function callEngineServer<T = any>(
  path: string,
  request: AutomationRequest
): Promise<AutomationResponse<T>> {
  const url = getEngineUrl();
  const secret = getEngineSecret();

  if (!url) {
    return {
      success: false,
      error: 'Engine server not configured',
    };
  }

  if (!secret) {
    return {
      success: false,
      error: 'Engine secret not configured',
    };
  }

  try {
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-automation-secret': secret,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error || `HTTP ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    console.error('Engine client error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check engine server health (public endpoint, no auth)
 */
export async function checkEngineHealth(): Promise<boolean> {
  const url = getEngineUrl();

  if (!url) return false;

  try {
    const response = await fetch(`${url}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Enrichment operations
 */
export async function enrichProspects<T = any>(
  action: string,
  params?: Record<string, any>,
  dryRun?: boolean
): Promise<AutomationResponse<T>> {
  return callEngineServer('/api/enrichment', {
    action,
    params,
    dry_run: dryRun,
  });
}

/**
 * Outreach operations
 */
export async function sendOutreach<T = any>(
  action: string,
  prospect?: Record<string, any>,
  step?: number,
  dryRun?: boolean
): Promise<AutomationResponse<T>> {
  return callEngineServer('/api/outreach', {
    action,
    prospect,
    step,
    dry_run: dryRun,
  });
}
