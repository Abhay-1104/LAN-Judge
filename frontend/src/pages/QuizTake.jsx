import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Lock, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Input, Skeleton, useToast, ConfirmDialog } from '../components/ui';
import { useQuizSocket } from '../hooks/useQuizSocket';
import { useProctoring } from '../lib/proctoring';
import { ViolationWarningModal, AutoSubmitModal, PermissionPromptModal, ProctoringMiniPip, TestFrozenModal } from '../components/ProctoringModals';

// mm:ss (or hh:mm:ss once past an hour) countdown label.
function formatDuration(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function QuizTake() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({}); // questionId -> 'a'|'b'|'c'|'d'
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [joining, setJoining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);
  const [serverLocked, setServerLocked] = useState(false);
  const [serverLockReason, setServerLockReason] = useState(null);
  const [proctoringFrozen, setProctoringFrozen] = useState(false);
  const [proctoringFreezeReason, setProctoringFreezeReason] = useState(null);
  // Combined: frozen if either server locked or proctoring froze
  const locked = serverLocked || proctoringFrozen;
  const lockReason = proctoringFreezeReason || serverLockReason;
  const [current, setCurrent] = useState(0); // active question index, paged mode only
  const [now, setNow] = useState(Date.now());
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);

  const load = () => api.get(`/quizzes/${id}`).then(({ data }) => {
    setQuiz(data.quiz);
    if (data.quiz.submitted) fetchResults();
    // Pre-fill any answers already saved server-side (e.g. resuming after a
    // page refresh) so the tracker/highlighted options are accurate immediately.
    if (data.quiz.myAnswers) setAnswers(data.quiz.myAnswers);
  });

  useEffect(() => { load(); }, [id]);

  const fetchResults = () => api.get(`/quizzes/${id}/results`).then(({ data }) => setResults(data)).catch(() => {});

  const isProctored = quiz?.joined && !quiz?.submitted && quiz?.proctored && quiz?.status === 'Live';
  const isPaged = quiz?.layout_mode === 'paged';

  // Live countdown, ticking every second while the quiz is joined and open.
  useEffect(() => {
    if (!quiz?.joined || quiz?.submitted || quiz?.status !== 'Live') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [quiz?.joined, quiz?.submitted, quiz?.status]);

  const msLeft = quiz ? new Date(quiz.end_time).getTime() - now : 0;

  const submitQuiz = useCallback(async (force = false) => {
    setSubmitting(true);
    try {
      await api.post(`/quizzes/${id}/submit`, { force });
      toast('Quiz submitted', 'success');
      load();
      fetchResults();
    } catch (err) {
      toast(err.response?.data?.error || 'Submit failed', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [id]);

  // Time's up — auto-submit with whatever's answered, bypassing the
  // "answer everything" requirement (a hard deadline always wins).
  useEffect(() => {
    if (!quiz?.joined || quiz?.submitted || quiz?.status !== 'Live') return;
    if (msLeft <= 0) submitQuiz(true);
  }, [msLeft, quiz?.joined, quiz?.submitted, quiz?.status, submitQuiz]);

  const proctoring = useProctoring({
    enabled: !!isProctored,
    send: (payload) => sendSocket(payload),
    onFreeze: (reason) => {
      // Track proctoring-freeze separately so the server poll can't override it
      setProctoringFrozen(true);
      setProctoringFreezeReason(reason);
    },
    onAutoSubmit: () => submitQuiz(true),
  });

  const { send: sendSocket } = useQuizSocket(isProctored ? id : null, {
    onMessage: (msg) => {
      if (msg.type === 'quiz_control' && msg.action === 'end') {
        toast('The quiz has ended — submitting your answers.', 'info');
        submitQuiz(true);
      }
      if (msg.type === 'quiz_control' && msg.action === 'unlock' && msg.userId === user?.id) {
        setServerLocked(false);
        setServerLockReason(null);
        setProctoringFrozen(false);
        setProctoringFreezeReason(null);
        proctoring.resetWarnings();
        toast(`${msg.by || 'Your instructor'} re-enabled your test — you can continue.`, 'success');
      }
    },
  });

  useEffect(() => {
    if (!isProctored) return undefined;
    const checkLock = () => {
      api.get(`/quizzes/${id}/lock-status`).then(({ data }) => {
        // If the SERVER previously had a lock and now it's lifted, reset warnings
        // (but only for server-originated locks — proctoring freeze is managed separately
        //  so the poll can never silently un-freeze a proctoring violation)
        if (serverLocked && !data.locked) {
          proctoring.resetWarnings();
        }
        setServerLocked(data.locked);
        setServerLockReason(data.locked ? data.reason : null);
        // If the server explicitly unlocked AND we were proctoring-frozen, let the
        // professor's decision also clear the proctoring freeze
        if (!data.locked && data.professorUnlocked) {
          setProctoringFrozen(false);
          setProctoringFreezeReason(null);
          proctoring.resetWarnings();
        }
      }).catch(() => {});
    };
    checkLock();
    const interval = setInterval(checkLock, 8000);
    return () => clearInterval(interval);
  }, [isProctored, id, serverLocked, proctoring]);

  const join = async (pin) => {
    setJoining(true);
    try {
      await api.post(`/quizzes/${id}/join`, pin ? { pin } : undefined);
      toast('Joined the quiz', 'success');
      setPinPrompt(false);
      setPinValue('');
      load();
    } catch (err) {
      if (err.response?.data?.pinRequired) {
        setPinPrompt(true);
        if (pin) toast(err.response.data.error || 'Incorrect PIN', 'error');
        else toast('This quiz requires a PIN to join', 'info');
      } else {
        toast(err.response?.data?.error || err.message || 'Failed to join quiz', 'error');
      }
    } finally {
      setJoining(false);
    }
  };

  const selectAnswer = async (questionId, option) => {
    if (locked) return toast('Your test is frozen — ask your instructor to re-enable it.', 'error');
    setAnswers((a) => ({ ...a, [questionId]: option }));
    try {
      await api.post(`/quizzes/${id}/answer`, { questionId, selectedOption: option });
      sendSocket?.({ type: 'activity', data: { answered: Object.keys(answers).length + 1 } });
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to save answer', 'error');
    }
  };

  const answeredCount = quiz ? quiz.questions.filter((q) => answers[q.id]).length : 0;
  const unansweredCount = quiz ? quiz.questions.length - answeredCount : 0;

  const doSubmit = () => submitQuiz(false);

  // "Save" doesn't need a separate API call — every answer already
  // autosaves the instant it's picked — but it gives students a clear,
  // explicit confirmation that nothing will be lost if they step away.
  const saveProgress = () => {
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2000);
  };

  if (!quiz) return <Skeleton className="h-96" />;

  if (results) {
    return (
      <div className="space-y-5 animate-fade-up max-w-3xl">
        <Card className="p-6 text-center">
          <p className="text-text-secondary text-sm mb-1">Your Score</p>
          <p className="text-4xl font-bold text-primary">{results.score} / {results.totalPoints}</p>
          <p className="text-text-secondary text-sm mt-2">{results.correct} of {results.totalQuestions} questions correct</p>
        </Card>
        <div className="space-y-3">
          {results.breakdown.map((q, i) => (
            <Card key={q.id} className={`p-4 border ${q.isCorrect ? 'border-primary/30' : 'border-error/30'}`}>
              <div className="flex items-start gap-2 mb-2">
                {q.isCorrect ? <CheckCircle2 size={16} className="text-primary shrink-0 mt-0.5" /> : <XCircle size={16} className="text-error shrink-0 mt-0.5" />}
                <p className="font-medium text-sm">Q{i + 1}. {q.text}</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-1.5 ml-6 text-xs">
                {Object.entries(q.options).map(([letter, text]) => (
                  <div
                    key={letter}
                    className={`px-2.5 py-1.5 rounded-lg border ${
                      letter === q.correctOption ? 'border-primary/40 bg-primary/5 text-primary' :
                      letter === q.selectedOption ? 'border-error/40 bg-error/5 text-error' : 'border-border text-text-secondary'
                    }`}
                  >
                    {letter.toUpperCase()}. {text}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const visibleQuestions = isPaged && quiz.joined ? [quiz.questions[current]].filter(Boolean) : quiz.questions;

  return (
    <>
      <ViolationWarningModal warning={proctoring.warning} onDismiss={proctoring.dismissWarning} />
      <AutoSubmitModal info={proctoring.autoSubmitted} />
      <PermissionPromptModal state={isProctored && quiz.joined ? proctoring.permissionState : null} onRetry={proctoring.retry} />
      <ProctoringMiniPip
        stream={proctoring.stream}
        faceDetected={proctoring.faceDetected}
        audioLevel={proctoring.audioLevel}
        enabled={!!(isProctored && quiz.joined)}
      />
      {locked && !proctoring.autoSubmitted && (
        <TestFrozenModal
          reason={lockReason || 'Repeated proctoring violations'}
          onTimeUp={() => {
            proctoring.triggerAutoSubmit('Exceeded 5 minutes in frozen state without instructor unlock');
            submitQuiz(true);
          }}
        />
      )}

      <div className="grid lg:grid-cols-[1fr_240px] gap-5 items-start animate-fade-up max-w-5xl">
        <div className="space-y-5 pb-32 sm:pb-12">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold">{quiz.title}</h1>
                <p className="text-text-secondary text-sm mt-1">{quiz.description}</p>
              </div>
              {quiz.joined && !quiz.submitted && quiz.status === 'Live' && (
                <span className={`flex items-center gap-1.5 text-sm font-mono font-semibold shrink-0 px-3 py-1.5 rounded-lg border ${
                  msLeft < 60000 ? 'text-error border-error/40 bg-error/5' : 'text-text border-border'
                }`}>
                  <Clock size={14} /> {formatDuration(msLeft)}
                </span>
              )}
              {(!quiz.joined || quiz.submitted) && quiz.status !== 'Finished' && (
                <span className="flex items-center gap-1.5 text-xs text-text-secondary shrink-0">
                  <Clock size={13} /> Ends {new Date(quiz.end_time).toLocaleTimeString()}
                </span>
              )}
            </div>
          </Card>

          {!quiz.joined && (
            <Card className="p-8 text-center max-w-md mx-auto space-y-4">
              <h2 className="text-lg font-bold">Ready to begin?</h2>
              <p className="text-text-secondary text-sm">
                This quiz has {quiz.questions.length} questions.
                {quiz.layout_mode === 'paged' ? ' Questions are presented one at a time.' : ' All questions are shown on a single page.'}
                {quiz.require_all_answered ? ' You must answer every question before submitting.' : ''}
              </p>
              {isProctored && (
                <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-xl p-3">
                  Camera and tab-switch monitoring are enabled for this quiz.
                </p>
              )}
              {(quiz.hasPin || quiz.pin) && !pinPrompt && (
                <p className="text-xs text-text-secondary flex items-center justify-center gap-1.5">
                  <Lock size={13} /> This quiz requires an access PIN
                </p>
              )}
              {pinPrompt ? (
                <div className="space-y-3 pt-2">
                  <div className="text-left">
                    <label className="text-xs font-medium text-text-secondary mb-1.5 block">Enter quiz PIN</label>
                    <Input
                      value={pinValue}
                      onChange={(e) => setPinValue(e.target.value.trim().slice(0, 16))}
                      placeholder="e.g. 12345"
                      inputMode="numeric"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && pinValue && join(pinValue)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setPinPrompt(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={() => join(pinValue)} disabled={joining || !pinValue} className="flex-1">
                      {joining ? 'Starting…' : 'Start Quiz'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => (quiz.hasPin || quiz.pin ? setPinPrompt(true) : join())} disabled={joining} className="w-full">
                  {(quiz.hasPin || quiz.pin) && <Lock size={14} />}
                  {joining ? 'Starting…' : 'Start Quiz'}
                </Button>
              )}
            </Card>
          )}

          {quiz.joined && !quiz.submitted && (
            <>
              {isPaged && (
                <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                  <Button
                    variant="ghost"
                    onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                    disabled={current === 0}
                    className="!px-3"
                  >
                    <ChevronLeft size={14} /> Previous
                  </Button>
                  <span className="font-medium">Question {current + 1} of {quiz.questions.length}</span>
                  <Button
                    variant="ghost"
                    onClick={() => setCurrent((c) => Math.min(quiz.questions.length - 1, c + 1))}
                    disabled={current === quiz.questions.length - 1}
                    className="!px-3"
                  >
                    Next <ChevronRight size={14} />
                  </Button>
                </div>
              )}

              {visibleQuestions.map((q) => {
                const qIndex = quiz.questions.findIndex((x) => x.id === q.id);
                return (
                  <Card key={q.id} className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-semibold text-base leading-snug">
                        Q{qIndex + 1}. {q.question_text}
                      </h2>
                      <span className="text-xs text-text-secondary shrink-0 font-mono">{q.points} pts</span>
                    </div>
                    {q.image_url && (
                      <img src={q.image_url} alt="" className="max-h-64 rounded-xl border border-border object-contain mb-3" />
                    )}
                    <div className="grid sm:grid-cols-2 gap-2">
                      {['a', 'b', 'c', 'd'].map((letter) => (
                        <button
                          key={letter}
                          onClick={() => selectAnswer(q.id, letter)}
                          disabled={locked}
                          className={`text-left px-3.5 py-2.5 rounded-xl border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            answers[q.id] === letter ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'
                          }`}
                        >
                          <span className="font-mono text-xs mr-2">{letter.toUpperCase()}</span>
                          {q[`option_${letter}`]}
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}

              {isPaged && current < quiz.questions.length - 1 ? (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setCancelPrompt(true)} disabled={submitting} className="!px-4">
                    Cancel
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="subtle" onClick={saveProgress} className="!px-4">
                      <Save size={14} /> {saveNotice ? 'Saved!' : 'Save'}
                    </Button>
                    <Button onClick={() => setCurrent((c) => Math.min(quiz.questions.length - 1, c + 1))} className="!px-4">
                      Next <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setCancelPrompt(true)} disabled={submitting} className="!px-4">
                    Cancel
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="subtle" onClick={saveProgress} className="!px-4">
                      <Save size={14} /> {saveNotice ? 'Saved!' : 'Save'}
                    </Button>
                    <Button onClick={doSubmit} disabled={submitting || locked} className="!px-5">
                      {submitting ? 'Submitting…' : 'Submit Quiz'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {quiz.joined && !quiz.submitted && (
          <Card className="p-4 lg:sticky lg:top-4 order-first lg:order-last">
            <p className="text-xs font-semibold text-text-secondary mb-3">
              {answeredCount} answered · {unansweredCount} unanswered
              {Boolean(quiz.require_all_answered) && unansweredCount > 0 && (
                <span className="block text-error mt-1">You must answer every question to submit.</span>
              )}
            </p>
            <div className="grid grid-cols-6 lg:grid-cols-5 gap-1.5">
              {quiz.questions.map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => isPaged && setCurrent(i)}
                  className={`aspect-square rounded-lg text-xs font-medium flex items-center justify-center border transition-colors ${
                    answers[q.id]
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-white/5 border-border text-text-secondary'
                  } ${isPaged && current === i ? 'ring-2 ring-primary' : ''} ${isPaged ? 'cursor-pointer' : 'cursor-default'}`}
                  title={answers[q.id] ? 'Answered' : 'Not answered'}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={cancelPrompt}
        title="Leave this quiz?"
        message="Your answers so far are already saved. You can come back and pick up where you left off before the timer runs out."
        confirmLabel="Leave Quiz"
        danger={false}
        onConfirm={() => navigate('/quizzes')}
        onCancel={() => setCancelPrompt(false)}
      />
    </>
  );
}
