import { useEffect, useState } from 'react';
import { RefreshCw, Wifi, CheckCircle2, XCircle, Cpu, HardDrive, Clock, ShieldCheck, Download, Check, Copy } from 'lucide-react';
import api from '../../api/client';
import { Card, Button, Skeleton } from '../../components/ui';

export default function LanDiagnostic() {
  const [diag, setDiag] = useState(null);
  const [health, setHealth] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const load = async () => {
    const [d, h] = await Promise.all([api.get('/system/diagnostics'), api.get('/system/health')]);
    setDiag(d.data);
    setHealth(h.data);
  };

  useEffect(() => {
    load();
    const t = setInterval(() => api.get('/system/health').then(({ data }) => setHealth(data)), 5000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const copyUrl = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!diag || !health) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">LAN Diagnostic</h1>
          <p className="text-text-secondary text-xs sm:text-sm mt-1">Check this before students sit down — verify network access, compilers, and proctoring readiness.</p>
        </div>
        <Button variant="ghost" onClick={refresh} disabled={refreshing} className="shadow-theme-xs">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Re-check
        </Button>
      </div>

      {/* Server Access URLs */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wifi size={18} className="text-primary" />
          <div>
            <h3 className="font-semibold text-sm sm:text-base">Server Access URLs</h3>
            <p className="text-xs text-text-secondary mt-0.5">Use localhost on this laptop; give the Wi-Fi address to students on other devices.</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Localhost access for this machine */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface border border-border rounded-xl p-3 sm:p-3.5 gap-2.5">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-text block">This Laptop / Host (Localhost)</span>
              <p className="text-[11px] text-text-secondary">Use this when testing on this computer</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <code className="text-primary font-mono text-xs sm:text-sm bg-primary/10 px-2.5 py-1 rounded-lg">
                https://localhost:{diag.port}
              </code>
              <button
                type="button"
                onClick={() => copyUrl(`https://localhost:${diag.port}`, 'localhost')}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-black/5 dark:hover:bg-white/5 text-text-secondary hover:text-text transition-colors"
                title="Copy URL"
              >
                {copiedKey === 'localhost' ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                <span>{copiedKey === 'localhost' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Network / LAN access for students */}
          {diag.hostIps && diag.hostIps.length > 0 ? (
            diag.hostIps.map((ip) => (
              <div key={ip.address} className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface border border-border rounded-xl p-3 sm:p-3.5 gap-2.5">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-text block">Students & Lab PCs ({ip.interface})</span>
                  <p className="text-[11px] text-text-secondary">Your machine's local Wi-Fi IP address on the college network</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <code className="text-primary font-mono text-xs sm:text-sm bg-primary/10 px-2.5 py-1 rounded-lg">
                    https://{ip.address}:{diag.port}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyUrl(`https://${ip.address}:${diag.port}`, ip.address)}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-black/5 dark:hover:bg-white/5 text-text-secondary hover:text-text transition-colors"
                    title="Copy URL"
                  >
                    {copiedKey === ip.address ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                    <span>{copiedKey === ip.address ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-text-secondary text-xs bg-surface p-3 rounded-xl border border-border">
              No non-internal network interface detected. Ensure Wi-Fi or Ethernet is connected.
            </p>
          )}
        </div>
      </Card>

      {/* Proctoring & Camera Setup Card */}
      <Card className="p-4 sm:p-5 border-primary/20 bg-primary/[0.02]">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h3 className="font-semibold text-sm sm:text-base">Camera & Mic Proctoring Setup (Other Laptops / PCs)</h3>
          </div>
          <a
            href="/api/system/certificate"
            download="localjudge-root-ca.crt"
            className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-brand-600 transition-colors shadow-theme-xs"
          >
            <Download size={13} /> Download Security Certificate (.crt)
          </a>
        </div>

        <p className="text-xs text-text-secondary mb-3 leading-relaxed">
          Modern browsers require a trusted secure connection to grant camera and microphone access. To enable proctoring on student devices:
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 text-xs">
          <div className="bg-surface border border-border rounded-xl p-3 space-y-1.5">
            <p className="font-semibold text-text flex items-center gap-1">
              <span>Method 1 (Recommended):</span>
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">Install Certificate</span>
            </p>
            <p className="text-text-secondary leading-relaxed">
              1. Download the certificate above onto the student PC.
            </p>
            <p className="text-text-secondary leading-relaxed">
              2. Double click the file → click <strong>Install Certificate</strong> → choose <strong>Current User</strong> → place in <strong>Trusted Root Certification Authorities</strong>.
            </p>
            <p className="text-text-secondary leading-relaxed">
              3. Relaunch browser: the <em>"Not secure"</em> warning disappears and camera/mic prompts work normally.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3 space-y-1.5 flex flex-col justify-between">
            <div className="space-y-1.5">
              <p className="font-semibold text-text flex items-center gap-1">
                <span>Method 2 (Quick Lab Flag):</span>
                <span className="text-[10px] text-secondary bg-secondary/10 px-1.5 py-0.5 rounded">Chrome / Edge</span>
              </p>
              <p className="text-text-secondary leading-relaxed">
                1. In Chrome/Edge on the student laptop, go to:
              </p>
              <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 p-1 rounded-lg border border-border/50">
                <code className="text-[11px] font-mono text-text px-1.5 py-0.5 block truncate flex-1 min-w-0" title="chrome://flags/#unsafely-treat-insecure-origin-as-secure">
                  chrome://flags/#unsafely-treat-insecure-origin-as-secure
                </code>
                <button
                  type="button"
                  onClick={() => copyUrl('chrome://flags/#unsafely-treat-insecure-origin-as-secure', 'chrome-flag')}
                  className="shrink-0 p-1 text-xs text-text-secondary hover:text-text rounded"
                  title="Copy flag link"
                >
                  {copiedKey === 'chrome-flag' ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                </button>
              </div>
              <p className="text-text-secondary leading-relaxed">
                2. Add your Wi-Fi address (e.g. <code>https://192.168.31.78:4000</code>), set to <strong>Enabled</strong>, and click Relaunch.
              </p>
              <p className="text-text-secondary leading-relaxed">
                This immediately permits camera and mic access for this address.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Compilers */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm sm:text-base">Compiler / Runtime Status</h3>
          <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${diag.allReady ? 'text-primary border-primary/30 bg-primary/10' : 'text-warning border-warning/30 bg-warning/10'}`}>
            {diag.allReady ? 'All languages ready' : 'Some languages missing'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Object.entries(diag.compilers).map(([key, c]) => (
            <div key={key} className={`border rounded-xl p-3.5 ${c.installed ? 'border-border bg-surface' : 'border-error/30 bg-error/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{c.label}</span>
                {c.installed ? <CheckCircle2 size={15} className="text-primary shrink-0" /> : <XCircle size={15} className="text-error shrink-0" />}
              </div>
              <p className="text-[11px] text-text-secondary truncate" title={c.version || 'Not found on PATH'}>
                {c.version || 'Not found on PATH'}
              </p>
            </div>
          ))}
        </div>
        {!diag.allReady && (
          <p className="text-warning text-xs mt-3">
            A missing compiler means submissions in that language will fail for students — install it on this host machine before the lab starts.
          </p>
        )}
      </Card>

      {/* Hardware Monitoring */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={15} className="text-primary" />
            <h3 className="font-semibold text-sm">RAM Usage</h3>
          </div>
          <p className="text-2xl font-bold">{health.ram.usedPct}%</p>
          <p className="text-xs text-text-secondary mt-1">{health.ram.usedMb} MB / {health.ram.totalMb} MB</p>
          <div className="w-full h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full rounded-full transition-all ${health.ram.usedPct > 85 ? 'bg-error' : health.ram.usedPct > 65 ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${health.ram.usedPct}%` }}
            />
          </div>
          {health.ram.usedPct > 85 && (
            <p className="text-error text-[11px] mt-2">High load — submissions may time out. Consider fewer simultaneous submissions.</p>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={15} className="text-primary" />
            <h3 className="font-semibold text-sm">CPU / Process</h3>
          </div>
          <p className="text-2xl font-bold">{health.cpuCount} cores</p>
          <p className="text-xs text-text-secondary mt-1">Server process: {health.process.rssMb} MB RAM</p>
          {health.loadAvg?.length > 0 && (
            <p className="text-xs text-text-secondary mt-1">Load avg: {health.loadAvg.map((l) => l.toFixed(2)).join(', ')}</p>
          )}
        </Card>

        <Card className="p-4 sm:p-5 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-primary" />
            <h3 className="font-semibold text-sm">Server Uptime</h3>
          </div>
          <p className="text-2xl font-bold">{Math.floor(health.process.uptimeSec / 60)} min</p>
          <p className="text-xs text-text-secondary mt-1 truncate">{diag.platform} · Node {diag.nodeVersion}</p>
        </Card>
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="font-semibold mb-2 text-sm">Execution Sandbox</h3>
        <code className="text-xs text-text-secondary break-all">{diag.sandboxDir}</code>
      </Card>
    </div>
  );
}
