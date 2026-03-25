'use client';

import { Loader2 } from 'lucide-react';
import type { AdminSettings, AuditLog, ChatUser, Report } from '@/lib/types';
import type { AdminOverview } from './chat-types';
import { renderBadgeIcon } from './chat-ui';

export default function AdminDrawer({
  adminTab,
  setAdminTab,
  isLoadingAdmin,
  adminOverview,
  adminUsers,
  adminSettings,
  adminAuditLogs,
  onBack,
  onToggleBan,
  onUpdateUserBadges,
  onSettingsChange,
  onSaveSettings,
}: {
  adminTab: 'overview' | 'users' | 'reports' | 'settings' | 'data' | 'audit';
  setAdminTab: (tab: 'overview' | 'users' | 'reports' | 'settings' | 'data' | 'audit') => void;
  isLoadingAdmin: boolean;
  adminOverview: AdminOverview | null;
  adminUsers: ChatUser[];
  adminSettings: AdminSettings | null;
  adminReports: Report[];
  adminAuditLogs: AuditLog[];
  onBack: () => void;
  onToggleBan: (userId: string) => void;
  onUpdateUserBadges: (userId: string, badge: string | null, isVerified: boolean) => void;
  onSettingsChange: (next: AdminSettings) => void;
  onSaveSettings: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="telegram-panel p-4 md:p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-brand-gold">System Management</h2>
          <button onClick={onBack} className="px-3 md:px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs md:text-sm font-medium transition-colors">
            Back to Chat
          </button>
        </div>
        <div className="flex gap-2 md:gap-4 overflow-x-auto no-scrollbar border-b border-white/10">
          {(['overview', 'users', 'reports', 'settings', 'data', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setAdminTab(tab)}
              className={`pb-2 px-1 text-xs md:text-sm font-medium transition-colors relative whitespace-nowrap ${adminTab === tab ? 'text-brand-gold' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {adminTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-gold" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoadingAdmin ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-gold" /></div>
        ) : adminTab === 'overview' && adminOverview ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Total Users', value: adminOverview.users.total },
              { label: 'New Today', value: adminOverview.users.today },
              { label: 'New This Month', value: adminOverview.users.month },
              { label: 'New This Year', value: adminOverview.users.year },
            ].map((stat) => (
              <div key={stat.label} className="telegram-panel border border-white/10 rounded-2xl p-4 md:p-6 text-center">
                <p className="text-2xl md:text-3xl font-bold text-white mb-1">{stat.value}</p>
                <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : adminTab === 'users' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {adminUsers.map((user) => (
              <div key={user.id} className="telegram-panel border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">{user.username[0]?.toUpperCase() ?? 'U'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-medium truncate">{user.displayName || user.username}</p>
                      {user.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                      {renderBadgeIcon(user.badge)}
                    </div>
                    <p className="text-[10px] text-zinc-500">ID: {user.numericId}</p>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${user.role === 'ADMIN' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-zinc-800 text-zinc-400'}`}>{user.role}</div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <span className={`text-[10px] ${user.isBanned ? 'text-red-500' : 'text-emerald-500'}`}>{user.isBanned ? 'Banned' : 'Active'}</span>
                  {user.role !== 'ADMIN' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={user.badge || ''}
                        onChange={(e) => onUpdateUserBadges(user.id, e.target.value || null, user.isVerified)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-400 focus:outline-none focus:border-brand-gold"
                      >
                        <option value="">No Badge</option>
                        <option value="Support">Support</option>
                        <option value="Seller">Seller</option>
                        <option value="Technical">Technical</option>
                        <option value="Ads">Ads</option>
                      </select>
                      <button onClick={() => onUpdateUserBadges(user.id, user.badge || null, !user.isVerified)} className={`text-[10px] px-3 py-1 rounded-lg transition-colors ${user.isVerified ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-400'}`}>
                        {user.isVerified ? 'Verified' : 'Verify'}
                      </button>
                      <button onClick={() => onToggleBan(user.id)} className={`text-[10px] px-3 py-1 rounded-lg transition-colors ${user.isBanned ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {user.isBanned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : adminTab === 'settings' && adminSettings ? (
          <div className="max-w-2xl space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {[
                { label: 'User Registration', key: 'isRegistrationEnabled', desc: 'Allow new users' },
                { label: 'CAPTCHA Protection', key: 'isCaptchaEnabled', desc: 'Require CAPTCHA' },
              ].map(({ label, key, desc }) => (
                <div key={key} className="telegram-panel border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div><p className="text-sm font-medium">{label}</p><p className="text-[10px] text-zinc-500">{desc}</p></div>
                  <button type="button" onClick={() => onSettingsChange({ ...adminSettings, [key]: !adminSettings[key as keyof AdminSettings] } as AdminSettings)} className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${adminSettings[key as keyof AdminSettings] ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${adminSettings[key as keyof AdminSettings] ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={onSaveSettings} className="bg-brand-gold text-zinc-950 px-6 py-2 rounded-xl font-bold hover:bg-brand-gold/90 transition-colors">
              Save System Settings
            </button>
          </div>
        ) : adminTab === 'audit' ? (
          <div className="telegram-panel border border-white/10 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead className="bg-zinc-950/50 text-zinc-400 border-b border-white/10">
                <tr><th className="px-4 md:px-6 py-4 font-medium">Time</th><th className="px-4 md:px-6 py-4 font-medium">Action</th><th className="px-4 md:px-6 py-4 font-medium">Admin</th><th className="px-4 md:px-6 py-4 font-medium">IP</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {adminAuditLogs.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-500 italic">No audit logs found</td></tr>
                ) : adminAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 md:px-6 py-4 text-zinc-400 whitespace-nowrap text-xs md:text-sm">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 md:px-6 py-4"><span className={`px-2 py-1 rounded-md text-[10px] font-bold ${log.action.includes('SUCCESS') ? 'bg-emerald-500/10 text-emerald-400' : log.action.includes('FAILED') ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>{log.action}</span></td>
                    <td className="px-4 md:px-6 py-4 text-zinc-300 text-xs md:text-sm">{log.admin?.username || '-'}</td>
                    <td className="px-4 md:px-6 py-4 text-zinc-500 font-mono text-xs">{log.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-20 text-zinc-500"><p>Select a tab to view data.</p></div>
        )}
      </div>
    </div>
  );
}
