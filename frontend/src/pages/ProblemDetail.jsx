import { useEffect, useRef, useState, Fragment } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Use the locally bundled monaco-editor instead of fetching it from a CDN,
// since this app must run fully offline on a college LAN.
loader.config({ monaco });
import { Play, Send, Star, Clock, Cpu, ChevronRight, ShieldAlert, Lightbulb, Image as ImageIcon, X, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { renderMarkdownWithMath, renderConstraint } from '../lib/markdown';
import api from '../api/client';
import { DifficultyBadge, VerdictBadge, Button, Input, Select, Skeleton, useToast, Avatar } from '../components/ui';
import { useContestSocket } from '../hooks/useContestSocket';
import { useProctoring, blockPaste } from '../lib/proctoring';
import { ViolationWarningModal, AutoSubmitModal, PermissionPromptModal, ProctoringMiniPip, TestFrozenModal } from '../components/ProctoringModals';
import { useAuth } from '../context/AuthContext';

const LANG_TEMPLATES = {
  c: `#include <stdio.h>

int main(void){
    // write your solution here

    return 0;
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main(){
    // write your solution here

    return 0;
}
`,
  python: `# write your solution here
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // write your solution here
    }
}
`,
  javascript: `// write your solution here
const lines = require('fs').readFileSync('/dev/stdin', 'utf8').split('\\n');
`,
};

const LANG_LABELS = { c: 'C', cpp: 'C++', python: 'Python 3', java: 'Java', javascript: 'JavaScript' };
const MONACO_LANG = { c: 'c', cpp: 'cpp', python: 'python', java: 'java', javascript: 'javascript' };

export default function ProblemDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const contestId = searchParams.get('contestId');
  const isProctored = !!contestId;

  const toast = useToast();
  const { user } = useAuth();
  const [problem, setProblem] = useState(null);
  const [tab, setTab] = useState('statement');
  const [language, setLanguage] = useState('python');
  const [source, setSource] = useState(LANG_TEMPLATES.python);
  const [customInput, setCustomInput] = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [submissions, setSubmissions] = useState(null);
  const [expandedSubId, setExpandedSubId] = useState(null);
  const [expandedSubDetail, setExpandedSubDetail] = useState(null);
  const [loadingSubDetail, setLoadingSubDetail] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState(null);
  const [problemError, setProblemError] = useState(null);
  const editedRef = useRef(false);
  const editorRef = useRef(null);
  const statsRef = useRef({ keystrokes: 0, runs: 0, submits: 0 });

  const proctoring = useProctoring({
    enabled: isProctored,
    send: (payload) => sendSocket(payload),
    onFreeze: (reason) => {
      setLocked(true);
      setLockReason(reason);
    },
    onAutoSubmit: () => {
      setLocked(true);
      submitCode();
    },
  });

  const { send: sendSocket } = useContestSocket(isProctored ? contestId : null, {
    onMessage: (msg) => {
      if (msg.type === 'contest_control' && msg.action === 'end') {
        toast('The contest has ended — submitting your current code.', 'info');
        submitCode();
      }
      // The admin cleared this student's freeze from the monitor dashboard
      if (msg.type === 'contest_control' && msg.action === 'unlock' && msg.userId === user?.id) {
        setLocked(false);
        setLockReason(null);
        proctoring.resetWarnings();
        toast(`${msg.by || 'Your instructor'} re-enabled your test — you can continue.`, 'success');
      }
    },
  });

  // Server-authoritative check, run once on mount and periodically
  useEffect(() => {
    if (!isProctored) return undefined;
    const checkLock = () => {
      api
        .get(`/contests/${contestId}/lock-status`)
        .then(({ data }) => {
          if (locked && !data.locked) {
            proctoring.resetWarnings();
          }
          setLocked(data.locked);
          setLockReason(data.locked ? data.reason : null);
        })
        .catch(() => {});
    };
    checkLock();
    const interval = setInterval(checkLock, 8000);
    return () => clearInterval(interval);
  }, [isProctored, contestId, locked, proctoring]);

  // Periodically report live activity (keystrokes/runs/submits/code length)
  // to the admin's monitor view — never the code content itself, just counts.
  useEffect(() => {
    if (!isProctored) return undefined;
    const interval = setInterval(() => {
      sendSocket?.({
        type: 'activity',
        data: {
          keystrokes: statsRef.current.keystrokes,
          runs: statsRef.current.runs,
          submits: statsRef.current.submits,
          codeLength: source.length,
        },
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [isProctored, sendSocket, source.length]);

  useEffect(() => {
    setProblem(null);
    setProblemError(null);
    setSubmitResult(null);
    setRunResult(null);
    api
      .get(`/problems/${id}`)
      .then(({ data }) => setProblem(data.problem))
      .catch((err) => {
        setProblemError(err.response?.data?.error || 'Problem not found');
      });
  }, [id]);

  // Autosave drafts: practice mode only. Deliberately skipped during a
  // proctored contest attempt — restoring an old draft mid-exam would be
  // confusing, and the contest's own submission history already tracks that
  // scoped attempt. localStorage caps out around 5MB so per-problem source
  // snippets are trivially cheap to keep around indefinitely.
  const draftKey = `lj_draft:${id}:${language}`;
  useEffect(() => {
    if (isProctored) return;
    if (editedRef.current) return; // don't clobber code the person already typed after switching language
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      setSource(saved);
      editedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, language, isProctored]);

  useEffect(() => {
    if (isProctored || !editedRef.current) return undefined;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, source);
      } catch {
        // localStorage full or unavailable — autosave is a convenience, fail silently
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, draftKey, isProctored]);

  useEffect(() => {
    if (!editedRef.current) setSource(LANG_TEMPLATES[language]);
  }, [language]);

  useEffect(() => {
    if (tab === 'submissions') {
      api.get('/submissions', { params: { problemId: id } }).then(({ data }) => setSubmissions(data.submissions));
    }
  }, [tab, id]);

  // Toggle-expand a past submission to see the exact code + per-test
  // result that was recorded for it (submissions are never re-run).
  const toggleSubmission = async (subId) => {
    if (expandedSubId === subId) {
      setExpandedSubId(null);
      setExpandedSubDetail(null);
      return;
    }
    setExpandedSubId(subId);
    setExpandedSubDetail(null);
    setLoadingSubDetail(true);
    try {
      const { data } = await api.get(`/submissions/${subId}`);
      setExpandedSubDetail(data.submission);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to load submission', 'error');
    } finally {
      setLoadingSubDetail(false);
    }
  };

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: locked });
  }, [locked]);

  const runCode = async () => {
    if (locked) return toast('Your test is frozen — ask your instructor to re-enable it.', 'error');
    setRunning(true);
    setRunResult(null);
    statsRef.current.runs += 1;
    try {
      const { data } = await api.post('/submissions/run', { problemId: id, language, source, customInput, contestId: contestId || undefined });
      setRunResult(data);
    } catch (err) {
      toast(err.response?.data?.error || 'Run failed', 'error');
    } finally {
      setRunning(false);
    }
  };

  const submitCode = async () => {
    if (locked) return toast('Your test is frozen — ask your instructor to re-enable it.', 'error');
    setSubmitting(true);
    setSubmitResult(null);
    statsRef.current.submits += 1;
    try {
      const { data } = await api.post('/submissions', { problemId: id, language, source, contestId: contestId || undefined });
      setSubmitResult(data);
      toast(data.verdict === 'Accepted' ? 'Accepted! 🎉' : data.verdict, data.verdict === 'Accepted' ? 'success' : 'error');
    } catch (err) {
      toast(err.response?.data?.error || 'Submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (problemError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-border mb-4 flex items-center justify-center text-text-secondary text-2xl">
          ⚠️
        </div>
        <h2 className="text-xl font-bold mb-2">Problem Not Available</h2>
        <p className="text-text-secondary text-sm max-w-md mb-6">{problemError}</p>
        <button
          onClick={() => window.history.back()}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="grid lg:grid-cols-2 gap-4 h-[80vh]">
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
      </div>
    );
  }

  return (
    <>
      <ViolationWarningModal warning={proctoring.warning} onDismiss={proctoring.dismissWarning} />
      <AutoSubmitModal info={proctoring.autoSubmitted} />
      <PermissionPromptModal state={isProctored ? proctoring.permissionState : null} onRetry={proctoring.retry} />
      <ProctoringMiniPip
        stream={proctoring.stream}
        faceDetected={proctoring.faceDetected}
        audioLevel={proctoring.audioLevel}
        enabled={!!isProctored}
      />
      {locked && !proctoring.autoSubmitted && (
        <TestFrozenModal
          reason={lockReason || 'Repeated proctoring violations'}
          onTimeUp={() => {
            proctoring.triggerAutoSubmit('Exceeded 5 minutes in frozen state without instructor unlock');
            submitCode();
          }}
        />
      )}
      <div className="animate-fade-up grid lg:grid-cols-2 gap-4 lg:h-[calc(100vh-7rem)] lg:min-h-[600px]">
      {/* Left: statement / tabs */}
      <div className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden max-h-[70vh] lg:max-h-none">
        <div className="flex items-center gap-1 px-3 pt-3 border-b border-border shrink-0">
          {['statement', 'editorial', 'submissions', ...(isProctored ? [] : ['hints', 'solutions', 'discussion'])].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-2 text-sm font-medium rounded-t-lg capitalize transition-colors ${
                tab === t ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'statement' && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold">{problem.code_label || problem.title}</h1>
                <DifficultyBadge level={problem.difficulty} />
                <button className="ml-auto text-text-secondary hover:text-warning transition-colors"><Star size={17} /></button>
              </div>
              <p className="text-text-secondary text-xs mb-5">Acceptance: {problem.acceptance}% · Solved: {problem.solved}</p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {problem.tags.map((t) => (
                  <span key={t} className="text-[11px] text-text-secondary bg-white/5 border border-border rounded-full px-2.5 py-0.5">{t}</span>
                ))}
              </div>

              <div className="leading-relaxed text-[15px] mb-6 prose prose-invert max-w-none" dangerouslySetInnerHTML={renderMarkdownWithMath(problem.statement)} />

              <Section title="Input">{problem.input_desc}</Section>
              <Section title="Output">{problem.output_desc}</Section>
              {problem.constraints && (
                <div className="mb-6">
                  <h3 className="font-semibold text-base mb-2 text-text">Constraints</h3>
                  <ul className="text-text-secondary text-[15px] space-y-2">
                    {problem.constraints.split('\n').map((c) => c.trim()).filter(Boolean).map((c, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="text-text-secondary/60 mt-1 select-none">•</span>
                        <span className="inline-block leading-relaxed" dangerouslySetInnerHTML={renderConstraint(c)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {problem.samples.map((s, i) => (
                <div key={s.id} className="mb-5">
                  <h3 className="font-semibold text-sm mb-2">Example {i + 1}</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-text-secondary mb-1">Input</p>
                      <pre className="bg-surface border border-border rounded-xl p-3 font-mono text-xs overflow-x-auto">{s.input}</pre>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary mb-1">Output</p>
                      <pre className="bg-surface border border-border rounded-xl p-3 font-mono text-xs overflow-x-auto">{s.output}</pre>
                    </div>
                  </div>
                  {s.explanation && (
                    <div className="text-text-secondary text-sm mt-2">
                      <span className="font-medium text-text">Explanation: </span>
                      <span className="prose prose-invert prose-sm max-w-none inline" dangerouslySetInnerHTML={renderMarkdown(s.explanation)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'editorial' && (
            <div className="prose prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">{problem.editorial || 'No editorial available yet.'}</pre>
            </div>
          )}

          {tab === 'hints' && !isProctored && <HintsAccordion hints={problem.hints || []} />}

          {tab === 'solutions' && !isProctored && <SolutionsPanel problemId={id} />}

          {tab === 'submissions' && (
            <div>
              {!submissions ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : submissions.length === 0 ? (
                <p className="text-text-secondary text-sm text-center py-10">No submissions for this problem yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-secondary text-xs border-b border-border">
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Language</th>
                      <th className="pb-2 font-medium">Runtime</th>
                      <th className="pb-2 font-medium">Memory</th>
                      <th className="pb-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <Fragment key={s.id}>
                        <tr
                          onClick={() => toggleSubmission(s.id)}
                          className={`border-b border-border/60 last:border-0 cursor-pointer hover:bg-white/5 ${expandedSubId === s.id ? 'bg-white/5' : ''}`}
                        >
                          <td className="py-2.5"><VerdictBadge verdict={s.verdict} /></td>
                          <td className="py-2.5 capitalize">{s.language}</td>
                          <td className="py-2.5 text-text-secondary">{s.runtimeMs}ms</td>
                          <td className="py-2.5 text-text-secondary">{Math.round(s.memoryKb / 1024)}MB</td>
                          <td className="py-2.5 text-text-secondary">{new Date(s.submittedAt + 'Z').toLocaleString()}</td>
                        </tr>
                        {expandedSubId === s.id && (
                          <tr>
                            <td colSpan={5} className="pb-4">
                              {loadingSubDetail ? (
                                <Skeleton className="h-24" />
                              ) : expandedSubDetail ? (
                                <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-text-secondary">Submitted Code ({expandedSubDetail.language})</p>
                                    {expandedSubDetail.score != null && <span className="text-xs text-text-secondary">Score: {expandedSubDetail.score}%</span>}
                                  </div>
                                  <pre className="bg-bg border border-border rounded-lg p-3 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                                    {expandedSubDetail.source}
                                  </pre>
                                  {Array.isArray(expandedSubDetail.detail) && expandedSubDetail.detail.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-text-secondary mb-1.5">Test Case Results</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {expandedSubDetail.detail.map((d, i) => (
                                          <span
                                            key={i}
                                            title={d.verdict || d.status}
                                            className={`text-[11px] px-2 py-1 rounded-md border ${
                                              (d.verdict || d.status) === 'Accepted' || (d.verdict || d.status) === 'Passed'
                                                ? 'border-primary/40 text-primary bg-primary/5'
                                                : 'border-error/40 text-error bg-error/5'
                                            }`}
                                          >
                                            #{i + 1}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'discussion' && !isProctored && <DiscussionPanel problemId={id} />}
        </div>
      </div>

      {/* Right: editor */}
      <div className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden h-[75vh] lg:h-full">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
          <Select value={language} onChange={(e) => { editedRef.current = false; setLanguage(e.target.value); }} className="py-1.5">
            {Object.keys(LANG_LABELS).map((l) => (
              <option key={l} value={l}>{LANG_LABELS[l]}</option>
            ))}
          </Select>
          {isProctored && (
            <span className="flex items-center gap-1.5 text-xs text-warning font-medium">
              <ShieldAlert size={13} /> Copy/paste disabled during test
            </span>
          )}
          <span className="ml-auto text-xs text-text-secondary">Time limit: {problem.time_limit_ms}ms</span>
        </div>

        <div className="flex-1 min-h-[220px]">
          <Editor
            height="100%"
            theme="vs-dark"
            language={MONACO_LANG[language]}
            value={source}
            onChange={(v) => { editedRef.current = true; statsRef.current.keystrokes += 1; setSource(v ?? ''); }}
            onMount={(editor) => {
              editorRef.current = editor;
              if (isProctored) {
                editor.getDomNode()?.addEventListener('paste', blockPaste, true);
              }
              editor.updateOptions({ readOnly: locked });
            }}
            options={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', minimap: { enabled: false }, padding: { top: 14 }, scrollBeyondLastLine: false, readOnly: locked }}
          />
        </div>

        <div className="border-t border-border shrink-0">
          <div className="grid sm:grid-cols-2 gap-3 p-3">
            <div>
              <p className="text-xs text-text-secondary mb-1.5">Custom Input</p>
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Leave empty to use the first sample"
                rows={3}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs font-mono resize-none outline-none focus:border-primary/60"
              />
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1.5">Console Output</p>
              <div className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs font-mono h-[70px] overflow-y-auto">
                {running ? (
                  <span className="text-text-secondary">Running…</span>
                ) : runResult ? (
                  <>
                    <VerdictBadge verdict={runResult.verdict} />
                    <pre className="whitespace-pre-wrap mt-1">{runResult.output || runResult.stderr || '(no output)'}</pre>
                    <p className="text-text-secondary mt-1">{runResult.runtimeMs}ms · {Math.round(runResult.memoryKb / 1024)}MB</p>
                  </>
                ) : (
                  <span className="text-text-secondary">Run your code to see output here</span>
                )}
              </div>
            </div>
          </div>

          {submitResult && (
            <div className="px-3 pb-2">
              <div className={`rounded-xl border p-3 ${submitResult.verdict === 'Accepted' ? 'border-primary/30 bg-primary/5' : 'border-error/30 bg-error/5'}`}>
                <div className="flex items-center justify-between mb-1">
                  <VerdictBadge verdict={submitResult.verdict} size="lg" />
                  <span className="text-xs text-text-secondary">{submitResult.passed}/{submitResult.total} test cases passed</span>
                </div>
                {submitResult.compileError ? (
                  <pre className="text-xs font-mono text-error whitespace-pre-wrap mt-2">{submitResult.compileError}</pre>
                ) : (
                  <div className="flex gap-4 text-xs text-text-secondary mt-2">
                    <span className="flex items-center gap-1"><Clock size={12} /> {submitResult.runtimeMs}ms</span>
                    <span className="flex items-center gap-1"><Cpu size={12} /> {Math.round(submitResult.memoryKb / 1024)}MB</span>
                    <span>Score: {submitResult.score}/100</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 pb-3">
            <Button variant="ghost" onClick={runCode} disabled={running || locked}>
              <Play size={15} /> {running ? 'Running…' : 'Run Code'}
            </Button>
            <Button onClick={submitCode} disabled={submitting || locked} className="ml-auto">
              <Send size={15} /> {submitting ? 'Judging…' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  if (!children) return null;
  return (
    <div className="mb-6">
      <h3 className="font-semibold text-base mb-2 flex items-center gap-1 text-text">{title}</h3>
      <div className="text-text-secondary text-[15px] leading-relaxed prose prose-invert max-w-none" dangerouslySetInnerHTML={renderMarkdownWithMath(children)} />
    </div>
  );
}

function HintsAccordion({ hints }) {
  const [open, setOpen] = useState(null);
  if (!hints || hints.length === 0) {
    return <p className="text-text-secondary text-sm text-center py-10">No hints for this problem yet.</p>;
  }
  return (
    <div className="space-y-2">
      {hints.map((h, i) => (
        <div key={i} className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-white/5"
          >
            <span className="flex items-center gap-2"><Lightbulb size={14} className="text-warning" /> Hint {i + 1}</span>
            <ChevronRight size={14} className={`text-text-secondary transition-transform ${open === i ? 'rotate-90' : ''}`} />
          </button>
          {open === i && <div className="px-4 pb-3 text-sm text-text-secondary leading-relaxed">{h}</div>}
        </div>
      ))}
    </div>
  );
}

function DiscussionPanel({ problemId }) {
  const toast = useToast();
  const { user } = useAuth();
  const [posts, setPosts] = useState(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = () => api.get('/discussions', { params: { problemId } }).then(({ data }) => setPosts(data.posts));
  useEffect(() => { load(); }, [problemId]);

  const post = async () => {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      await api.post('/discussions', { problemId, body: text });
      setDraft('');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to post', 'error');
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/discussions/${id}`);
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to delete', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-start gap-2 mb-5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Share your thoughts or ask a question about this problem…"
          className="flex-1 bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 resize-y"
        />
        <Button onClick={post} disabled={posting || !draft.trim()} className="!px-4 shrink-0">Post</Button>
      </div>

      {!posts ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : posts.length === 0 ? (
        <p className="text-text-secondary text-sm text-center py-10">Discussion is empty. Be the first to ask a question about this problem.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <div key={p.id} className="flex items-start gap-2.5">
              <Avatar name={p.author_name} color={p.avatar_color} src={p.avatar_url} size={28} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.author_name}</span>
                  {p.author_role === 'admin' && <span className="text-[10px] text-primary bg-primary/10 border border-primary/30 rounded-full px-1.5 py-0.5">Professor</span>}
                  <span className="text-xs text-text-secondary">{new Date(p.created_at + 'Z').toLocaleString()}</span>
                  {(p.user_id === user?.id || user?.role === 'admin') && (
                    <button onClick={() => remove(p.id)} className="text-xs text-text-secondary hover:text-error ml-auto">Delete</button>
                  )}
                </div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap mt-0.5">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Renders user-authored markdown (solution posts, problem statements) as
// sanitized HTML. Never trust raw HTML from another user — always sanitize
// before injecting. `breaks: true` makes a single newline behave like the
// old plain-text rendering (line breaks preserved) so existing problem
// statements written before this feature still look the same; only new
// markdown syntax like images/code fences is new capability, not a visual
// change to old content.
marked.setOptions({ breaks: true });
function renderMarkdown(md) {
  return renderMarkdownWithMath(md);
}

const SOLUTION_TEMPLATE = `# Intuition
<!-- Describe your first thoughts on how to solve this problem. -->

# Approach
<!-- Describe your approach to solving the problem. -->

# Complexity
- Time complexity:
<!-- Add your time complexity here, e.g. $$O(n)$$ -->

- Space complexity:
<!-- Add your space complexity here, e.g. $$O(n)$$ -->

# Code
\`\`\`cpp
class Solution {
public:

};
\`\`\`
`;

function SolutionEditor({ problemId, onClose, onPosted }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const bodyRef = useRef(null);
  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [body, setBody] = useState(SOLUTION_TEMPLATE);
  const [showPreview, setShowPreview] = useState(true);
  const [posting, setPosting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((ts) => [...ts, t]);
    setTagInput('');
  };
  const removeTag = (t) => setTags((ts) => ts.filter((x) => x !== t));

  // Insert an uploaded image as markdown at the current cursor position,
  // so it renders exactly where the author placed it — not appended
  // to the end. Saved to local disk (see backend/routes/uploads.js).
  const insertImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post('/uploads/image', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const el = bodyRef.current;
      const cursor = el ? el.selectionStart : body.length;
      const snippet = `\n![image](${data.url})\n`;
      setBody((b) => b.slice(0, cursor) + snippet + b.slice(cursor));
    } catch (err) {
      toast(err.response?.data?.error || 'Image upload failed', 'error');
    } finally {
      setUploadingImage(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const post = async () => {
    if (!title.trim()) return toast('Give your solution a title', 'error');
    if (!body.trim()) return toast('Solution body cannot be empty', 'error');
    setPosting(true);
    try {
      const { data } = await api.post('/solutions', { problemId, title: title.trim(), tags, body });
      toast('Solution posted', 'success');
      onPosted(data.solution);
      onClose();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to post solution', 'error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden mb-5">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter your title"
          className="!bg-transparent !border-0 !px-0 text-base font-medium flex-1"
        />
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" onClick={onClose} className="!px-3 !py-1.5 text-xs">Cancel</Button>
          <Button onClick={post} disabled={posting} className="!px-3 !py-1.5 text-xs"><Send size={12} /> Post</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
            {t} <button onClick={() => removeTag(t)}><X size={10} /></button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="+ Tag"
          className="bg-transparent text-xs outline-none w-20 text-text-secondary"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadingImage}
          className="ml-auto flex items-center gap-1 text-xs text-text-secondary hover:text-primary"
        >
          <ImageIcon size={13} /> {uploadingImage ? 'Uploading…' : 'Insert Image'}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={insertImage} />
        <button onClick={() => setShowPreview((p) => !p)} className="text-xs text-text-secondary hover:text-text">
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      <div className={`grid ${showPreview ? 'sm:grid-cols-2' : 'grid-cols-1'} divide-x divide-border`}>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="w-full bg-surface px-4 py-3 text-xs font-mono outline-none resize-y"
        />
        {showPreview && (
          <div className="px-4 py-3 text-sm prose prose-invert max-w-none overflow-y-auto max-h-[420px]" dangerouslySetInnerHTML={renderMarkdown(body)} />
        )}
      </div>
    </div>
  );
}

function SolutionsPanel({ problemId }) {
  const toast = useToast();
  const { user } = useAuth();
  const [solutions, setSolutions] = useState(null);
  const [editing, setEditing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => api.get('/solutions', { params: { problemId } }).then(({ data }) => setSolutions(data.solutions));
  useEffect(() => { load(); }, [problemId]);

  const remove = async (id) => {
    try {
      await api.delete(`/solutions/${id}`);
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to delete', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">Community Solutions</p>
        {!editing && <Button variant="ghost" onClick={() => setEditing(true)} className="!px-3 !py-1.5 text-xs">+ New Solution</Button>}
      </div>

      {editing && (
        <SolutionEditor
          problemId={problemId}
          onClose={() => setEditing(false)}
          onPosted={(sol) => setSolutions((s) => [sol, ...(s || [])])}
        />
      )}

      {!solutions ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : solutions.length === 0 ? (
        <p className="text-text-secondary text-sm text-center py-10">No solutions posted yet. Be the first to share your approach.</p>
      ) : (
        <div className="space-y-3">
          {solutions.map((s) => (
            <div key={s.id} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-white/5 text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={s.author_name} color={s.avatar_color} src={s.avatar_url} size={26} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-text-secondary">
                      {s.author_name} · {new Date(s.created_at + 'Z').toLocaleDateString()}
                      {s.tags.length > 0 && ` · ${s.tags.join(', ')}`}
                    </p>
                  </div>
                </div>
                <ChevronRight size={14} className={`text-text-secondary shrink-0 transition-transform ${expandedId === s.id ? 'rotate-90' : ''}`} />
              </button>
              {expandedId === s.id && (
                <div className="px-4 pb-4 border-t border-border pt-3">
                  {(s.user_id === user?.id || user?.role === 'admin') && (
                    <button onClick={() => remove(s.id)} className="flex items-center gap-1 text-xs text-text-secondary hover:text-error mb-2 ml-auto">
                      <Trash2 size={11} /> Delete
                    </button>
                  )}
                  <div className="text-sm prose prose-invert max-w-none" dangerouslySetInnerHTML={renderMarkdown(s.body)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
