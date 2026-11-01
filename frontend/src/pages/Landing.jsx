import { Link } from 'react-router-dom';
import { Code2, Cpu, Users, Trophy, ShieldCheck, Wifi, ArrowRight, Terminal } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

const features = [
  { icon: Wifi, title: 'Works fully offline', desc: 'Runs entirely on your college LAN — no internet connection required, ever.' },
  { icon: Cpu, title: 'Real judge engine', desc: 'Compiles and executes C++, Java, and Python against real test cases with time and memory limits.' },
  { icon: Trophy, title: 'Live contests', desc: 'Run timed contests with a live leaderboard, penalties, and rankings — just like Codeforces.' },
  { icon: Users, title: 'Built for classrooms', desc: 'One professor hosts from a laptop; the whole lab connects over LAN with their own logins.' },
];

const steps = [
  { n: '01', title: 'Professor hosts the server', desc: 'Start LocalJudge on any lab machine — it serves the whole app over your local network.' },
  { n: '02', title: 'Students connect and sign in', desc: 'Everyone opens the LAN address in a browser and logs in with their college ID.' },
  { n: '03', title: 'Solve, submit, compete', desc: 'Students write code in the built-in editor, submit, and see verdicts in seconds — no internet needed.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg text-text transition-colors duration-150">
      <nav className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-mono font-bold shadow-theme-xs">{'</>'}</div>
            <span className="font-bold tracking-tight text-[15px]">Local Judge</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="text-sm font-medium text-text-secondary hover:text-text transition-colors px-3 py-2">
              Login
            </Link>
            <Link to="/register" className="text-sm font-semibold bg-primary text-white rounded-xl px-4 py-2 hover:bg-brand-600 shadow-theme-xs transition-all">
              Register
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20 pb-16 grid md:grid-cols-2 gap-12 items-center">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1 mb-5 shadow-theme-xs">
            <Terminal size={13} /> No internet required
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.15] mb-5">
            A LeetCode for your college lab — <span className="text-primary">zero internet needed.</span>
          </h1>
          <p className="text-text-secondary text-base sm:text-lg mb-8 max-w-lg leading-relaxed">
            LocalJudge runs entirely on your college LAN. One laptop hosts the platform, students solve real problems in a real judge, and professors run contests — all offline.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/register" className="inline-flex items-center gap-2 bg-primary text-white font-semibold rounded-xl px-5 py-3 hover:bg-brand-600 shadow-theme-sm transition-all active:scale-[0.98]">
              Get started <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 border border-border bg-surface text-text rounded-xl px-5 py-3 font-semibold hover:bg-black/5 dark:hover:bg-white/5 shadow-theme-xs transition-all active:scale-[0.98]">
              I already have an account
            </Link>
          </div>
        </div>

        <div className="animate-fade-up bg-card border border-border rounded-2xl p-2 shadow-theme-xl">
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
              <div className="w-2.5 h-2.5 rounded-full bg-error/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
              <span className="ml-3 text-xs text-text-secondary font-mono">A. Sum of Array — sol.cpp</span>
            </div>
            <pre className="font-mono text-[13px] leading-relaxed p-5 text-text-secondary overflow-x-auto">
{`#include <bits/stdc++.h>
using namespace std;

int main(){
  int n; cin >> n;
  long long sum = 0, x;
  for(int i=0;i<n;i++){ cin >> x; sum += x; }
  cout << sum << endl;
}`}
            </pre>
            <div className="px-5 pb-5 flex items-center gap-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border text-primary bg-primary/10 border-primary/30">Accepted</span>
              <span className="text-xs text-text-secondary">Runtime 0.08s · Memory 12.5MB</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-2xl font-bold mb-2">Everything a contest platform needs, no server room required</h2>
        <p className="text-text-secondary mb-10 max-w-xl">Built specifically for the constraints of a college lab: one local host, many student browsers, zero external dependencies.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                <f.icon size={18} />
              </div>
              <h3 className="font-semibold mb-1.5">{f.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-2xl font-bold mb-10">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <span className="font-mono text-4xl font-bold text-black/10 dark:text-white/10">{s.n}</span>
              <h3 className="font-semibold mt-2 mb-1.5">{s.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-text-secondary">
          <div className="flex items-center gap-2">
            <Code2 size={16} className="text-primary" />
            <span>Local Judge — offline competitive programming for your campus.</span>
          </div>
          <span>Runs 100% on your local network.</span>
        </div>
      </footer>
    </div>
  );
}
