import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Keyboard, Play, Send, Clock, Ban, ChevronLeft, LockOpen, Lock } from 'lucide-react';
import api from '../../api/client';
import { useContestSocket } from '../../hooks/useContestSocket';
import { Card, Avatar, VerdictBadge, Skeleton, Button, useToast } from '../../components/ui';

const statusStyle = {
  active: 'text-primary bg-primary/10 border-primary/30',
  idle: 'text-warning bg-warning/10 border-warning/30',
  disconnected: 'text-text-secondary bg-white/5 border-border',
  'auto-submitted': 'text-error bg-error/10 border-error/30',
};

const violationColor = (warningNumber, autoSubmitted) => {
  if (autoSubmitted) return 'text-error font-semibold';
  if (warningNumber >= 2) return 'text-warning font-medium';
  return 'text-text-secondary';
};

export default function ContestMonitor() {
  const { id } = useParams();
  const toast = useToast();
  const [tab, setTab] = useState('students');
  const [contest, setContest] = useState(null);
  const [students, setStudents] = useState([]);
  const [violations, setViolations] = useState([]);
  const [locks, setLocks] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [unlocking, setUnlocking] = useState(null);

  const load = () => {
    api.get(`/contests/${id}`).then(({ data }) => setContest(data.contest));
    api.get(`/contests/${id}/monitor`).then(({ data }) => {
      setStudents(data.students);
      setViolations(data.violations);
      setLocks(data.locks || []);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000); // fallback poll in case a WS message is missed
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === 'leaderboard') api.get(`/contests/${id}/leaderboard`).then(({ data }) => setLeaderboard(data.leaderboard));
  }, [tab, id]);

  useContestSocket(id, {
    onMessage: (msg) => {
      if (msg.type === 'activity_update') {
        setStudents((prev) => {
          const others = prev.filter((s) => s.userId !== msg.userId);
          return [...others, { userId: msg.userId, name: msg.name, ...msg.data }];
        });
      } else if (msg.type === 'violation') {
        setViolations((prev) => [
          { id: `live-${Date.now()}-${Math.random()}`, student_name: msg.name, user_id: msg.userId, message: msg.message, warning_number: msg.warningNumber, auto_submitted: msg.autoSubmitted ? 1 : 0, created_at: msg.at },
          ...prev,
        ]);
        setStudents((prev) =>
          prev.map((s) => (s.userId === msg.userId ? { ...s, status: msg.autoSubmitted ? 'auto-submitted' : s.status } : s))
        );
        if (msg.autoSubmitted) {
          setLocks((prev) => {
            const exists = prev.some((l) => l.user_id === msg.userId);
            if (exists) return prev.map((l) => (l.user_id === msg.userId ? { ...l, locked: 1, reason: msg.message } : l));
            return [...prev, { user_id: msg.userId, student_name: msg.name, locked: 1, reason: msg.message, locked_at: msg.at }];
          });
        }
      } else if (msg.type === 'student_joined') {
        setStudents((prev) => (prev.some((s) => s.userId === msg.userId) ? prev : [...prev, { userId: msg.userId, name: msg.name, keystrokes: 0, runs: 0, submits: 0, codeLength: 0, status: 'active' }]));
      } else if (msg.type === 'student_left') {
        setStudents((prev) => prev.map((s) => (s.userId === msg.userId && s.status !== 'auto-submitted' ? { ...s, status: 'disconnected' } : s)));
      }
    },
  });

  const unlockStudent = async (userId) => {
    setUnlocking(userId);
    try {
      await api.post(`/contests/${id}/unlock/${userId}`);
      setLocks((prev) => prev.filter((l) => l.user_id !== userId));
      setStudents((prev) => prev.map((s) => (s.userId === userId ? { ...s, status: 'active' } : s)));
      toast('Student re-enabled — they can continue the test.', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to unlock student', 'error');
    } finally {
      setUnlocking(null);
    }
  };

  const endContest = async () => {
    if (!confirm('End this contest now? All students will be notified immediately.')) return;
    try {
      await api.post(`/contests/${id}/end`);
      toast('Contest ended', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to end contest', 'error');
    }
  };

  if (!contest) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/admin/contests" className="text-xs text-text-secondary hover:text-text flex items-center gap-1 mb-2">
            <ChevronLeft size={13} /> Back to contests
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {contest.title}
            {contest.status === 'Live' && <span className="text-[11px] font-medium text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-0.5">● Live</span>}
          </h1>
          <p className="text-text-secondary text-sm mt-1">{students.length} students connected</p>
        </div>
        {contest.status === 'Live' && (
          <Button variant="danger" onClick={endContest}>
            <Ban size={15} /> End Contest
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {['students', 'violations', 'leaderboard'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors ${
              tab === t ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text'
            }`}
          >
            {t === 'violations' ? 'Violation Feed' : t === 'leaderboard' ? '🏆 Leaderboard' : 'Students'}
          </button>
        ))}
      </div>

      {locks.length > 0 && (
        <Card className="p-4 border-error/30 bg-error/5">
          <p className="text-sm font-semibold text-error flex items-center gap-1.5 mb-3">
            <Lock size={14} /> {locks.length} student{locks.length > 1 ? 's' : ''} frozen — waiting on you
          </p>
          <div className="space-y-2">
            {locks.map((l) => (
              <div key={l.user_id} className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={l.student_name} size={26} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{l.student_name}</p>
                    <p className="text-xs text-text-secondary truncate">{l.reason || 'Repeated proctoring violations'}</p>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => unlockStudent(l.user_id)} disabled={unlocking === l.user_id} className="shrink-0 !px-3 !py-1.5 text-xs">
                  <LockOpen size={13} /> {unlocking === l.user_id ? 'Unlocking…' : 'Allow to Continue'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'students' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.length === 0 ? (
            <Card className="p-8 text-center text-text-secondary text-sm col-span-full">No students connected yet.</Card>
          ) : (
            students.map((s) => {
              const lock = locks.find((l) => l.user_id === s.userId);
              return (
                <Card key={s.userId} className={`p-4 ${lock ? 'border-error/40' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={s.name} size={28} />
                      <span className="font-semibold text-sm">{s.name}</span>
                    </div>
                    <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 capitalize ${statusStyle[s.status] || statusStyle.active}`}>
                      {s.status === 'auto-submitted' ? 'Auto-submitted' : s.status || 'active'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-secondary mb-3">
                    <span className="flex items-center gap-1"><Keyboard size={12} /> {s.keystrokes || 0} keystrokes</span>
                    <span className="flex items-center gap-1"><Play size={12} /> {s.runs || 0} runs</span>
                    <span className="flex items-center gap-1"><Send size={12} /> {s.submits || 0} submits</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {s.lastActiveAt ? `Idle: ${Math.round((Date.now() - s.lastActiveAt) / 1000)}s` : '—'}
                    </span>
                    <span>Code: {s.codeLength || 0} chars</span>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.min(100, (s.codeLength || 0) / 10)}%` }} />
                  </div>
                  {lock && (
                    <Button variant="ghost" onClick={() => unlockStudent(s.userId)} disabled={unlocking === s.userId} className="w-full mt-3 !px-3 !py-1.5 text-xs">
                      <LockOpen size={13} /> {unlocking === s.userId ? 'Unlocking…' : 'Allow to Continue'}
                    </Button>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'violations' && (
        <Card className="overflow-hidden">
          {violations.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-10">No violations reported.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary text-xs border-b border-border">
                  <th className="py-3 px-5 font-medium">Time</th>
                  <th className="py-3 px-5 font-medium">Student</th>
                  <th className="py-3 px-5 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 px-5 text-text-secondary font-mono text-xs">{new Date(v.created_at).toLocaleTimeString()}</td>
                    <td className="py-2.5 px-5 font-medium">{v.student_name}</td>
                    <td className={`py-2.5 px-5 ${violationColor(v.warning_number, v.auto_submitted)}`}>
                      {v.auto_submitted ? <span className="inline-flex items-center gap-1"><Ban size={12} /> TEST AUTO-SUBMITTED (3rd violation)</span> : `${v.message} (warning ${v.warning_number})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </div>
  );
}
