import { Link } from 'react-router-dom';
import { ShieldCheck, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';

export default function AdminRequestPending() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-fade-up">
        <div className="w-14 h-14 rounded-2xl bg-secondary/15 border border-secondary/30 flex items-center justify-center text-secondary mx-auto mb-5">
          <ShieldCheck size={26} />
        </div>
        <h1 className="text-xl font-bold mb-2">Admin request submitted</h1>
        <p className="text-text-secondary text-sm leading-relaxed mb-6">
          Hi {user?.name?.split(' ')[0]}, your request for Professor/Admin access is waiting for approval from an existing admin. You've been signed in as a regular student in the meantime — you'll be able to see problems and contests once someone approves your request, and your admin tools will unlock automatically.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-text-secondary bg-white/5 border border-border rounded-xl px-3 py-2.5 mb-6">
          <Clock size={13} /> Pending approval
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/dashboard">
            <Button className="w-full">Continue as student for now</Button>
          </Link>
          <Button variant="ghost" onClick={logout} className="w-full">
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
