import { useEffect, useState } from 'react';
import { Code2, Users, Send, Trophy, Download, Activity, HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import api from '../../api/client';
import { Card, VerdictBadge, Skeleton, Button } from '../../components/ui';

const COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7'];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [velocity, setVelocity] = useState(null);
  const [health, setHealth] = useState(null);
  const [liveFeed, setLiveFeed] = useState([]);

  useEffect(() => {
    api.get('/stats/admin').then(({ data }) => setData(data));
    api.get('/system/velocity').then(({ data }) => setVelocity(data));
    api.get('/system/health').then(({ data }) => setHealth(data));
  }, []);

  // Polling rather than another WS channel — this feed spans every problem
  // and contest at once, not just one contest's room, and polling here can
  // never affect the existing per-contest proctoring WS code.
  useEffect(() => {
    let lastId = 0;
    const tick = () => {
      api.get('/system/recent-submissions', { params: { sinceId: lastId } }).then(({ data }) => {
        if (data.submissions.length > 0) {
          lastId = Math.max(lastId, ...data.submissions.map((s) => s.id));
          setLiveFeed((prev) => [...data.submissions, ...prev].slice(0, 30));
        }
      });
    };
    tick();
    const t = setInterval(tick, 4000);
    const h = setInterval(() => api.get('/system/health').then(({ data }) => setHealth(data)), 5000);
    return () => { clearInterval(t); clearInterval(h); };
  }, []);

  const downloadCsv = (path) => {
    const token = localStorage.getItem('lj_token');
    fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.includes('gradebook') ? 'gradebook.csv' : 'submissions.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  if (!data) return <Skeleton className="h-96" />;

  const stats = [
    { label: 'Problems', value: data.stats.problems, icon: Code2 },
    { label: 'Users', value: data.stats.users, icon: Users },
    { label: 'Submissions', value: data.stats.submissions, icon: Send },
    { label: 'Contests', value: data.stats.contests, icon: Trophy },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-text-secondary text-sm mt-1">Platform-wide overview and system status.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => downloadCsv('/export/submissions.csv')}>
            <Download size={15} /> Detailed Log
          </Button>
          <Button variant="ghost" onClick={() => downloadCsv('/export/gradebook.csv')}>
            <Download size={15} /> Gradebook
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-secondary text-xs font-medium">{s.label}</span>
              <s.icon size={16} className="text-primary" />
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      {health && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HardDrive size={15} className="text-primary" />
              <h3 className="font-semibold text-sm">Server RAM Usage</h3>
            </div>
            <span className="text-xs text-text-secondary">Uptime: {Math.floor(health.process.uptimeSec / 60)} min</span>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-2xl font-bold">{health.ram.usedPct}%</p>
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${health.ram.usedPct > 85 ? 'bg-error' : health.ram.usedPct > 65 ? 'bg-warning' : 'bg-primary'}`}
                style={{ width: `${health.ram.usedPct}%` }}
              />
            </div>
            <span className="text-xs text-text-secondary shrink-0">{health.ram.usedMb} / {health.ram.totalMb} MB</span>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Submissions by Verdict</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byVerdict}>
              <XAxis dataKey="verdict" stroke="#9CA3AF" fontSize={10} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="c" fill="#22C55E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Language Usage</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.byLanguage} dataKey="c" nameKey="language" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {data.byLanguage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 10, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {data.byLanguage.map((l, i) => (
              <span key={l.language} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {l.language}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {velocity && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold">24-Hour Evaluation Velocity</h3>
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <span>Total: <strong className="text-text">{velocity.totalToday}</strong></span>
              <span className="text-primary">AC: {velocity.accepted24h}</span>
              <span className="text-error">Failed: {velocity.failed24h}</span>
            </div>
          </div>
          {velocity.hourly.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-10">No submissions in the last 24 hours.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={velocity.hourly}>
                <XAxis dataKey="hour" stroke="#9CA3AF" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(11, 16)} />
                <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="accepted" name="Successful (AC)" stroke="#22C55E" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="failed" name="Failed (Non-AC)" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={15} className="text-primary" />
          <h3 className="font-semibold">Live Lab Submissions Feed</h3>
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse ml-1" />
        </div>
        {liveFeed.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-8">Watching for new submissions…</p>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-text-secondary text-xs border-b border-border">
                  <th className="py-2 font-medium">Verdict</th>
                  <th className="py-2 font-medium">Problem</th>
                  <th className="py-2 font-medium">Student</th>
                  <th className="py-2 font-medium">Language</th>
                  <th className="py-2 font-medium">Runtime</th>
                  <th className="py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {liveFeed.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2"><VerdictBadge verdict={s.verdict} /></td>
                    <td className="py-2 text-text-secondary">{s.problem}</td>
                    <td className="py-2">{s.student}</td>
                    <td className="py-2 text-text-secondary capitalize">{s.language}</td>
                    <td className="py-2 text-text-secondary">{s.runtime_ms ? `${Math.round(s.runtime_ms)} ms` : '—'}</td>
                    <td className="py-2 text-text-secondary">{new Date(s.submitted_at + 'Z').toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Recent Submissions</h3>
          {data.recentSubmissions.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-6">No submissions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-border">
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Problem</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSubmissions.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5">{s.user}</td>
                    <td className="py-2.5 text-text-secondary">{s.problem}</td>
                    <td className="py-2.5"><VerdictBadge verdict={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Most Solved Problems</h3>
          {data.mostSolved.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-6">No accepted submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {data.mostSolved.map((p, i) => (
                <div key={p.title} className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-secondary w-4">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium">{p.title}</span>
                  <span className="text-xs text-text-secondary">{p.solvers} solvers</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        <span className="text-sm font-medium">System status: All services operational</span>
        <span className="text-text-secondary text-xs ml-auto">Judge engine · Database · LAN server</span>
      </Card>
    </div>
  );
}
