import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Code2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/dashboard';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'admin' ? '/admin' : from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4 relative transition-colors duration-150">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary mb-3 shadow-theme-xs">
            <Code2 size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Local Judge</h1>
          <p className="text-text-secondary text-sm mt-1">Code. Compile. Conquer.</p>
        </div>

        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-theme-xl transition-colors">
          {error && <div className="text-error text-sm bg-error/10 border border-error/30 rounded-xl px-3 py-2">{error}</div>}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Email</label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Password</label>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-primary rounded" />
              Remember me
            </label>
            <button type="button" className="text-primary hover:underline">Forgot password?</button>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Login'}
          </Button>
        </form>

        <p className="text-center text-sm text-text-secondary mt-5">
          Don't have an account? <Link to="/register" className="text-primary font-medium hover:underline">Register</Link>
        </p>

        <div className="mt-6 text-xs text-text-secondary bg-surface border border-border rounded-xl p-3.5 leading-relaxed shadow-theme-xs">
          <p className="font-semibold text-text mb-1.5">Demo accounts</p>
          <p className="text-text-secondary">Admin: <span className="font-mono text-text">admin@localjudge.edu</span> / <span className="font-mono text-text">admin123</span></p>
          <p className="text-text-secondary mt-0.5">Student: <span className="font-mono text-text">abhay@college.edu</span> / <span className="font-mono text-text">student123</span></p>
        </div>
      </div>
    </div>
  );
}
