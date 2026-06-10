import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const leads = [
      {
        id: '1',
        name: 'Rahul Sharma',
        email: 'rahul@techagency.in',
        company: 'TechAgency India',
        revenue: '5-20L',
        icpScore: 22,
        status: 'qualified' as const,
        lastContact: '2 hours ago',
        nextAction: 'Call today',
      },
      {
        id: '2',
        name: 'Priya Patel',
        email: 'priya@growthstartup.com',
        company: 'GrowthStartup',
        revenue: '1-5L',
        icpScore: 18,
        status: 'contacted' as const,
        lastContact: '5 hours ago',
        nextAction: 'Follow-up email',
      },
      {
        id: '3',
        name: 'Amit Kumar',
        email: 'amit@smallbiz.in',
        company: 'SmallBiz Solutions',
        revenue: '0-1L',
        icpScore: 8,
        status: 'lost' as const,
        lastContact: '1 day ago',
        nextAction: 'Archive',
      },
      {
        id: '4',
        name: 'Neha Singh',
        email: 'neha@creativeagency.in',
        company: 'Creative Agency',
        revenue: '5-20L',
        icpScore: 20,
        status: 'meeting_booked' as const,
        lastContact: '3 hours ago',
        nextAction: 'Meeting tomorrow',
      },
      {
        id: '5',
        name: 'Vikram Sharma',
        email: 'vikram@digitalservices.in',
        company: 'Digital Services',
        revenue: '1-5L',
        icpScore: 16,
        status: 'contacted' as const,
        lastContact: '12 hours ago',
        nextAction: 'Day 2 follow-up',
      },
      {
        id: '6',
        name: 'Shreya Desai',
        email: 'shreya@marketingpro.in',
        company: 'MarketingPro',
        revenue: '20L+',
        icpScore: 24,
        status: 'proposal_sent' as const,
        lastContact: '2 days ago',
        nextAction: 'Proposal follow-up',
      },
    ];

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('Leads API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}
