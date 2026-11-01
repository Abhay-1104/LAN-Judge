import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ListChecks, Clock, Ban, ChevronLeft, LockOpen, Lock } from 'lucide-react';
import api from '../../api/client';
import { useQuizSocket } from '../../hooks/useQuizSocket';
import { Card, Avatar, Skeleton, Button, useToast } from '../../components/ui';

const statusStyle = {
  active: 'text-primary border-primary/30 bg-primary/10',
  disconnected: 'text-text-secondary border-border bg-white/5',
  'auto-submitted': 'text-error border-error/30 bg-error/10',
};

export default function QuizMonitor() {
  const { id } = useParams();
  const toast = useToast();
  const [tab, setTab] = useState('students');
  const [quiz, setQuiz] = useState(null);
  const [students, setStudents] = useState([]);
  const [violations, setViolations] = useState([]);
  const [locks, setLocks] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [unlocking, setUnlocking] = useState(null);

  const load = () => {
    api.get(`/quizzes/${id}`).then(({ data }) => setQuiz(data.quiz));
    api.get(`/quizzes/${id}/monitor`).then(({ data }) => {
      setStudents(data.students);
      setViolations(data.violations);
      setLocks(data.locks || []);
    });
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (tab === 'leaderboard') api.get(`/quizzes/${id}/leaderboard`).then(({ data }) => setLeaderboard(data.leaderboard));
  }, [tab, id]);

  useQuizSocket(id, {
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
        setStudents((prev) => prev.map((s) => (s.userId === msg.userId ? { ...s, status: msg.autoSubmitted ? 'auto-submitted' : s.status } : s)));
        if (msg.autoSubmitted) {
          setLocks((prev) => {
            const exists = prev.some((l) => l.user_id === msg.userId);
            if (exists) return prev.map((l) => (l.user_id === msg.userId ? { ...l, locked: 1, reason: msg.message } : l));
            return [...prev, { user_id: msg.userId, student_name: msg.name, locked: 1, reason: msg.message, locked_at: msg.at }];
          });
        }
      } else if (msg.type === 'student_joined') {
        setStudents((prev) => (prev.some((s) => s.userId === msg.userId) ? prev : [...prev, { userId: msg.userId, name: msg.name, answered: 0, status: 'active' }]));
      } else if (msg.type === 'student_left') {
        setStudents((prev) => prev.map((s) => (s.userId === msg.userId && s.status !== 'auto-submitted' ? { ...s, status: 'disconnected' } : s)));
      }
    },
  });

  const unlockStudent = async (userId) => {
    setUnlocking(userId);
    try {
      await api.post(`/quizzes/${id}/unlock/${userId}`);
      setLocks((prev) => prev.filter((l) => l.user_id !== userId));
      setStudents((prev) => prev.map((s) => (s.userId === userId ? { ...s, status: 'active' } : s)));
      toast('Student re-enabled — they can continue the quiz.', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to unlock student', 'error');
    } finally {
      setUnlocking(null);
    }
  };

  const endQuiz = async () => {
    if (!confirm('End this quiz now? Anyone still in progress will be auto-submitted.')) return;
    await api.post(`/quizzes/${id}/end`);
    toast('Quiz ended', 'success');
    load();
  };

  if (!quiz) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/admin/quizzes" className="text-xs text-text-secondary hover:text-text flex items-center gap-1 mb-2">
            <ChevronLeft size={13} /> Back to Quizzes
          </Link>
          <h1 className="text-xl font-bold">{quiz.title} — Live Monitor</h1>
        </div>
        {quiz.status === 'Live' && (
          <Button variant="danger" onClick={endQuiz}><Ban size={14} /> End Quiz</Button>
        )}
      </div>

      <div className="flex gap-2 border-b border-border">
        {['students', 'violations', 'leaderboard'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {t}
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
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <ListChecks size={12} /> {s.answered || 0} of {quiz.questions?.length || '?'} answered
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
            <p className="text-text-secondary text-sm text-center py-10">No violations recorded.</p>
          ) : (
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {violations.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={v.student_name} size={26} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{v.student_name}</p>
                    <p className="text-xs text-text-secondary">{v.message}</p>
                  </div>
                  {!!v.auto_submitted && <span className="text-[10px] font-medium text-error bg-error/10 border border-error/30 rounded-full px-2 py-0.5">Auto-submitted</span>}
                  <span className="text-xs text-text-secondary flex items-center gap-1 shrink-0"><Clock size={11} /> {new Date(v.created_at + 'Z').toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
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
                  <th className="py-3 px-5 font-medium">Score</th>
                  <th className="py-3 px-5 font-medium">Correct</th>
                  <th className="py-3 px-5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 px-5 font-mono">{r.rank}</td>
                    <td className="py-2.5 px-5"><div className="flex items-center gap-2"><Avatar name={r.name} color={r.avatar_color} size={26} />{r.name}</div></td>
                    <td className="py-2.5 px-5 font-semibold text-primary">{r.score} / {r.totalPoints}</td>
                    <td className="py-2.5 px-5 text-text-secondary">{r.correct} / {r.totalQuestions}</td>
                    <td className="py-2.5 px-5 text-text-secondary">{r.submitted ? 'Submitted' : 'In progress'}</td>
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
