import { useEffect, useState } from 'react';
import { Download, Users, Trophy, ClipboardList, Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Card, Button, Select, Input, Skeleton, useToast } from '../components/ui';

// Shared download helper — fetches a CSV with the auth header (plain <a
// href> can't attach it) and saves it via a synthetic click, same pattern
// AdminDashboard/ContestManagement already use elsewhere in the app.
function downloadFile(path, filename) {
  const token = localStorage.getItem('lj_token');
  return fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error('Download failed');
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
}

function ReportRow({ title, description, onDownload }) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const go = async () => {
    setDownloading(true);
    try {
      await onDownload();
    } catch {
      toast('Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-text-secondary mt-0.5">{description}</p>}
      </div>
      <Button variant="ghost" onClick={go} disabled={downloading} className="!px-3.5 !py-2 text-xs shrink-0">
        <Download size={13} /> {downloading ? 'Preparing…' : 'Download CSV'}
      </Button>
    </div>
  );
}

// ── Grade scale editor — professor sets letter-grade cutoffs for quizzes.
// Any tier left out just isn't submitted; leaving everything at the default
// (or clearing all rows) falls back to the built-in scale server-side.
function GradeScaleEditor() {
  const toast = useToast();
  const [scale, setScale] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/export/grade-scale').then(({ data }) => setScale(data.scale));
  }, []);

  if (!scale) return <Skeleton className="h-32" />;

  const updateTier = (i, field, value) => {
    setScale((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };
  const removeTier = (i) => setScale((rows) => rows.filter((_, idx) => idx !== i));
  const addTier = () => setScale((rows) => [...rows, { min: 0, grade: '' }]);

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = scale
        .filter((t) => t.grade.trim() !== '')
        .map((t) => ({ min: Number(t.min) || 0, grade: t.grade.trim() }));
      const { data } = await api.put('/export/grade-scale', { scale: cleaned });
      setScale(data.scale);
      toast('Grade scale saved', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to save grade scale', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/export/grade-scale', { scale: [] });
      setScale(data.scale);
      toast('Reset to default grade scale', 'success');
    } catch {
      toast('Failed to reset', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold">Quiz Grade Scale</h3>
      </div>
      <p className="text-xs text-text-secondary mb-4">
        Set the minimum percentage for each letter grade used in the quiz grading log. Any quiz score falls into the highest
        tier it meets. Leave this untouched (or clear it) to use the built-in default scale.
      </p>
      <div className="space-y-2">
        {scale.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="number"
              value={t.min}
              onChange={(e) => updateTier(i, 'min', e.target.value)}
              className="w-24 !py-1.5"
              placeholder="Min %"
            />
            <span className="text-text-secondary text-xs">% and above →</span>
            <Input
              value={t.grade}
              onChange={(e) => updateTier(i, 'grade', e.target.value)}
              className="w-28 !py-1.5"
              placeholder="Grade (A++)"
            />
            <button onClick={() => removeTier(i)} className="text-text-secondary hover:text-error p-1">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <Button variant="ghost" onClick={addTier} className="!px-3 !py-1.5 text-xs">
          <Plus size={12} /> Add Tier
        </Button>
        <Button onClick={save} disabled={saving} className="!px-3 !py-1.5 text-xs">
          <Save size={12} /> Save
        </Button>
        <Button variant="ghost" onClick={resetDefault} disabled={saving} className="!px-3 !py-1.5 text-xs">
          <RotateCcw size={12} /> Reset to Default
        </Button>
      </div>
    </Card>
  );
}

// ── Professor view ──────────────────────────────────────────────────────────
function ProfessorReports() {
  const [assessments, setAssessments] = useState(null);
  const [contestScope, setContestScope] = useState('all');
  const [quizScope, setQuizScope] = useState('all');
  const [tab, setTab] = useState('accounts');

  useEffect(() => {
    api.get('/export/assessments').then(({ data }) => setAssessments(data.assessments));
  }, []);

  const contests = assessments?.filter((a) => a.type === 'contest') || [];
  const quizzes = assessments?.filter((a) => a.type === 'quiz') || [];

  const tabs = [
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'contests', label: 'Contests', icon: Trophy },
    { id: 'quizzes', label: 'Quizzes', icon: ClipboardList },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-text-secondary text-sm mt-1">Grading logs, submission history, and violation reports — generated locally as CSV.</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' && (
        <Card className="p-5">
          <h3 className="font-semibold mb-1">Account Detail Log</h3>
          <p className="text-xs text-text-secondary mb-3">Every enrolled account with role, rating, and activity summary.</p>
          <ReportRow
            title="All Accounts"
            description="Name, email, college ID, role, submissions, problems solved, contests/quizzes joined"
            onDownload={() => downloadFile('/export/accounts.csv', 'accounts.csv')}
          />
        </Card>
      )}

      {tab === 'contests' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-semibold">Contest Reports</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">Filter Scope</span>
              <Select value={contestScope} onChange={(e) => setContestScope(e.target.value)} className="!py-1.5 text-xs">
                <option value="all">All Contests</option>
                {contests.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </Select>
            </div>
          </div>
          <ReportRow
            title="Grading & Submission Log"
            description="Score, verdict, runtime and test-case breakdown for every submission, scoped to the filter above"
            onDownload={() =>
              downloadFile(
                `/export/submissions.csv${contestScope !== 'all' ? `?contestId=${contestScope}` : ''}`,
                `submissions_${contestScope}.csv`
              )
            }
          />
          <ReportRow
            title="Gradebook Summary"
            description="One row per student — attempts, solved count, total points, solve %, preferred language"
            onDownload={() =>
              downloadFile(
                `/export/gradebook.csv${contestScope !== 'all' ? `?contestId=${contestScope}` : ''}`,
                `gradebook_${contestScope}.csv`
              )
            }
          />
          <ReportRow
            title="Violation Report"
            description="Tab-switch / camera-mic proctoring events, with warning number and auto-submit flag"
            onDownload={() =>
              downloadFile(
                `/export/contest-violations.csv${contestScope !== 'all' ? `?contestId=${contestScope}` : ''}`,
                `contest_violations_${contestScope}.csv`
              )
            }
          />
        </Card>
      )}

      {tab === 'quizzes' && (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold">Quiz Reports</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Filter Scope</span>
                <Select value={quizScope} onChange={(e) => setQuizScope(e.target.value)} className="!py-1.5 text-xs">
                  <option value="all">All Quizzes</option>
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>{q.title}</option>
                  ))}
                </Select>
              </div>
            </div>
            <ReportRow
              title="Grading Log"
              description="Score, max score, percentage, and letter grade per student, per quiz"
              onDownload={() =>
                downloadFile(
                  `/export/quiz-grading.csv${quizScope !== 'all' ? `?quizId=${quizScope}` : ''}`,
                  `quiz_grading_${quizScope}.csv`
                )
              }
            />
            <ReportRow
              title="Violation Report"
              description="Proctoring events during the quiz, with warning number and auto-submit flag"
              onDownload={() =>
                downloadFile(
                  `/export/quiz-violations.csv${quizScope !== 'all' ? `?quizId=${quizScope}` : ''}`,
                  `quiz_violations_${quizScope}.csv`
                )
              }
            />
          </Card>
          <GradeScaleEditor />
        </>
      )}
    </div>
  );
}

// ── Student view — own data only, read-only ─────────────────────────────────
function StudentReports() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-text-secondary text-sm mt-1">Your own submission history and quiz results, downloadable as CSV.</p>
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-1">My Submissions</h3>
        <p className="text-xs text-text-secondary mb-3">Every problem you've submitted, with verdict, runtime, and score.</p>
        <ReportRow
          title="Submission History"
          description="Across practice and every contest you've joined"
          onDownload={() => downloadFile('/export/my-submissions.csv', 'my_submissions.csv')}
        />
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-1">My Quiz Results</h3>
        <p className="text-xs text-text-secondary mb-3">Score, percentage, and letter grade for every quiz you've completed.</p>
        <ReportRow
          title="Quiz Results"
          description="Uses the grade scale your professor has configured"
          onDownload={() => downloadFile('/export/my-quiz-results.csv', 'my_quiz_results.csv')}
        />
      </Card>
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  if (!user) return <Skeleton className="h-96" />;
  return user.role === 'admin' ? <ProfessorReports /> : <StudentReports />;
}
