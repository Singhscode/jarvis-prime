import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const tasks = [
      {
        id: '1',
        name: 'Follow up with Rahul Sharma',
        category: 'lead' as const,
        status: 'pending' as const,
        dueDate: 'Today, 3 PM',
        assignee: 'You',
        priority: 'high' as const,
        description: 'Call TechAgency India - ICP Score 22/25, hot lead',
        progress: 0,
      },
      {
        id: '2',
        name: 'Process Lead List - Apollo',
        category: 'admin' as const,
        status: 'in_progress' as const,
        dueDate: 'Tomorrow',
        assignee: 'System',
        priority: 'medium' as const,
        description: 'Import and score 500 prospects from Apollo.io',
        progress: 65,
      },
      {
        id: '3',
        name: 'Send Day 3 Follow-ups',
        category: 'outreach' as const,
        status: 'completed' as const,
        dueDate: 'Today, 9 AM',
        assignee: 'System',
        priority: 'medium' as const,
        description: 'Automated follow-up sequence for day 3',
        progress: 100,
      },
      {
        id: '4',
        name: 'Meeting Prep - Priya Patel',
        category: 'meeting' as const,
        status: 'pending' as const,
        dueDate: 'Tomorrow, 10 AM',
        assignee: 'You',
        priority: 'high' as const,
        description: 'Prepare demo and proposal for GrowthStartup',
        progress: 30,
      },
      {
        id: '5',
        name: 'Send Cold Email Campaign',
        category: 'outreach' as const,
        status: 'in_progress' as const,
        dueDate: 'Today',
        assignee: 'System',
        priority: 'medium' as const,
        description: 'Batch 2 - 50 personalized emails to marketing agencies',
        progress: 45,
      },
      {
        id: '6',
        name: 'Process Bounced Emails',
        category: 'admin' as const,
        status: 'pending' as const,
        dueDate: 'Tomorrow',
        assignee: 'System',
        priority: 'low' as const,
        description: 'Remove bounced emails from prospect list',
        progress: 0,
      },
    ];

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Tasks API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}
