'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface DashboardStats {
  newLeads: number;
  qualifiedLeads: number;
  hotLeads: number;
  emailsSent: number;
  meetingsBooked: number;
  pipelineValue: number;
  conversionRate: number;
}

interface RecentActivity {
  id: string;
  type: 'lead' | 'email' | 'meeting' | 'deal';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'warning';
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    newLeads: 0,
    qualifiedLeads: 0,
    hotLeads: 0,
    emailsSent: 0,
    meetingsBooked: 0,
    pipelineValue: 0,
    conversionRate: 0,
  });

  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState<Record<string, 'running' | 'stopped' | 'error'>>({
    inbound: 'stopped',
    outreach: 'stopped',
    prospects: 'stopped',
  });

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setActivities(data.activities);
        setAgentStatus(data.agentStatus);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const statCards = [
    {
      label: 'New Leads',
      value: stats.newLeads,
      icon: '📥',
      color: 'from-blue-500/20 to-blue-600/20',
      borderColor: 'border-blue-500/30',
    },
    {
      label: 'Qualified',
      value: stats.qualifiedLeads,
      icon: '✅',
      color: 'from-green-500/20 to-green-600/20',
      borderColor: 'border-green-500/30',
    },
    {
      label: '🔥 Hot Leads',
      value: stats.hotLeads,
      icon: '🌟',
      color: 'from-red-500/20 to-red-600/20',
      borderColor: 'border-red-500/30',
    },
    {
      label: 'Emails Sent',
      value: stats.emailsSent,
      icon: '📧',
      color: 'from-purple-500/20 to-purple-600/20',
      borderColor: 'border-purple-500/30',
    },
    {
      label: 'Calls Booked',
      value: stats.meetingsBooked,
      icon: '📞',
      color: 'from-cyan-500/20 to-cyan-600/20',
      borderColor: 'border-cyan-500/30',
    },
    {
      label: 'Pipeline Value',
      value: `₹${stats.pipelineValue}L`,
      icon: '💰',
      color: 'from-yellow-500/20 to-yellow-600/20',
      borderColor: 'border-yellow-500/30',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              JARVIS PRIME Dashboard
            </h1>
            <p className="text-slate-400">Real-time automation control center</p>
          </div>
          <Link
            href="/"
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition"
          >
            ← Back to Site
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {statCards.map((stat, idx) => (
          <motion.div
            key={idx}
            variants={itemVariants}
            className={`bg-gradient-to-br ${stat.color} border ${stat.borderColor} rounded-xl p-6 backdrop-blur-sm`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-2">{stat.label}</p>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
              </div>
              <span className="text-3xl">{stat.icon}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Agent Status */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mb-12 bg-gradient-to-br from-slate-800/50 to-slate-700/50 border border-slate-600/50 rounded-xl p-8 backdrop-blur-sm"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Agent Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(agentStatus).map(([agent, status]) => (
            <div
              key={agent}
              className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-600/50"
            >
              <div>
                <p className="text-white font-semibold capitalize">{agent} Agent</p>
                <p className="text-sm text-slate-400">
                  {status === 'running' && '✅ Running'}
                  {status === 'stopped' && '⏸ Stopped'}
                  {status === 'error' && '❌ Error'}
                </p>
              </div>
              <span
                className={`w-3 h-3 rounded-full ${
                  status === 'running'
                    ? 'bg-green-500 animate-pulse'
                    : status === 'error'
                    ? 'bg-red-500'
                    : 'bg-slate-500'
                }`}
              />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="bg-gradient-to-br from-slate-800/50 to-slate-700/50 border border-slate-600/50 rounded-xl p-8 backdrop-blur-sm"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Recent Activity</h2>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              No activity yet. Check back later!
            </p>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-600/50 hover:border-slate-500/50 transition"
              >
                <div className="flex-1">
                  <p className="text-white font-semibold">{activity.title}</p>
                  <p className="text-sm text-slate-400">{activity.description}</p>
                  <p className="text-xs text-slate-500 mt-1">{activity.timestamp}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    activity.status === 'success'
                      ? 'bg-green-500/20 text-green-300'
                      : activity.status === 'pending'
                      ? 'bg-yellow-500/20 text-yellow-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {activity.status.toUpperCase()}
                </span>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
