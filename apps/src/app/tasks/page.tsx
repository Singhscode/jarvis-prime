'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface Task {
  id: string;
  name: string;
  category: 'lead' | 'outreach' | 'meeting' | 'admin';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dueDate: string;
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
  progress: number;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks =
    filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  const statusColors = {
    pending: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    in_progress: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-300 border-green-500/30',
    failed: 'bg-red-500/20 text-red-300 border-red-500/30',
  };

  const priorityColors = {
    low: 'text-slate-400',
    medium: 'text-yellow-400',
    high: 'text-red-400',
  };

  const categoryIcons = {
    lead: '📥',
    outreach: '📧',
    meeting: '📞',
    admin: '⚙️',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Tasks & Operations</h1>
          <p className="text-slate-400">Manage daily operations and workflows</p>
        </div>
        <Link
          href="/dashboard"
          className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-8 overflow-x-auto pb-4">
        {['all', 'pending', 'in_progress', 'completed', 'failed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition ${
              filter === f
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
            }`}
          >
            {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Tasks List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-400">Loading tasks...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400">No tasks found</p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-slate-800/50 to-slate-700/50 border border-slate-600/50 rounded-lg p-6 hover:border-slate-500/50 transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{categoryIcons[task.category]}</span>
                    <h3 className="text-xl font-bold text-white">{task.name}</h3>
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                        statusColors[task.status]
                      }`}
                    >
                      {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm">{task.description}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${priorityColors[task.priority]}`}>
                    {task.priority.toUpperCase()}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400">Progress</p>
                  <p className="text-xs text-slate-400">{task.progress}%</p>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${task.progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div>
                  <p>
                    Assigned to: <span className="text-slate-300 font-semibold">{task.assignee}</span>
                  </p>
                </div>
                <p>Due: {task.dueDate}</p>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
