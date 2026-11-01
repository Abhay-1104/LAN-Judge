import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Target, ListChecks, TrendingUp, Clock, Award, Flame, Users } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, VerdictBadge, Skeleton, Button } from '../components/ui';

function Countdown({ end }) {
  const [left, setLeft] = useState(new Date(end) - new Date());
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(end) - new Date()), 1000);
    return () => clearInterval(t);
  }, [end]);
  if (left <= 0) return <span className="text-text-secondary">Ended</span>;
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <div className="flex items-center gap-1 font-mono text-lg font-bold">
      <span>{pad(h)}</span><span className="text-text-secondary text-xs self-end mb-0.5">h</span>
      <span>{pad(m)}</span><span className="text-text-secondary text-xs self-end mb-0.5">m</span>
      <span>{pad(s)}</span><span className="text-text-secondary text-xs self-end mb-0.5">s</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/stats/dashboard').then(({ data }) => setData(data));
  }, []);

  const stats = data
    ? [
        { label: 'Solved Problems', value: `${data.solvedProblems}/${data.totalProblems}`, icon: ListChecks },
        { label: 'Total Submissions', value: data.totalSubmissions, icon: Target },
        { label: 'Accuracy', value: `${data.accuracy}%`, icon: TrendingUp },
        { label: 'Contests Participated', value: data.contestsJoined, icon: Trophy },
        { label: 'Judge Rating', value: data.rating, icon: Award },
        { label: 'Practice Streak', value: `${data.streak}d`, icon: Flame },
        { label: 'Enrolled Students', value: data.enrolledStudents, icon: Users },
      ]
    : [];

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-text-secondary text-sm mt-1">Here's what's happening with your progress today.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 p-6 flex flex-col sm:flex-row sm:items-center gap-6 justify-between">
          {data?.ongoingContest ? (
            <>
              <div>
                <p className="text-xs font-medium text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-0.5 inline-block mb-3">Ongoing Contest</p>
                <h3 className="text-lg font-bold">{data.ongoingContest.title}</h3>
                <p className="text-text-secondary text-sm mt-1">Ends in</p>
                <Countdown end={data.ongoingContest.end_time} />
              </div>
              <Link to={`/contests/${data.ongoingContest.id}`}>
                <Button>View Contest</Button>
              </Link>
            </>
          ) : (
            <div className="text-text-secondary text-sm">No contest is live right now. Check the Contests page for what's coming up.</div>
          )}
        </Card>
        <Card className="p-6">
          <p className="text-xs text-text-secondary mb-1">Your Ranking</p>
          <p className="text-3xl font-bold">{data ? (data.ranking ? `#${data.ranking}` : '—') : <Skeleton className="h-8 w-16" />}</p>
          <p className="text-text-secondary text-xs mt-1">Based on problems solved</p>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {data
          ? stats.map((s) => (
              <Card key={s.label} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-text-secondary text-xs font-medium">{s.label}</span>
                  <s.icon size={16} className="text-primary" />
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
              </Card>
            ))
          : Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Submissions</h3>
            <Link to="/submissions" className="text-xs text-primary hover:underline">View All</Link>
          </div>
          {!data ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : data.recentSubmissions.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">No submissions yet. Solve your first problem!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary text-xs border-b border-border">
                    <th className="pb-2 font-medium">Problem</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Language</th>
                    <th className="pb-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSubmissions.map((s) => (
                    <tr key={s.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5">
                        <Link to={`/problems/${s.code}`} className="hover:text-primary font-medium">{s.problem}</Link>
                      </td>
                      <td className="py-2.5"><VerdictBadge verdict={s.status} /></td>
                      <td className="py-2.5 text-text-secondary capitalize">{s.language}</td>
                      <td className="py-2.5 text-text-secondary">{timeAgo(s.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Upcoming Contests</h3>
            <Clock size={15} className="text-text-secondary" />
          </div>
          {!data ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : data.upcomingContests.length === 0 ? (
            <p className="text-text-secondary text-sm py-6 text-center">Nothing scheduled yet.</p>
          ) : (
            <div className="space-y-3">
              {data.upcomingContests.map((c) => (
                <Link to={`/contests/${c.id}`} key={c.id} className="block bg-surface border border-border rounded-xl p-3 hover:border-primary/30 transition-colors">
                  <p className="font-medium text-sm">{c.title}</p>
                  <p className="text-text-secondary text-xs mt-1">{new Date(c.start_time).toLocaleString()}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = (new Date() - new Date(dateStr + 'Z')) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
