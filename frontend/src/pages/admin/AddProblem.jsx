import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Eye, Save, Plus, Trash2, Search, Image as ImageIcon, Upload } from 'lucide-react';
import api from '../../api/client';
import { Card, Button, Input, Select, DifficultyBadge, useToast } from '../../components/ui';

const FALLBACK_TAG_OPTIONS = ['Array', 'String', 'Math', 'Binary Search', 'Hash Table', 'Stack', 'Sorting', 'Graph', 'Shortest Path', 'Dynamic Programming'];

import { renderMarkdownWithMath, renderConstraint } from '../../lib/markdown';

export default function AddProblem() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('editor');
  const [saving, setSaving] = useState(false);
  const [tagOptions, setTagOptions] = useState(FALLBACK_TAG_OPTIONS);
  const [tagSearch, setTagSearch] = useState('');
  const [newTag, setNewTag] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [form, setForm] = useState({
    title: '', difficulty: 'Easy', tags: [], statement: '', inputDesc: '', outputDesc: '', constraints: '',
    timeLimitMs: 2000, memoryLimitMb: 256, editorial: '',
    samples: [{ input: '', output: '', explanation: '' }],
    hints: [],
  });

  useEffect(() => {
    api.get('/problems/tags').then(({ data }) => setTagOptions(data.tags)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      api.get(`/problems/${id}`).then(({ data }) => {
        const p = data.problem;
        setForm({
          title: p.title, difficulty: p.difficulty, tags: p.tags, statement: p.statement,
          inputDesc: p.input_desc, outputDesc: p.output_desc, constraints: p.constraints,
          timeLimitMs: p.time_limit_ms, memoryLimitMb: p.memory_limit_mb, editorial: p.editorial,
          samples: p.samples.length ? p.samples : [{ input: '', output: '', explanation: '' }],
          hints: p.hints || [],
        });
      });
    }
  }, [id, isEdit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleTag = (t) => setForm((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));

  // Add a brand-new tag: saves it to the shared tag list (so it shows up as
  // a preset for future problems too) and immediately selects it here.
  const addCustomTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    setAddingTag(true);
    try {
      const { data } = await api.post('/problems/tags', { tag: name });
      setTagOptions(data.tags);
      setForm((f) => (f.tags.includes(name) ? f : { ...f, tags: [...f.tags, name] }));
      setNewTag('');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to add tag', 'error');
    } finally {
      setAddingTag(false);
    }
  };

  const visibleTags = tagOptions.filter((t) => t.toLowerCase().includes(tagSearch.trim().toLowerCase()));

  // Import a problem statement/examples from a .pdf/.docx — parsed
  // entirely locally on the backend (no LLM). Pre-fills the same editable
  // fields used for manual entry; Difficulty/Time Limit/Tags are left for
  // the professor since a parser can't reliably infer those.
  const [importingFile, setImportingFile] = useState(false);
  const [importNotice, setImportNotice] = useState(null);
  const importProblemFile = async (file) => {
    if (!file) return;
    setImportingFile(true);
    setImportNotice(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/import/problem', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = data.draft;
      setForm((f) => ({
        ...f,
        title: d.title || f.title,
        statement: d.statement || f.statement,
        inputDesc: d.inputDesc || f.inputDesc,
        outputDesc: d.outputDesc || f.outputDesc,
        constraints: d.constraints || f.constraints,
        editorial: d.editorial || f.editorial,
        samples: d.samples && d.samples.length ? d.samples : f.samples,
      }));
      if (d.needsReview) {
        setImportNotice('Some sections could not be confidently detected — review the Title/Statement/Examples below before saving.');
      }
      toast('Imported — review the pre-filled fields before saving', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to import file', 'error');
    } finally {
      setImportingFile(false);
    }
  };

  // Inline images, placed wherever the professor's cursor is — in the
  // Statement or in a specific Example's Explanation — not a fixed slot.
  // Images are markdown syntax (![](url)) so ProblemDetail's markdown
  // renderer shows them in position; storage is local (see uploads.js).
  const statementRef = useRef(null);
  const explanationRefs = useRef({});
  const [uploadingImageFor, setUploadingImageFor] = useState(null);

  const insertImageInto = async (key, textareaEl, currentValue, setValue, file) => {
    if (!file) return;
    setUploadingImageFor(key);
    try {
      const body = new FormData();
      body.append('image', file);
      const { data } = await api.post('/uploads/image', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      const cursor = textareaEl ? textareaEl.selectionStart : currentValue.length;
      const snippet = `\n![image](${data.url})\n`;
      setValue(currentValue.slice(0, cursor) + snippet + currentValue.slice(cursor));
    } catch (err) {
      toast(err.response?.data?.error || 'Image upload failed', 'error');
    } finally {
      setUploadingImageFor(null);
    }
  };

  const setSample = (i, k, v) => setForm((f) => ({ ...f, samples: f.samples.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)) }));
  const addSample = () => setForm((f) => ({ ...f, samples: [...f.samples, { input: '', output: '', explanation: '' }] }));
  const removeSample = (i) => setForm((f) => ({ ...f, samples: f.samples.filter((_, idx) => idx !== i) }));

  const setHint = (i, v) => setForm((f) => ({ ...f, hints: f.hints.map((h, idx) => (idx === i ? v : h)) }));
  const addHint = () => setForm((f) => ({ ...f, hints: [...f.hints, ''] }));
  const removeHint = (i) => setForm((f) => ({ ...f, hints: f.hints.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.title || !form.statement) {
      toast('Title and statement are required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/problems/${id}`, form);
        toast('Problem updated', 'success');
      } else {
        const { data } = await api.post('/problems', form);
        toast('Problem created', 'success');
        navigate(`/admin/problems/${data.problem.id}/testcases`);
        return;
      }
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Edit Problem' : 'Add Problem'}</h1>
          <p className="text-text-secondary text-sm mt-1">Create a new problem for students to solve.</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary cursor-pointer border border-border rounded-xl px-3.5 py-2">
            <Upload size={14} /> {importingFile ? 'Importing…' : 'Import from File'}
            <input type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => importProblemFile(e.target.files?.[0])} />
          </label>
          <Button variant="ghost" onClick={() => setTab(tab === 'editor' ? 'preview' : 'editor')}>
            <Eye size={15} /> {tab === 'editor' ? 'Preview' : 'Edit'}
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      {importNotice && (
        <div className="bg-warning/5 border border-warning/30 rounded-xl p-3 text-xs text-warning">⚠ {importNotice}</div>
      )}

      {tab === 'editor' ? (
        <>
          <Card className="p-5 grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Problem Title</label>
              <Input value={form.title} onChange={set('title')} placeholder="e.g. Sum of Array" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Difficulty</label>
              <Select value={form.difficulty} onChange={set('difficulty')} className="w-full">
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Time Limit (ms)</label>
              <Input type="number" value={form.timeLimitMs} onChange={(e) => setForm((f) => ({ ...f, timeLimitMs: Number(e.target.value) }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Tags</label>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="relative flex-1 max-w-xs">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                  <Input
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags…"
                    className="!pl-8 !py-1.5 text-xs"
                  />
                </div>
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                  placeholder="New tag name"
                  className="!py-1.5 text-xs w-36"
                />
                <Button type="button" variant="ghost" onClick={addCustomTag} disabled={addingTag || !newTag.trim()} className="!px-2.5 !py-1.5 text-xs shrink-0">
                  <Plus size={12} /> Add Tag
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleTags.length === 0 && <span className="text-xs text-text-secondary">No tags match "{tagSearch}"</span>}
                {visibleTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.tags.includes(t) ? 'bg-primary/15 text-primary border-primary/40' : 'border-border text-text-secondary hover:text-text'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-text-secondary">Statement</label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary cursor-pointer">
                  <ImageIcon size={13} />
                  {uploadingImageFor === 'statement' ? 'Uploading…' : 'Insert Image'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      insertImageInto('statement', statementRef.current, form.statement, (v) => setForm((f) => ({ ...f, statement: v })), e.target.files?.[0])
                    }
                  />
                </label>
              </div>
              <textarea ref={statementRef} value={form.statement} onChange={set('statement')} rows={5} placeholder="Write problem statement here..." className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 resize-y" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Input Description</label>
                <textarea value={form.inputDesc} onChange={set('inputDesc')} rows={3} className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 resize-y" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Output Description</label>
                <textarea value={form.outputDesc} onChange={set('outputDesc')} rows={3} className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 resize-y" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Constraints (one per line)</label>
              <textarea value={form.constraints} onChange={set('constraints')} rows={2} className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 resize-y" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Editorial (markdown)</label>
              <textarea value={form.editorial} onChange={set('editorial')} rows={4} className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none focus:border-primary/60 resize-y" />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-text-secondary">Examples</label>
              <Button variant="ghost" onClick={addSample} className="!px-3 !py-1.5 text-xs"><Plus size={13} /> Add Example</Button>
            </div>
            <div className="space-y-4">
              {form.samples.map((s, i) => (
                <div key={i} className="border border-border rounded-xl p-4 grid sm:grid-cols-2 gap-3 relative">
                  {form.samples.length > 1 && (
                    <button onClick={() => removeSample(i)} className="absolute top-3 right-3 text-text-secondary hover:text-error"><Trash2 size={14} /></button>
                  )}
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Input Example</label>
                    <textarea value={s.input} onChange={(e) => setSample(i, 'input', e.target.value)} rows={3} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-primary/60 resize-y" />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Output Example</label>
                    <textarea value={s.output} onChange={(e) => setSample(i, 'output', e.target.value)} rows={3} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-primary/60 resize-y" />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-text-secondary">Explanation (optional)</label>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary cursor-pointer">
                        <ImageIcon size={12} />
                        {uploadingImageFor === `sample-${i}` ? 'Uploading…' : 'Insert Image'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className="hidden"
                          onChange={(e) =>
                            insertImageInto(`sample-${i}`, explanationRefs.current[i], s.explanation, (v) => setSample(i, 'explanation', v), e.target.files?.[0])
                          }
                        />
                      </label>
                    </div>
                    <textarea
                      ref={(el) => (explanationRefs.current[i] = el)}
                      value={s.explanation}
                      onChange={(e) => setSample(i, 'explanation', e.target.value)}
                      rows={2}
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/60 resize-y"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-text-secondary">Hints <span className="font-normal text-text-secondary/60">(shown to students outside contests, one at a time)</span></label>
              <Button variant="ghost" onClick={addHint} className="!px-3 !py-1.5 text-xs"><Plus size={13} /> Add Hint</Button>
            </div>
            {form.hints.length === 0 ? (
              <p className="text-xs text-text-secondary">No hints yet — students will just see the problem statement.</p>
            ) : (
              <div className="space-y-2">
                {form.hints.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-12 shrink-0">Hint {i + 1}</span>
                    <Input value={h} onChange={(e) => setHint(i, e.target.value)} placeholder="e.g. Try using a hash map to track seen values" />
                    <button onClick={() => removeHint(i)} className="text-text-secondary hover:text-error shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xl font-bold">{form.title || 'Untitled Problem'}</h2>
            <DifficultyBadge level={form.difficulty} />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {form.tags.map((t) => <span key={t} className="text-[11px] text-text-secondary bg-white/5 border border-border rounded-full px-2.5 py-0.5">{t}</span>)}
          </div>
          <div className="prose prose-invert max-w-none text-[15px] leading-relaxed mb-6" dangerouslySetInnerHTML={renderMarkdownWithMath(form.statement || 'No statement yet.')} />
          {form.inputDesc && (
            <div className="mb-6">
              <h3 className="font-semibold text-base mb-2 text-text">Input</h3>
              <div className="prose prose-invert max-w-none text-[15px] text-text-secondary leading-relaxed" dangerouslySetInnerHTML={renderMarkdownWithMath(form.inputDesc)} />
            </div>
          )}
          {form.outputDesc && (
            <div className="mb-6">
              <h3 className="font-semibold text-base mb-2 text-text">Output</h3>
              <div className="prose prose-invert max-w-none text-[15px] text-text-secondary leading-relaxed" dangerouslySetInnerHTML={renderMarkdownWithMath(form.outputDesc)} />
            </div>
          )}
          {form.constraints && (
            <div className="mb-6">
              <h3 className="font-semibold text-base mb-2 text-text">Constraints</h3>
              <ul className="text-text-secondary text-[15px] space-y-2">
                {form.constraints.split('\n').map((c) => c.trim()).filter(Boolean).map((c, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="text-text-secondary/60 mt-1 select-none">•</span>
                    <span className="inline-block leading-relaxed" dangerouslySetInnerHTML={renderConstraint(c)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {form.samples.map((s, i) => (
            <div key={i} className="mb-5">
              <p className="font-semibold text-sm mb-2 text-text">Example {i + 1}</p>
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
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
