'use client';

import { useState } from 'react';
import { Shield, Users, AlertTriangle, Settings, Database, Download, Upload, Ban, Trash2, CheckCircle } from 'lucide-react';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('users');

  // Mock Data
  const users = [
    { id: '1', username: 'ehsanking', role: 'ADMIN', status: 'ACTIVE', ip: '192.168.1.1' },
    { id: '2', username: 'johndoe', role: 'USER', status: 'ACTIVE', ip: '10.0.0.5' },
    { id: '3', username: 'spammer99', role: 'USER', status: 'BANNED', ip: '172.16.0.2' },
  ];

  const reports = [
    { id: '101', reporter: 'johndoe', reported: 'spammer99', reason: 'Sending spam messages', status: 'PENDING' },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans">
      
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
          <Shield className="w-6 h-6 text-emerald-500" />
          <h2 className="text-xl font-bold text-zinc-50">Admin Panel</h2>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
              activeTab === 'users' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50'
            }`}
          >
            <Users className="w-5 h-5" /> Users & Bans
          </button>
          
          <button
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
              activeTab === 'reports' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50'
            }`}
          >
            <AlertTriangle className="w-5 h-5" /> Reports
            <span className="ml-auto bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">1</span>
          </button>
          
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
              activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50'
            }`}
          >
            <Settings className="w-5 h-5" /> System Settings
          </button>
          
          <button
            onClick={() => setActiveTab('data')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
              activeTab === 'data' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50'
            }`}
          >
            <Database className="w-5 h-5" /> Import / Export
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-zinc-800 flex items-center px-8 bg-zinc-900/30">
          <h1 className="text-lg font-semibold capitalize">{activeTab.replace('-', ' ')}</h1>
        </header>
        
        <main className="flex-1 overflow-y-auto p-8">
          
          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 font-medium">Username</th>
                      <th className="px-6 py-4 font-medium">Role</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Last IP</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-zinc-50">{user.username}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${user.role === 'ADMIN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${user.status === 'ACTIVE' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-500 font-mono text-xs">{user.ip}</td>
                        <td className="px-6 py-4 flex justify-end gap-2">
                          {user.status === 'ACTIVE' ? (
                            <button className="p-2 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors" title="Ban User">
                              <Ban className="w-4 h-4" />
                            </button>
                          ) : (
                            <button className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors" title="Unban User">
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete User">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 font-medium">Reporter</th>
                      <th className="px-6 py-4 font-medium">Reported User</th>
                      <th className="px-6 py-4 font-medium">Reason</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {reports.map((report) => (
                      <tr key={report.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-zinc-50">{report.reporter}</td>
                        <td className="px-6 py-4 font-medium text-red-400">{report.reported}</td>
                        <td className="px-6 py-4 text-zinc-400">{report.reason}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400">
                            {report.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 flex justify-end gap-2">
                          <button className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors text-xs font-medium">
                            Resolve
                          </button>
                          <button className="px-3 py-1.5 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 rounded-lg transition-colors text-xs font-medium">
                            Dismiss
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4">
                  <Download className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="text-lg font-medium text-zinc-50 mb-2">Export Data</h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Download a complete JSON backup of users, groups, and settings. Note: E2EE messages cannot be decrypted by the server.
                </p>
                <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-50 font-medium py-2.5 rounded-xl transition-colors">
                  Generate Backup
                </button>
              </div>
              
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
                  <Upload className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-lg font-medium text-zinc-50 mb-2">Import Data</h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Restore the system from a previous JSON backup. This will overwrite existing conflicting records.
                </p>
                <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-50 font-medium py-2.5 rounded-xl transition-colors">
                  Upload Backup File
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
