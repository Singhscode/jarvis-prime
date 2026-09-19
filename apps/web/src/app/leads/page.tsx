'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  revenue: string;
  icpScore: number;
  status: 'new' | 'contacted' | 'qualified' | 'meeting_booked' | 'proposal_sent' | 'won' | 'lost';
  lastContact: string;
  nextAction: string;
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [tabVisible, setTabVisible] = useState(true);
  const PAGE_SIZE = 20;

  // Track tab visibility for UI state
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        setTabVisible(!document.hidden);
      }
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchLeads(0, PAGE_SIZE);

    // Visibility-gated polling - only run when tab is visible
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchLeads(page * PAGE_SIZE, PAGE_SIZE);
      }
    }, 30000);

    return () => {
      clearInterval(pollInterval);
      // Cleanup on unmount to prevent stale state
      setLoading(false);
    };
  }, [page, tabVisible]);

  const fetchLeads = async (offset = 0, limit = PAGE_SIZE) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/leads?offset=${offset}&limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        setLeads(data.leads);
        setHasMore(data.hasMore ?? false);
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (hasMore) {
      setPage((prev) => prev + 1);
      fetchLeads((page + 1) * PAGE_SIZE, PAGE_SIZE);
    }
  };

  const handleManualRefresh = () => {
    if (tabVisible) {
      fetchLeads(0, PAGE_SIZE);
      setPage(0);
    }
  };

  const filteredLeads =
    filter === 'all' ? leads : leads.filter((l) => l.status === filter);

  const getScoreColor = (score: number) => {
    if (score >= 20) return 'text-red-400 font-bold';
    if (score >= 15) return 'text-orange-400 font-bold';
    return 'text-slate-400';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      contacted: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      qualified: 'bg-green-500/20 text-green-300 border-green-500/30',
      meeting_booked: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      proposal_sent: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      won: 'bg-green-600/20 text-green-200 border-green-600/30',
      lost: 'bg-red-500/20 text-red-300 border-red-500/30',
    };
    return colors[status] || colors.new;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Lead Management</h1>
          <p className="text-slate-400">Track and manage all incoming and qualified leads</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleManualRefresh}
            disabled={loading || !tabVisible}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              !tabVisible
                ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
            }`}
            title={!tabVisible ? 'Tab hidden - will refresh when visible' : 'Refresh leads now'}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-4">
        {['all', 'new', 'contacted', 'qualified', 'meeting_booked', 'won', 'lost'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition ${
              filter === f
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
            }`}
          >
            {f === 'all'
              ? 'All'
              : f === 'meeting_booked'
              ? 'Meeting Booked'
              : f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Leads Table */}
      <div className="overflow-x-auto">
        <div className="bg-gradient-to-br from-slate-800/50 to-slate-700/50 border border-slate-600/50 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-600/50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                  Company
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                  Revenue
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                  ICP Score
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                  Last Contact
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">
                  Next Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    Loading leads...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    No leads found
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-slate-600/30 hover:bg-slate-700/30 transition"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">{lead.name}</p>
                        <p className="text-xs text-slate-400">{lead.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white">{lead.company}</td>
                    <td className="px-6 py-4 text-slate-300">{lead.revenue}</td>
                    <td className={`px-6 py-4 ${getScoreColor(lead.icpScore)}`}>
                      {lead.icpScore}/25
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs font-semibold px-3 py-1 rounded-full border ${getStatusBadge(
                          lead.status
                        )}`}
                      >
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{lead.lastContact}</td>
                    <td className="px-6 py-4 text-sm text-cyan-400">{lead.nextAction}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {hasMore && !loading && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMore}
            className="px-6 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-600/50 transition"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
