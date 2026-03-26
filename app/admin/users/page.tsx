'use client';

import { useState, useEffect } from 'react';
import { getUsers, updateUserRole, updateUserBadge, toggleUserVerification } from '@/app/actions/admin';
import { Shield, BadgeCheck, Search, ShieldAlert, Headset, ShoppingBag, Wrench, Megaphone, Loader2 } from 'lucide-react';

type AdminUserRow = {
  id: string;
  username: string;
  displayName?: string | null;
  role: string;
  badge?: string | null;
  isVerified: boolean;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setIsLoading(true);
    const { users } = await getUsers();
    if (users) setUsers(users);
    setIsLoading(false);
  }

  const handleRoleChange = async (userId: string, role: string) => {
    await updateUserRole(userId, role);
    loadUsers();
  };

  const handleBadgeChange = async (userId: string, badge: string | null) => {
    await updateUserBadge(userId, badge);
    loadUsers();
  };

  const handleVerificationToggle = async (userId: string, currentStatus: boolean) => {
    await toggleUserVerification(userId, !currentStatus);
    loadUsers();
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) || 
    (u.displayName && u.displayName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand-gold/10 rounded-2xl">
              <Shield className="w-8 h-8 text-brand-gold" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
              <p className="text-zinc-400">Manage roles, badges, and verification status.</p>
            </div>
          </div>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl focus:outline-none focus:border-brand-gold text-sm w-64"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
          </div>
        ) : (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-medium text-zinc-400">User</th>
                  <th className="px-6 py-4 font-medium text-zinc-400">Role</th>
                  <th className="px-6 py-4 font-medium text-zinc-400">Badge</th>
                  <th className="px-6 py-4 font-medium text-zinc-400 text-center">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-brand-gold">
                          {user.displayName?.[0] || user.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold flex items-center gap-1">
                            {user.displayName || user.username}
                            {user.role === 'ADMIN' && <ShieldAlert className="w-3 h-3 text-brand-gold" />}
                          </p>
                          <p className="text-xs text-zinc-500 font-mono">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-gold"
                      >
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.badge || ''}
                        onChange={(e) => handleBadgeChange(user.id, e.target.value || null)}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-gold"
                      >
                        <option value="">None</option>
                        <option value="Support">Support</option>
                        <option value="Seller">Seller</option>
                        <option value="Technical">Technical</option>
                        <option value="Ads">Ads</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleVerificationToggle(user.id, user.isVerified)}
                        className={`p-2 rounded-full transition-colors ${
                          user.isVerified ? 'bg-blue-500/20 text-blue-500' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                        }`}
                        title={user.isVerified ? 'Remove verification' : 'Verify user'}
                      >
                        <BadgeCheck className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
