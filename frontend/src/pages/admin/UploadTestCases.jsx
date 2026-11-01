import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { UploadCloud, FileArchive, CheckCircle2 } from 'lucide-react';
import api from '../../api/client';
import { Card, Button, useToast, Skeleton } from '../../components/ui';

function DropZone({ file, setFile }) {
  const inputRef = useRef();
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
      }}
      onClick={() => inputRef.current.click()}
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
      {file ? (
        <>
          <CheckCircle2 className="mx-auto text-primary mb-3" size={30} />
          <p className="font-medium text-sm">{file.name}</p>
          <p className="text-text-secondary text-xs mt-1">{(file.size / 1024).toFixed(1)} KB — click to change</p>
        </>
      ) : (
        <>
          <UploadCloud className="mx-auto text-text-secondary mb-3" size={30} />
          <p className="font-medium text-sm">Click to upload</p>
          <p className="text-text-secondary text-xs mt-1">or drag and drop a .zip file</p>
        </>
      )}
    </div>
  );
}

export default function UploadTestCases() {
  const { id } = useParams();
  const toast = useToast();
  const [problem, setProblem] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [existing, setExisting] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    api.get(`/problems/${id}`).then(({ data }) => setProblem(data.problem));
    api.get(`/problems/${id}/testcases`).then(({ data }) => setExisting(data.testcases));
  }, [id]);

  const upload = async () => {
    if (!file) {
      toast('Please choose a ZIP file first', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('zip', file);
    setUploading(true);
    setProgress(0);
    try {
      const { data } = await api.post(`/problems/${id}/testcases`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => setProgress(Math.round((e.loaded / e.total) * 100)),
      });
      toast(`${data.testcasesSaved} test cases uploaded`, 'success');
      const { data: tc } = await api.get(`/problems/${id}/testcases`);
      setExisting(tc.testcases);
      setFile(null);
    } catch (err) {
      toast(err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Upload Test Cases</h1>
        <p className="text-text-secondary text-sm mt-1">
          {problem ? `For "${problem.title}"` : 'Loading problem…'}
        </p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="bg-surface border border-border rounded-xl p-4 text-xs text-text-secondary leading-relaxed">
          <p className="text-text font-medium mb-1 flex items-center gap-1.5"><FileArchive size={13} /> ZIP format expected</p>
          Pack matching pairs like <code className="text-primary">1.in</code> / <code className="text-primary">1.out</code>, <code className="text-primary">2.in</code> / <code className="text-primary">2.out</code>... Each pair becomes one test case. Uploading a new ZIP replaces all existing test cases for this problem.
        </div>

        <DropZone file={file} setFile={setFile} />

        {uploading && (
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <Button onClick={upload} disabled={uploading} className="w-full">
          {uploading ? `Uploading… ${progress}%` : 'Upload Files'}
        </Button>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Existing Test Cases</h3>
        {!existing ? (
          <Skeleton className="h-16" />
        ) : existing.length === 0 ? (
          <p className="text-text-secondary text-sm">No test cases uploaded yet — students can still Run/Submit against the sample examples in the meantime.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {existing.map((t) => (
              <span key={t.id} className="text-xs bg-white/5 border border-border rounded-lg px-2.5 py-1.5 font-mono">#{t.ordinal}</span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
