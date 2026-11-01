import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Code2, GraduationCap, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Button, Input } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', collegeId: '', password: '', confirm: '', passkey: '' });
  const [accountType, setAccountType] = useState('student'); // 'student' | 'admin'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyConfigured, setPasskeyConfigured] = useState(false);

  useEffect(() => {
    api.get('/settings/passkey/status').then(({ data }) => setPasskeyConfigured(data.configured)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const result = await register({ ...form, requestAdmin: accountType === 'admin' });
      if (result.passkeyGranted) {
        navigate('/admin', { replace: true });
      } else if (result.adminRequestPending) {
        navigate('/admin-request-pending', { replace: true });
      } else {
        navigate(result.user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4 py-10 relative transition-colors duration-150">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary mb-3 shadow-theme-xs">
            <Code2 size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Create your account</h1>
          <p className="text-text-secondary text-sm mt-1">Join Local Judge platform</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setAccountType('student')}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all ${
              accountType === 'student' ? 'border-primary/50 bg-primary/10 text-primary font-medium shadow-theme-xs' : 'border-border bg-surface text-text-secondary hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <GraduationCap size={18} />
            <span className="text-sm font-semibold">Student</span>
          </button>
          <button
            type="button"
            onClick={() => setAccountType('admin')}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all ${
              accountType === 'admin' ? 'border-secondary/50 bg-secondary/10 text-secondary font-medium shadow-theme-xs' : 'border-border bg-surface text-text-secondary hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <ShieldCheck size={18} />
            <span className="text-sm font-semibold">Professor / Admin</span>
          </button>
        </div>
        {accountType === 'admin' && (
          <div className="mb-4 space-y-3">
            {passkeyConfigured && (
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1.5">
                  <KeyRound size={13} /> HOD Master Passkey <span className="font-normal text-text-secondary/70">(optional — for instant access)</span>
                </label>
                <Input value={form.passkey} onChange={set('passkey')} placeholder="Ask your HOD for this" />
              </div>
            )}
            <p className="text-xs text-text-secondary bg-surface border border-border rounded-xl px-3.5 py-2.5 leading-relaxed shadow-theme-xs">
              {passkeyConfigured
                ? 'If you have the passkey, admin access is granted instantly. Otherwise your request goes to the HOD approval queue and you\'ll be a student in the meantime.'
                : 'Admin access has to be approved by an existing admin (e.g. your HOD) before it\'s active. You\'ll be registered as a student in the meantime.'}
            </p>
          </div>
        )}

        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-theme-xl transition-colors">
          {error && <div className="text-error text-sm bg-error/10 border border-error/30 rounded-xl px-3 py-2">{error}</div>}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Full name</label>
            <Input required value={form.name} onChange={set('name')} placeholder="Abhay Verma" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Email</label>
            <Input type="email" required value={form.email} onChange={set('email')} placeholder="you@college.edu" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">College ID</label>
            <Input value={form.collegeId} onChange={set('collegeId')} placeholder="CS21001" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Password</label>
            <Input type="password" required minLength={6} value={form.password} onChange={set('password')} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Confirm password</label>
            <Input type="password" required value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account…' : accountType === 'admin' ? 'Submit for approval' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-text-secondary mt-5">
          Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Login</Link>
        </p>
      </div>
    </div>
  );
}
