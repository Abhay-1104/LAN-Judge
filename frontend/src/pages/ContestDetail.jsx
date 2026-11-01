import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, Users, Trophy, Lock } from 'lucide-react';
import api from '../api/client';
import { Card, Button, Input, DifficultyBadge, Skeleton, Avatar, useToast } from '../components/ui';

export default function ContestDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [contest, setContest] = useState(null);
  const [tab, setTab] = useState('problems');
  const [leaderboard, setLeaderboard] = useState(null);
  const [now, setNow] = useState(new Date());
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [joining, setJoining] = useState(false);
  const [lock, setLock] = useState(null); // { locked, reason, lockedAt } | null while loading

  const load = () => api.get(`/contests/${id}`).then(({ data }) => setContest(data.contest));

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (tab === 'leaderboard') api.get(`/contests/${id}/leaderboard`).then(({ data }) => setLeaderboard(data.leaderboard));
  }, [tab, id]);

  // Server-authoritative proctoring lock — checked whenever this page loads
  // (including after a refresh) so a frozen student can't just navigate back
  // here and click into a problem to keep working.
  useEffect(() => {
    api.get(`/contests/${id}/lock-status`).then(({ data }) => setLock(data)).catch(() => setLock({ locked: false }));
    const interval = setInterval(() => {
      api.get(`/contests/${id}/lock-status`).then(({ data }) => setLock(data)).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [id]);

  // PIN-protected contests show a small inline prompt instead of joining
  // immediately — the actual check still happens server-side in /join, this
  // is just so the person isn't left staring at a generic error.
  const join = async (pin) => {
    setJoining(true);
    try {
      await api.post(`/contests/${id}/join`, pin ? { pin } : undefined);
      toast('Joined the contest', 'success');
      setPinPrompt(false);
      setPinValue('');
      load();
    } catch (err) {
      if (err.response?.data?.pinRequired) {
        setPinPrompt(true);
        if (pin) toast(err.response.data.error || 'Incorrect PIN', 'error');
      } else {
        toast(err.response?.data?.error || 'Failed to join contest', 'error');
      }
    } finally {
      setJoining(false);
    }
  };

  const handleJoinClick = () => {
    if (contest.hasPin) setPinPrompt(true);
    else join();
  };

  if (!contest) return <Skeleton className="h-96" />;

  const end = new Date(contest.end_time);
  const remaining = end - now;
  const h = Math.max(0, Math.floor(remaining / 3600000));
  const m = Math.max(0, Math.floor((remaining % 3600000) / 60000));
  const s = Math.max(0, Math.floor((remaining % 60000) / 1000));

  return (
    <div className="space-y-5 animate-fade-up">
      <Card className="p-6 bg-gradient-to-br from-card to-surface">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-xl font-bold">{contest.title}</h1>
              {contest.status === 'Live' && <span className="text-[11px] font-medium text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-0.5">● Live</span>}
            </div>
            <p className="text-text-secondary text-sm max-w-xl">{contest.description}</p>
          </div>
          {contest.status !== 'Finished' && (
            <div className="text-right shrink-0">
              <p className="text-xs text-text-secondary mb-1">Remaining time</p>
              <p className="font-mono text-2xl font-bold">{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</p>
            </div>
          )}
        </div>

        {lock?.locked && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error/5 p-3.5 text-sm">
            <Lock size={16} className="text-error shrink-0 mt-0.5" />
            <div>
              <p className="text-error font-semibold">Your test is frozen</p>
              <p className="text-text-secondary text-xs mt-0.5">
                Reason: {lock.reason || 'Repeated proctoring violations'}. You can't submit or open problems until your instructor re-enables your test — find them in the lab.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-5 mt-5 text-sm text-text-secondary">
          <span className="flex items-center gap-1.5"><Clock size={14} /> {new Date(contest.start_time).toLocaleString()} – {new Date(contest.end_time).toLocaleString()}</span>
          <span className="flex items-center gap-1.5"><Trophy size={14} /> {contest.problems.length} problems · {contest.problems.reduce((s, p) => s + (p.points || 100), 0)} pts</span>
          {contest.hasPin && <span className="flex items-center gap-1.5"><Lock size={14} /> PIN protected</span>}
        </div>
        {!contest.joined && contest.status !== 'Finished' && !pinPrompt && (
          <Button onClick={handleJoinClick} className="mt-5" disabled={joining}>
            {contest.hasPin && <Lock size={14} />} Join Contest
          </Button>
        )}
        {pinPrompt && (
          <div className="mt-5 flex items-end gap-2 max-w-xs">
            <div className="flex-1">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Enter contest PIN</label>
              <Input
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="e.g. 1234"
                inputMode="numeric"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && join(pinValue)}
              />
            </div>
            <Button onClick={() => join(pinValue)} disabled={joining || !pinValue}>{joining ? 'Joining…' : 'Join'}</Button>
          </div>
        )}
      </Card>

      <div className="flex gap-1 border-b border-border">
        {['problems', 'leaderboard', 'announcements', 'rules'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'problems' && (
        <Card className="divide-y divide-border">
          {contest.problems.map((p) =>
            lock?.locked ? (
              <div key={p.id} className="flex items-center gap-4 p-4 opacity-50 cursor-not-allowed">
                <span className="font-mono font-bold text-text-secondary w-6">{p.label}</span>
                <span className="font-medium flex-1">{p.title}</span>
                <span className="text-xs text-text-secondary">{p.points || 100} pts</span>
                <DifficultyBadge level={p.difficulty} />
              </div>
            ) : (
              <Link key={p.id} to={`/problems/${p.id}?contestId=${contest.id}`} className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                <span className="font-mono font-bold text-text-secondary w-6">{p.label}</span>
                <span className="font-medium flex-1">{p.title}</span>
                <span className="text-xs text-text-secondary">{p.points || 100} pts</span>
                <DifficultyBadge level={p.difficulty} />
              </Link>
            )
          )}
        </Card>
      )}

      {tab === 'leaderboard' && (
        <Card className="overflow-hidden">
          {!leaderboard ? (
            <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : leaderboard.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-10">No participants yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-border">
                  <th className="py-3 px-5 font-medium">Rank</th>
                  <th className="py-3 px-5 font-medium">Student</th>
                  <th className="py-3 px-5 font-medium">Solved</th>
                  <th className="py-3 px-5 font-medium">Score</th>
                  <th className="py-3 px-5 font-medium">Penalty</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 px-5 font-mono">{r.rank}</td>
                    <td className="py-2.5 px-5"><div className="flex items-center gap-2"><Avatar name={r.name} color={r.avatar_color} size={26} />{r.name}</div></td>
                    <td className="py-2.5 px-5">{r.solved}</td>
                    <td className="py-2.5 px-5 font-semibold text-primary">{r.score}</td>
                    <td className="py-2.5 px-5 text-text-secondary">{r.penalty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'announcements' && <Card className="p-8 text-center text-text-secondary text-sm">No announcements yet.</Card>}
      {tab === 'rules' && (
        <Card className="p-6 text-sm text-text-secondary leading-relaxed space-y-2">
          <p>Standard ICPC-style rules apply: solve as many problems as possible within the contest window.</p>
          <p>Each wrong submission before an accepted one adds a time penalty. Plagiarism results in disqualification.</p>
        </Card>
      )}
    </div>
  );
}
