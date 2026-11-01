import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, Ban, Activity, Trash2, Image as ImageIcon, Upload } from 'lucide-react';
import api from '../../api/client';
import { Card, Button, Input, Select, Skeleton, useToast, ConfirmDialog } from '../../components/ui';

const statusStyle = {
  Live: 'text-primary bg-primary/10 border-primary/30',
  Upcoming: 'text-warning bg-warning/10 border-warning/30',
  Finished: 'text-text-secondary bg-white/5 border-border',
};

const emptyQuestion = () => ({ text: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'a', points: 10, imageUrl: null });

export default function QuizManagement() {
  const toast = useToast();
  const [quizzes, setQuizzes] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', startTime: '', endTime: '', visibility: 'public', pin: '', proctored: true,
    layoutMode: 'single', requireAllAnswered: false,
    questions: [emptyQuestion()],
  });

  const load = () => api.get('/quizzes').then(({ data }) => setQuizzes(data.quizzes));
  useEffect(() => { load(); }, []);

  const setQ = (i, field, value) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q, idx) => (idx === i ? { ...q, [field]: value } : q)) }));
  const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, emptyQuestion()] }));
  const removeQuestion = (i) => setForm((f) => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));

  const [uploadingImageFor, setUploadingImageFor] = useState(null);
  const uploadQuestionImage = async (i, file) => {
    if (!file) return;
    setUploadingImageFor(i);
    try {
      const body = new FormData();
      body.append('image', file);
      const { data } = await api.post('/uploads/image', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setQ(i, 'imageUrl', data.url);
    } catch (err) {
      toast(err.response?.data?.error || 'Image upload failed', 'error');
    } finally {
      setUploadingImageFor(null);
    }
  };

  // Import questions from a .pdf/.docx — parsed entirely locally on the
  // backend (no LLM). Parsed questions are appended as normal, editable
  // Q-blocks; nothing is saved until the professor hits "Save Quiz".
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState([]);
  const importQuizFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportWarnings([]);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/import/quiz', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm((f) => {
        const wasEmpty = f.questions.length === 1 && !f.questions[0].text;
        const base = wasEmpty ? [] : f.questions;
        return { ...f, questions: [...base, ...data.questions.map((q) => ({ ...q, imageUrl: null }))] };
      });
      setImportWarnings(data.warnings || []);
      toast(`Imported ${data.questions.length} question${data.questions.length === 1 ? '' : 's'} — review before saving`, 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to import file', 'error');
    } finally {
      setImporting(false);
    }
  };

  const create = async () => {
    if (!form.title || !form.startTime || !form.endTime) return toast('Title, start and end time are required', 'error');
    if (form.pin && !/^[0-9]{4,8}$/.test(form.pin.trim())) return toast('PIN must be 4–8 digits (or leave it blank)', 'error');
    const incomplete = form.questions.some((q) => !q.text || !q.optionA || !q.optionB || !q.optionC || !q.optionD);
    if (incomplete) return toast('Every question needs text and all four options filled in', 'error');

    setSaving(true);
    try {
      await api.post('/quizzes', {
        ...form,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        pin: form.pin.trim() || undefined,
      });
      toast('Quiz created', 'success');
      setShowForm(false);
      setForm({ title: '', description: '', startTime: '', endTime: '', visibility: 'public', pin: '', proctored: true, layoutMode: 'single', requireAllAnswered: false, questions: [emptyQuestion()] });
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to create quiz', 'error');
    } finally {
      setSaving(false);
    }
  };

  const endQuiz = async (id) => {
    if (!confirm('End this quiz now? Anyone still in progress will be auto-submitted.')) return;
    await api.post(`/quizzes/${id}/end`);
    toast('Quiz ended', 'success');
    load();
  };

  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title } | null
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/quizzes/${deleteTarget.id}`);
      toast('Quiz deleted', 'success');
      setQuizzes((rows) => rows.filter((q) => q.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to delete quiz', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quiz Management</h1>
          <p className="text-text-secondary text-sm mt-1">Create and manage MCQ assessments — proctored the same way as coding contests.</p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Cancel' : 'Create Quiz'}
        </Button>
      </div>

      {showForm && (
        <Card className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Quiz Title</label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Unit 3 Assessment" />
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
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Join PIN <span className="text-text-secondary/60 font-normal">(optional)</span>
              </label>
              <Input
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) }))}
                placeholder="Leave blank for no PIN"
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.proctored} onChange={(e) => setForm((f) => ({ ...f, proctored: e.target.checked }))} className="accent-primary" />
                Enable proctoring (camera/mic/tab-switch monitoring)
              </label>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Question Layout</label>
              <Select value={form.layoutMode} onChange={(e) => setForm((f) => ({ ...f, layoutMode: e.target.value }))} className="w-full">
                <option value="single">All questions on one page</option>
                <option value="paged">One question per page (with next/previous)</option>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requireAllAnswered}
                  onChange={(e) => setForm((f) => ({ ...f, requireAllAnswered: e.target.checked }))}
                  className="accent-primary"
                />
                Students must answer every question before submitting
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">Questions ({form.questions.length})</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary cursor-pointer border border-border rounded-lg px-3 py-1.5">
                  <Upload size={12} /> {importing ? 'Importing…' : 'Import from File'}
                  <input type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => importQuizFile(e.target.files?.[0])} />
                </label>
                <Button variant="ghost" onClick={addQuestion} className="!px-3 !py-1.5 text-xs"><Plus size={13} /> Add Question</Button>
              </div>
            </div>
            {importWarnings.length > 0 && (
              <div className="bg-warning/5 border border-warning/30 rounded-xl p-3 text-xs text-warning space-y-1">
                {importWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}
            {form.questions.map((q, i) => (
              <div key={i} className="border border-border rounded-xl p-4 space-y-3 relative">
                {form.questions.length > 1 && (
                  <button onClick={() => removeQuestion(i)} className="absolute top-3 right-3 text-text-secondary hover:text-error">
                    <Trash2 size={14} />
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-secondary">Q{i + 1}</span>
                  {q.needsReview && (
                    <span className="text-[10px] text-warning bg-warning/10 border border-warning/30 rounded-full px-2 py-0.5 shrink-0">Needs review</span>
                  )}
                  <Input value={q.text} onChange={(e) => setQ(i, 'text', e.target.value)} placeholder="Question text" className="flex-1" />
                  <input
                    type="number"
                    min={1}
                    value={q.points}
                    onChange={(e) => setQ(i, 'points', Number(e.target.value))}
                    className="w-16 bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-right outline-none focus:border-primary/60"
                  />
                  <span className="text-[10px] text-text-secondary shrink-0">pts</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary cursor-pointer">
                    <ImageIcon size={13} />
                    {uploadingImageFor === i ? 'Uploading…' : q.imageUrl ? 'Replace Image' : 'Add Image'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => uploadQuestionImage(i, e.target.files?.[0])}
                    />
                  </label>
                  {q.imageUrl && (
                    <>
                      <img src={q.imageUrl} alt="" className="h-10 rounded-lg border border-border object-cover" />
                      <button onClick={() => setQ(i, 'imageUrl', null)} className="text-text-secondary hover:text-error"><X size={13} /></button>
                    </>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {['A', 'B', 'C', 'D'].map((letter) => (
                    <label key={letter} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${i}`}
                        checked={q.correctOption === letter.toLowerCase()}
                        onChange={() => setQ(i, 'correctOption', letter.toLowerCase())}
                        className="accent-primary"
                        title="Mark as correct answer"
                      />
                      <Input
                        value={q[`option${letter}`]}
                        onChange={(e) => setQ(i, `option${letter}`, e.target.value)}
                        placeholder={`Option ${letter}`}
                        className="flex-1"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button onClick={create} disabled={saving} className="w-full">{saving ? 'Creating…' : 'Save Quiz'}</Button>
        </Card>
      )}

      {!quizzes ? (
        <Skeleton className="h-60" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary text-xs border-b border-border">
                <th className="py-3 px-5 font-medium">Title</th>
                <th className="py-3 px-5 font-medium">Status</th>
                <th className="py-3 px-5 font-medium">Questions</th>
                <th className="py-3 px-5 font-medium">Participants</th>
                <th className="py-3 px-5 font-medium">Start</th>
                <th className="py-3 px-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map((q) => (
                <tr key={q.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 px-5 font-medium">
                    <div className="flex items-center gap-2">
                      {q.title}
                      {q.hasPin && (
                        <span className="text-[10px] font-medium text-warning bg-warning/10 border border-warning/30 rounded-full px-2 py-0.5" title={q.pin ? `PIN: ${q.pin}` : 'PIN protected'}>
                          🔒 {q.pin || 'PIN'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-5"><span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${statusStyle[q.status]}`}>{q.status}</span></td>
                  <td className="py-2.5 px-5 text-text-secondary">{q.questionCount} <span className="text-text-secondary/60">({q.totalPoints} pts)</span></td>
                  <td className="py-2.5 px-5 text-text-secondary">{q.participants}</td>
                  <td className="py-2.5 px-5 text-text-secondary">{new Date(q.start_time).toLocaleString()}</td>
                  <td className="py-2.5 px-5">
                    <div className="flex items-center justify-end gap-2">
                      {q.status === 'Live' && (
                        <Button variant="danger" onClick={() => endQuiz(q.id)} className="!px-3 !py-1.5 text-xs">
                          <Ban size={12} /> End
                        </Button>
                      )}
                      <Link to={`/admin/quizzes/${q.id}/monitor`}>
                        <Button variant="ghost" className="!px-3 !py-1.5 text-xs">
                          <Activity size={12} /> Monitor
                        </Button>
                      </Link>
                      <button
                        onClick={() => setDeleteTarget({ id: q.id, title: q.title })}
                        className="text-text-secondary hover:text-error p-1.5"
                        title="Delete this quiz"
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
        message="This permanently removes the quiz, its questions, and all student answers/violations for it. This can't be undone."
        confirmLabel="Delete Quiz"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
