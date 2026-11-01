import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Shuffle, Pencil, Copy, Trash2 } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, DifficultyBadge, StatusPill, Input, Select, Skeleton, EmptyState, Button, useToast, ConfirmDialog } from '../components/ui';

const TAGS = ['Array', 'String', 'Math', 'Binary Search', 'Hash Table', 'Stack', 'Sorting', 'Graph', 'Shortest Path', 'Dynamic Programming'];
const PAGE_SIZE = 10;

export default function ProblemsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [problems, setProblems] = useState(null);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('All');
  const [tag, setTag] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [page, setPage] = useState(1);
  const [cloning, setCloning] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title } | null
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get('/problems').then(({ data }) => setProblems(data.problems));
  }, []);

  const filtered = useMemo(() => {
    if (!problems) return [];
    let rows = [...problems];
    if (search) rows = rows.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));
    if (difficulty !== 'All') rows = rows.filter((p) => p.difficulty === difficulty);
    if (tag) rows = rows.filter((p) => p.tags.includes(tag));
    if (sortBy === 'acceptance') rows.sort((a, b) => b.acceptance - a.acceptance);
    if (sortBy === 'solved') rows.sort((a, b) => b.solved - a.solved);
    if (sortBy === 'difficulty') {
      const order = { Easy: 0, Medium: 1, Hard: 2 };
      rows.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    }
    return rows;
  }, [problems, search, difficulty, tag, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, difficulty, tag, sortBy]);

  // Prefer an unsolved problem so "Pick Random" is actually useful for
  // practice, but fall back to any problem if everything is solved already.
  const pickRandom = () => {
    if (!problems || problems.length === 0) return;
    const pool = problems.filter((p) => p.status !== 'Solved');
    const from = pool.length > 0 ? pool : problems;
    const choice = from[Math.floor(Math.random() * from.length)];
    navigate(`/problems/${choice.id}`);
  };

  const cloneProblem = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    setCloning(id);
    try {
      const { data } = await api.post(`/problems/${id}/clone`);
      toast('Problem cloned — opening the copy to edit', 'success');
      navigate(`/admin/problems/${data.problem.id}/edit`);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to clone problem', 'error');
    } finally {
      setCloning(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/problems/${deleteTarget.id}`);
      toast('Problem deleted', 'success');
      setProblems((rows) => rows.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to delete problem', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">All Problems</h1>
          <p className="text-text-secondary text-sm mt-1">{problems ? `${filtered.length} problems` : 'Loading…'}</p>
        </div>
        <Button variant="ghost" onClick={pickRandom} disabled={!problems || problems.length === 0}>
          <Shuffle size={15} /> Pick Random
        </Button>
      </div>

      <Card className="p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search problems…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', 'Easy', 'Medium', 'Hard'].map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                difficulty === d ? 'bg-primary text-bg border-primary' : 'border-border text-text-secondary hover:text-text'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <Select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All Tags</option>
          {TAGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="id">Sort: Default</option>
          <option value="acceptance">Sort: Acceptance</option>
          <option value="solved">Sort: Most Solved</option>
          <option value="difficulty">Sort: Difficulty</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {!problems ? (
          <div className="p-5 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No problems found" subtitle="Try a different search term or filter." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary text-xs border-b border-border bg-surface/50">
                    <th className="py-3 px-5 font-medium w-10">#</th>
                    <th className="py-3 px-5 font-medium">Title</th>
                    <th className="py-3 px-5 font-medium">Difficulty</th>
                    <th className="py-3 px-5 font-medium">Acceptance</th>
                    <th className="py-3 px-5 font-medium">Solved</th>
                    <th className="py-3 px-5 font-medium">Status</th>
                    {user?.role === 'admin' && <th className="py-3 px-5 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-5 text-text-secondary font-mono text-xs">{String.fromCharCode(64 + p.id)}</td>
                      <td className="py-3 px-5">
                        <Link to={`/problems/${p.id}`} className="font-medium hover:text-primary transition-colors">{p.title}</Link>
                        <div className="flex gap-1 mt-1">
                          {p.tags.slice(0, 2).map((t) => (
                            <span key={t} className="text-[10px] text-text-secondary bg-white/5 rounded-full px-2 py-0.5">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-5"><DifficultyBadge level={p.difficulty} /></td>
                      <td className="py-3 px-5 text-text-secondary">{p.acceptance}%</td>
                      <td className="py-3 px-5 text-text-secondary">{p.solved}</td>
                      <td className="py-3 px-5"><StatusPill status={p.status} /></td>
                      {user?.role === 'admin' && (
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2">
                            <Link to={`/admin/problems/${p.id}/edit`} className="text-text-secondary hover:text-primary" title="Edit">
                              <Pencil size={14} />
                            </Link>
                            <button
                              onClick={(e) => cloneProblem(p.id, e)}
                              disabled={cloning === p.id}
                              className="text-text-secondary hover:text-primary disabled:opacity-40"
                              title="Clone this problem"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: p.id, title: p.title }); }}
                              className="text-text-secondary hover:text-error"
                              title="Delete this problem"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-text-secondary">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-white/5">Prev</button>
                <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-white/5">Next</button>
              </div>
            </div>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        message="This permanently removes the problem, its test cases, and its submission history. This can't be undone."
        confirmLabel="Delete Problem"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
