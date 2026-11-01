import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, Ban, Activity, Download, Trash2 } from 'lucide-react';
import api from '../../api/client';
import { Card, Button, Input, Select, Skeleton, useToast, DifficultyBadge, ConfirmDialog } from '../../components/ui';

const statusStyle = {
  Live: 'text-primary bg-primary/10 border-primary/30',
  Upcoming: 'text-warning bg-warning/10 border-warning/30',
  Finished: 'text-text-secondary bg-white/5 border-border',
};

export default function ContestManagement() {
  const toast = useToast();
  const [contests, setContests] = useState(null);
  const [problems, setProblems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', startTime: '', endTime: '', visibility: 'public', pin: '', problemIds: [], points: {} });

  const load = () => api.get('/contests').then(({ data }) => setContests(data.contests));

  useEffect(() => {
    load();
    api.get('/problems').then(({ data }) => setProblems(data.problems));
  }, []);

  const toggleProblem = (id) =>
    setForm((f) => ({
      ...f,
      problemIds: f.problemIds.includes(id) ? f.problemIds.filter((x) => x !== id) : [...f.problemIds, id],
      // Default a newly-checked problem to 100 points; leave existing values alone.
      points: f.problemIds.includes(id) ? f.points : { ...f.points, [id]: f.points[id] ?? 100 },
    }));

  const setPoints = (id, value) => setForm((f) => ({ ...f, points: { ...f.points, [id]: value } }));

  const create = async () => {
    if (!form.title || !form.startTime || !form.endTime) {
      toast('Title, start and end time are required', 'error');
      return;
    }
    if (form.pin && !/^[0-9]{4,8}$/.test(form.pin.trim())) {
      toast('PIN must be 4–8 digits (or leave it blank for no PIN)', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/contests', {
        ...form,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        pin: form.pin.trim() || undefined,
      });
      toast('Contest created', 'success');
      setShowForm(false);
      setForm({ title: '', description: '', startTime: '', endTime: '', visibility: 'public', pin: '', problemIds: [], points: {} });
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create contest', 'error');
    } finally {
      setSaving(false);
    }
  };

  const endContest = async (id) => {
    if (!confirm('End this contest now?')) return;
    try {
      await api.post(`/contests/${id}/end`);
      toast('Contest ended', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to end contest', 'error');
    }
  };

  const downloadCsv = (contestId, title) => {
    const token = localStorage.getItem('lj_token');
    fetch(`/api/export/submissions.csv?contestId=${contestId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `submissions_${title.replace(/[^a-z0-9]+/gi, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title } | null
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/contests/${deleteTarget.id}`);
      toast('Contest deleted', 'success');
      setContests((rows) => rows.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to delete contest', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contest Management</h1>
          <p className="text-text-secondary text-sm mt-1">Create and manage contests.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Cancel' : 'Create Contest'}
        </Button>
      </div>

      {showForm && (
        <Card className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Contest Title</label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Weekly Contest 46" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Start Time</label>
              <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">End Time</label>
              <Input type="datetime-local" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Visibility</label>
              <Select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))} className="w-full">
                <option value="public">Public</option>
                <option value="private">Private</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Join PIN <span className="text-text-secondary/60 font-normal">(optional — 4–8 digits)</span>
              </label>
              <Input
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) }))}
                placeholder="Leave blank for no PIN"
                inputMode="numeric"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Problems ({form.problemIds.length} selected)</label>
            <div className="max-h-64 overflow-y-auto border border-border rounded-xl divide-y divide-border">
              {problems.map((p) => {
                const checked = form.problemIds.includes(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02]">
                    <label className="flex items-center gap-3 flex-1 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggleProblem(p.id)} className="accent-primary" />
                      <span className="text-sm flex-1">{p.title}</span>
                      <DifficultyBadge level={p.difficulty} />
                    </label>
                    {checked && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={form.points[p.id] ?? 100}
                          onChange={(e) => setPoints(p.id, e.target.value)}
                          className="w-16 bg-surface border border-border rounded-lg px-2 py-1 text-xs text-right outline-none focus:border-primary/60"
                        />
                        <span className="text-[10px] text-text-secondary">pts</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Button onClick={create} disabled={saving} className="w-full">{saving ? 'Creating…' : 'Save Contest'}</Button>
        </Card>
      )}

      {!contests ? (
        <Skeleton className="h-60" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary text-xs border-b border-border">
                <th className="py-3 px-5 font-medium">Title</th>
                <th className="py-3 px-5 font-medium">Status</th>
                <th className="py-3 px-5 font-medium">Problems</th>
                <th className="py-3 px-5 font-medium">Participants</th>
                <th className="py-3 px-5 font-medium">Start</th>
                <th className="py-3 px-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contests.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 px-5 font-medium">
                    <div className="flex items-center gap-2">
                      {c.title}
                      {c.hasPin && (
                        <span className="text-[10px] font-medium text-warning bg-warning/10 border border-warning/30 rounded-full px-2 py-0.5" title={c.pin ? `PIN: ${c.pin}` : 'PIN protected'}>
                          🔒 {c.pin || 'PIN'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-5"><span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${statusStyle[c.status]}`}>{c.status}</span></td>
                  <td className="py-2.5 px-5 text-text-secondary">
                    {c.problems.length} <span className="text-text-secondary/60">({c.problems.reduce((sum, p) => sum + (p.points || 100), 0)} pts)</span>
                  </td>
                  <td className="py-2.5 px-5 text-text-secondary">{c.participants}</td>
                  <td className="py-2.5 px-5 text-text-secondary">{new Date(c.start_time).toLocaleString()}</td>
                  <td className="py-2.5 px-5">
                    <div className="flex items-center justify-end gap-2">
                      {c.status === 'Live' && (
                        <Button variant="danger" onClick={() => endContest(c.id)} className="!px-3 !py-1.5 text-xs">
                          <Ban size={12} /> End
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => downloadCsv(c.id, c.title)} className="!px-3 !py-1.5 text-xs">
                        <Download size={12} /> Export
                      </Button>
                      <Link to={`/admin/contests/${c.id}/monitor`}>
                        <Button variant="ghost" className="!px-3 !py-1.5 text-xs">
                          <Activity size={12} /> Monitor
                        </Button>
                      </Link>
                      <button
                        onClick={() => setDeleteTarget({ id: c.id, title: c.title })}
                        className="text-text-secondary hover:text-error p-1.5"
                        title="Delete this contest"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        message="This permanently removes the contest and its problem selection/leaderboard. Submissions made during it are kept for records. This can't be undone."
        confirmLabel="Delete Contest"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
