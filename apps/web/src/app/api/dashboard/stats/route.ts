import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simulated data - replace with real Supabase queries
    const stats = {
      newLeads: 12,
      qualifiedLeads: 8,
      hotLeads: 3,
      emailsSent: 45,
      meetingsBooked: 2,
      pipelineValue: 25,
      conversionRate: 66,
    };

    const activities = [
      {
        id: '1',
        type: 'lead' as const,
        title: 'New Lead: Rahul Sharma',
        description: 'TechAgency India - ICP Score 22/25',
        timestamp: '2 minutes ago',
        status: 'success' as const,
      },
      {
        id: '2',
        type: 'email' as const,
        title: 'Follow-up Email Sent',
        description: 'Priya Patel - Day 2 sequence',
        timestamp: '15 minutes ago',
        status: 'success' as const,
      },
      {
        id: '3',
        type: 'meeting' as const,
        title: 'Meeting Booked',
        description: 'Amit Kumar - Tomorrow at 3 PM',
        timestamp: '1 hour ago',
        status: 'pending' as const,
      },
      {
        id: '4',
        type: 'deal' as const,
        title: 'Deal Won',
        description: 'Mumbai Agency - ₹5L contract',
        timestamp: '3 hours ago',
        status: 'success' as const,
      },
    ];

    const agentStatus = {
      inbound: 'running' as const,
      outreach: 'running' as const,
      prospects: 'stopped' as const,
    };

    return NextResponse.json({
      stats,
      activities,
      agentStatus,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
