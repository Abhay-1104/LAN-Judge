const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

let cachedPythonCmd = null;
function getPythonCmd() {
  if (cachedPythonCmd) return cachedPythonCmd;
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 2000 });
      const out = (res.stdout || res.stderr || '').trim();
      if (!out.toLowerCase().includes('not found') && !out.toLowerCase().includes('microsoft store') && res.status === 0) {
        cachedPythonCmd = cmd;
        return cmd;
      }
    } catch (_) {}
  }
  cachedPythonCmd = 'python3';
  return 'python3';
}

// Language configs: how to compile (optional) and run each submission.
const LANGS = {
  c: {
    ext: 'c',
    compile: (src, bin) => ({ cmd: 'gcc', args: ['-O2', '-std=c11', '-o', bin, src, '-lm'] }),
    run: (bin) => ({ cmd: bin, args: [] }),
  },
  cpp: {
    ext: 'cpp',
    compile: (src, bin) => ({ cmd: 'g++', args: ['-O2', '-std=c++17', '-o', bin, src] }),
    run: (bin) => ({ cmd: bin, args: [] }),
  },
  python: {
    ext: 'py',
    compile: null,
    run: (src) => ({ cmd: getPythonCmd(), args: [src] }),
  },
  java: {
    ext: 'java',
    // Java requires the public class to be named Main
    compile: (src, bin, dir) => ({ cmd: 'javac', args: ['-d', dir, src] }),
    run: (bin, dir) => ({ cmd: 'java', args: ['-cp', dir, 'Main'] }),
  },
  javascript: {
    ext: 'js',
    compile: null,
    run: (src) => ({ cmd: 'node', args: [src] }),
  },
};

function runProcess({ cmd, args, input, timeoutMs, cwd }) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let maxRssKb = 0;

    let child;
    try {
      child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: -1, stdout: '', stderr: String(e.message), timedOut: false, runtimeMs: 0, memoryKb: 0 });
    }
    child.stdin.on('error', () => {}); 
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs);

    // Poll memory usage on Linux via /proc/<pid>/status while running
    const memPoll = setInterval(() => {
      try {
        const statusPath = `/proc/${child.pid}/status`;
        if (fs.existsSync(statusPath)) {
          const txt = fs.readFileSync(statusPath, 'utf8');
          const m = txt.match(/VmRSS:\s+(\d+)\s+kB/);
          if (m) maxRssKb = Math.max(maxRssKb, parseInt(m[1], 10));
        }
      } catch (_) {}
    }, 30);

    child.stdout.on('data', (d) => { stdout += d.toString(); if (stdout.length > 2_000_000) stdout = stdout.slice(0, 2_000_000); });
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 200_000) stderr = stderr.slice(0, 200_000); });

    child.on('error', (e) => {
      stderr += String(e.message);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(memPoll);
      const end = process.hrtime.bigint();
      const runtimeMs = Number(end - start) / 1e6;
      resolve({ code, stdout, stderr, timedOut, runtimeMs, memoryKb: maxRssKb });
    });

if (input !== undefined) {
  try { child.stdin.write(input); } catch (_) {}
}
try { child.stdin.end(); } catch (_) {}
  });
}

function normalize(s) {
  return (s || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Judge a submission.
 * @param {string} language - c | cpp | python | java | javascript
 * @param {string} source - source code
 * @param {Array<{input:string, output:string}>} testcases
 * @param {{timeLimitMs:number, memoryLimitMb:number}} limits
 */
async function judgeSubmission(language, source, testcases, limits = {}) {
  const langConf = LANGS[language];
  if (!langConf) {
    return { verdict: 'Compilation Error', detail: [], runtimeMs: 0, memoryKb: 0, passed: 0, total: testcases.length, compileError: `Unsupported language: ${language}` };
  }
  const timeLimitMs = limits.timeLimitMs || 2000;

  const workDir = path.join(os.tmpdir(), 'localjudge-' + randomUUID());
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const srcFileName = language === 'java' ? 'Main.java' : `sol.${langConf.ext}`;
    const srcPath = path.join(workDir, srcFileName);
    fs.writeFileSync(srcPath, source);
    // On Windows, a compiled executable must have a .exe extension or
    // Node's spawn() refuses to run it (EFTYPE). Harmless on Linux/macOS.
    const binPath = path.join(workDir, process.platform === 'win32' ? 'sol_bin.exe' : 'sol_bin');

    // Compile step
    if (langConf.compile) {
      const { cmd, args } = langConf.compile(srcPath, binPath, workDir);
      const res = await runProcess({ cmd, args, timeoutMs: 15000, cwd: workDir });
      if (res.code !== 0) {
        return {
          verdict: 'Compilation Error',
          detail: [],
          runtimeMs: 0,
          memoryKb: 0,
          passed: 0,
          total: testcases.length,
          compileError: res.stderr || res.stdout || 'Compilation failed',
        };
      }
    }

    // Languages with a compile step must run the compiled binary, not the
    // source file — running the source directly (e.g. spawning a .cpp file)
    // fails immediately since it isn't an executable.
    const runTarget = langConf.compile
      ? language === 'java'
        ? [binPath, workDir]
        : [binPath]
      : [srcPath];

    const detail = [];
    let maxRuntime = 0;
    let maxMemory = 0;
    let passed = 0;
    let overallVerdict = 'Accepted';

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      const { cmd, args } = langConf.run(...runTarget);
      const res = await runProcess({ cmd, args, input: tc.input, timeoutMs: timeLimitMs, cwd: workDir });

      maxRuntime = Math.max(maxRuntime, res.runtimeMs);
      maxMemory = Math.max(maxMemory, res.memoryKb);

      let verdict;
      if (res.timedOut) {
        verdict = 'Time Limit Exceeded';
      } else if (res.code !== 0) {
        verdict = 'Runtime Error';
      } else if (normalize(res.stdout) === normalize(tc.output)) {
        verdict = 'Accepted';
        passed++;
      } else {
        verdict = 'Wrong Answer';
      }

      if (verdict !== 'Accepted' && overallVerdict === 'Accepted') {
        overallVerdict = verdict;
      }

      detail.push({
        index: i + 1,
        verdict,
        input: tc.input.length > 500 ? tc.input.slice(0, 500) + '…' : tc.input,
        expected: (tc.output || '').length > 500 ? tc.output.slice(0, 500) + '…' : tc.output,
        got: res.stdout.length > 500 ? res.stdout.slice(0, 500) + '…' : res.stdout,
        stderr: res.stderr ? res.stderr.slice(0, 500) : '',
        runtimeMs: Math.round(res.runtimeMs * 100) / 100,
        memoryKb: res.memoryKb,
      });
    }

    return {
      verdict: overallVerdict,
      detail,
      runtimeMs: Math.round(maxRuntime * 100) / 100,
      memoryKb: maxMemory,
      passed,
      total: testcases.length,
    };
  } finally {
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
}

module.exports = { judgeSubmission };
