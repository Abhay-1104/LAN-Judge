import { useEffect, useMemo, useState } from 'react';
import { Search, KeyRound, Ban, CheckCircle, Trash2, Shield, ShieldCheck, X } from 'lucide-react';
import api from '../../api/client';
import { Card, Avatar, Input, Button, Skeleton, useToast } from '../../components/ui';

export default function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [requests, setRequests] = useState(null);
  const [search, setSearch] = useState('');

  const load = () => {
    api.get('/users').then(({ data }) => setUsers(data.users));
    api.get('/users/admin-requests').then(({ data }) => setRequests(data.requests));
  };
  useEffect(() => { load(); }, []);

  const approveAdmin = async (u) => {
    await api.post(`/users/${u.id}/approve-admin`);
    toast(`${u.name} is now an admin`, 'success');
    load();
  };

  const rejectAdmin = async (u) => {
    await api.post(`/users/${u.id}/reject-admin`);
    toast(`Admin request for ${u.name} rejected`, 'info');
    load();
  };

  const filtered = useMemo(() => {
    if (!users) return [];
    return users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
  }, [users, search]);

  const toggleStatus = async (u) => {
    const status = u.status === 'active' ? 'disabled' : 'active';
    await api.put(`/users/${u.id}/status`, { status });
    toast(`${u.name} ${status === 'active' ? 'activated' : 'deactivated'}`, 'success');
    load();
  };

  const toggleRole = async (u) => {
    const role = u.role === 'admin' ? 'student' : 'admin';
    await api.put(`/users/${u.id}/role`, { role });
    toast(`${u.name} is now ${role}`, 'success');
    load();
  };

  const resetPassword = async (u) => {
    const { data } = await api.post(`/users/${u.id}/reset-password`);
    toast(`Temp password for ${u.name}: ${data.tempPassword}`, 'success');
  };

  const remove = async (u) => {
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast(`${u.name} deleted`, 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to delete user', 'error');
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-text-secondary text-sm mt-1">{users ? `${users.length} registered users` : 'Loading…'}</p>
      </div>

      {requests && requests.length > 0 && (
        <Card className="p-5 border-secondary/30 bg-secondary/5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={17} className="text-secondary" />
            <h2 className="font-semibold">Pending Admin/Professor Requests</h2>
            <span className="text-xs text-text-secondary bg-white/5 rounded-full px-2 py-0.5">{requests.length}</span>
          </div>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
                <Avatar name={r.name} color={r.avatar_color} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{r.name}</p>
                  <p className="text-text-secondary text-xs truncate">{r.email}{r.college_id ? ` · ${r.college_id}` : ''}</p>
                </div>
                <Button onClick={() => approveAdmin(r)} className="!px-3 !py-1.5 text-xs shrink-0">
                  <CheckCircle size={13} /> Approve
                </Button>
                <Button variant="ghost" onClick={() => rejectAdmin(r)} className="!px-3 !py-1.5 text-xs shrink-0">
                  <X size={13} /> Reject
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </Card>

      {!users ? (
        <Skeleton className="h-72" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-border">
                  <th className="py-3 px-5 font-medium">Student</th>
                  <th className="py-3 px-5 font-medium">Role</th>
                  <th className="py-3 px-5 font-medium">Solved</th>
                  <th className="py-3 px-5 font-medium">Status</th>
                  <th className="py-3 px-5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} color={u.avatar_color} size={30} />
                        <div>
                          <p className="font-medium leading-tight">{u.name}</p>
                          <p className="text-text-secondary text-xs">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-5 capitalize">{u.role}</td>
                    <td className="py-2.5 px-5 text-text-secondary">{u.solved}</td>
                    <td className="py-2.5 px-5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.status === 'active' ? 'text-primary bg-primary/10' : 'text-error bg-error/10'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-5">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Reset password" onClick={() => resetPassword(u)} className="p-1.5 text-text-secondary hover:text-secondary rounded-lg hover:bg-white/5"><KeyRound size={14} /></button>
                        <button title="Toggle admin" onClick={() => toggleRole(u)} className="p-1.5 text-text-secondary hover:text-warning rounded-lg hover:bg-white/5"><Shield size={14} /></button>
                        <button title={u.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => toggleStatus(u)} className="p-1.5 text-text-secondary hover:text-primary rounded-lg hover:bg-white/5">
                          {u.status === 'active' ? <Ban size={14} /> : <CheckCircle size={14} />}
                        </button>
                        <button title="Delete" onClick={() => remove(u)} className="p-1.5 text-text-secondary hover:text-error rounded-lg hover:bg-white/5"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
