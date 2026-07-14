import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getDatabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function toDashboardLead(lead: Record<string, unknown>) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    company: lead.company || '',
    revenue: lead.revenue || '',
    icpScore: lead.icp_score || 0,
    status: lead.status,
    lastContact: lead.last_contact_at || lead.updated_at || lead.created_at || '',
    nextAction: lead.next_action || '',
  };
}

export async function GET() {
  try {
    const { data, error } = await getDatabase()
      .from('leads')
      .select('id, name, email, company, revenue, icp_score, status, last_contact_at, next_action, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ leads: (data || []).map(toDashboardLead) });
  } catch (error) {
    console.error('Leads API error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { prospects } = await request.json();
    if (!Array.isArray(prospects)) return NextResponse.json({ error: 'prospects must be an array' }, { status: 400 });
    const rows = prospects.filter((prospect) => prospect?.email).map((prospect) => ({
      name: `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || prospect.email,
      email: prospect.email,
      phone: prospect.phone || null,
      title: prospect.title || null,
      company: prospect.company || null,
      linkedin_url: prospect.linkedin_url || null,
      icp_score: prospect.icp_score || null,
      data_quality: prospect.data_quality || null,
      source: prospect.source || 'apollo',
      status: prospect.status || 'new',
      enriched_at: prospect.enriched_at || null,
    }));
    const { error } = await getDatabase().from('leads').upsert(rows, { onConflict: 'email' });
    if (error) throw error;
    return NextResponse.json({ ok: true, stored: rows.length });
  } catch (error) {
    console.error('Leads API error:', error);
    return NextResponse.json({ error: 'Failed to store leads' }, { status: 500 });
  }
}
