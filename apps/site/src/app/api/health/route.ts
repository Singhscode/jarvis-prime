import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Keep Supabase project active by making a simple query
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Simple health check query
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      return Response.json(
        { status: 'error', message: error.message },
        { status: 500 }
      );
    }

    return Response.json(
      { 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        supabase_active: true
      },
      { status: 200 }
    );
  } catch (err) {
    return Response.json(
      { 
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
