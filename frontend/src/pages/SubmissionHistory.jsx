import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { Card, VerdictBadge, Select, Skeleton, EmptyState } from '../components/ui';

const STATUSES = ['All', 'Accepted', 'Wrong Answer', 'Runtime Error', 'Time Limit Exceeded', 'Compilation Error'];
const LANGS = ['All', 'c', 'cpp', 'python', 'java', 'javascript'];

export default function SubmissionHistory() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('All');
  const [language, setLanguage] = useState('All');

  useEffect(() => {
    api.get('/submissions').then(({ data }) => setRows(data.submissions));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => (status === 'All' || r.verdict === status) && (language === 'All' || r.language === language));
  }, [rows, status, language]);

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold">Submission History</h1>
        <p className="text-text-secondary text-sm mt-1">All your past submissions across every problem.</p>
      </div>

      <Card className="p-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              status === s ? 'bg-primary text-bg border-primary' : 'border-border text-text-secondary hover:text-text'
            }`}
          >
            {s}
          </button>
        ))}
        <Select value={language} onChange={(e) => setLanguage(e.target.value)} className="ml-auto py-1.5">
          {LANGS.map((l) => <option key={l} value={l}>{l === 'All' ? 'All languages' : l}</option>)}
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {!rows ? (
          <div className="p-5 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No submissions found" subtitle="Try a different filter, or go solve a problem." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-border">
                  <th className="py-3 px-5 font-medium">Problem</th>
                  <th className="py-3 px-5 font-medium">Status</th>
                  <th className="py-3 px-5 font-medium">Language</th>
                  <th className="py-3 px-5 font-medium">Runtime</th>
                  <th className="py-3 px-5 font-medium">Memory</th>
                  <th className="py-3 px-5 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.02]">
                    <td className="py-2.5 px-5"><Link to={`/problems/${s.problemId}`} className="font-medium hover:text-primary">{s.problemTitle}</Link></td>
                    <td className="py-2.5 px-5"><VerdictBadge verdict={s.verdict} /></td>
                    <td className="py-2.5 px-5 capitalize">{s.language}</td>
                    <td className="py-2.5 px-5 text-text-secondary">{s.runtimeMs}ms</td>
                    <td className="py-2.5 px-5 text-text-secondary">{s.memoryKb ? Math.round(s.memoryKb / 1024) + 'MB' : '—'}</td>
                    <td className="py-2.5 px-5 text-text-secondary">{new Date(s.submittedAt + 'Z').toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
