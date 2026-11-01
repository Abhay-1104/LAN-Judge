import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Code2, Trophy, History, BarChart3, BookOpen, User, Settings,
  LogOut, Menu, X, Search, Bell, ShieldCheck, ChevronDown, Check, UserPlus, ClipboardList, FileText,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';
import ThemeToggle from './ThemeToggle';

const studentNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/problems', label: 'Problems', icon: Code2 },
  { to: '/contests', label: 'Contests', icon: Trophy },
  { to: '/quizzes', label: 'Quizzes', icon: ClipboardList },
  { to: '/submissions', label: 'Submissions', icon: History },
  { to: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
];

const adminNav = [
  { to: '/admin', label: 'Admin Dashboard', icon: ShieldCheck, end: true },
  { to: '/admin/problems/new', label: 'Add Problem', icon: Code2 },
  { to: '/admin/contests', label: 'Manage Contests', icon: Trophy },
  { to: '/admin/quizzes', label: 'Manage Quizzes', icon: ClipboardList },
  { to: '/admin/users', label: 'Manage Users', icon: User },
  { to: '/admin/diagnostics', label: 'LAN Diagnostic', icon: BarChart3 },
  { to: '/admin/settings', label: 'HOD Settings', icon: Settings },
];

function AccountSwitcher() {
  const { user, savedAccounts, switchAccount, removeSavedAccount, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const others = savedAccounts.filter((a) => a.id !== user?.id);

  const handleSwitch = async (accountId) => {
    setOpen(false);
    const ok = await switchAccount(accountId);
    if (ok) navigate('/dashboard');
    else navigate('/login');
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
        <Avatar name={user?.name} color={user?.avatar_color} src={user?.avatar_url} size={32} />
        <div className="hidden sm:block leading-tight text-left">
          <p className="text-sm font-semibold text-text">{user?.name}</p>
          <p className="text-xs text-text-secondary capitalize">{user?.role}</p>
        </div>
        <ChevronDown size={14} className={`text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-2xl shadow-theme-xl z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Signed in as</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Avatar name={user?.name} color={user?.avatar_color} src={user?.avatar_url} size={22} />
                <span className="text-sm font-medium text-text">{user?.name}</span>
                <Check size={13} className="text-primary ml-auto" />
              </div>
            </div>

            {others.length > 0 && (
              <div className="py-1 border-b border-border max-h-52 overflow-y-auto">
                {others.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 group transition-colors">
                    <button onClick={() => handleSwitch(a.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <Avatar name={a.name} color={a.avatar_color} size={22} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">{a.name}</p>
                        <p className="text-[10px] text-text-secondary capitalize">{a.role}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => removeSavedAccount(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-error text-xs shrink-0 p-1"
                      title="Remove from quick switch"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { setOpen(false); navigate('/login'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-text-secondary hover:text-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <UserPlus size={15} /> Sign in with another account
            </button>
            <button
              onClick={() => { setOpen(false); logout(); navigate('/login'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
            >
              <LogOut size={15} /> Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationsMenu({ liveQuizzes, liveContests }) {
  const [open, setOpen] = useState(false);
  const totalLive = (liveQuizzes?.length || 0) + (liveContests?.length || 0);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-text-secondary hover:text-text transition-colors relative p-2 rounded-xl border border-border bg-surface hover:bg-black/5 dark:hover:bg-white/5 shadow-theme-xs"
        title="Live Quizzes & Contests"
      >
        <Bell size={18} />
        {totalLive > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-error text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-surface animate-pulse">
            {totalLive}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-theme-xl z-50 overflow-hidden animate-fade-up">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bell size={14} className="text-primary" />
                <span className="font-semibold text-sm">Notifications</span>
              </div>
              {totalLive > 0 && (
                <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  {totalLive} Live Now
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {totalLive === 0 ? (
                <div className="p-6 text-center text-xs text-text-secondary">
                  No active quizzes or contests right now.
                </div>
              ) : (
                <>
                  {liveQuizzes?.map((q) => (
                    <Link
                      key={`quiz-${q.id}`}
                      to={`/quizzes/${q.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors block"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <ClipboardList size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-text truncate">{q.title}</span>
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.2 rounded">LIVE QUIZ</span>
                        </div>
                        <p className="text-[11px] text-text-secondary mt-0.5">
                          {q.questionCount || 0} questions · {q.proctored ? 'Camera Proctored' : 'Standard'}
                        </p>
                      </div>
                    </Link>
                  ))}

                  {liveContests?.map((c) => (
                    <Link
                      key={`contest-${c.id}`}
                      to={`/contests/${c.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors block"
                    >
                      <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0 mt-0.5">
                        <Trophy size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-text truncate">{c.title}</span>
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.2 rounded">LIVE CONTEST</span>
                        </div>
                        <p className="text-[11px] text-text-secondary mt-0.5">
                          {c.problems?.length || 0} problems · Coding Contest
                        </p>
                      </div>
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [liveQuizzes, setLiveQuizzes] = useState([]);
  const [liveContests, setLiveContests] = useState([]);

  // Close mobile sidebar on route transition
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const fetchLive = () => {
      api.get('/quizzes').then(({ data }) => {
        setLiveQuizzes((data.quizzes || []).filter((q) => q.status === 'Live'));
      }).catch(() => {});

      api.get('/contests').then(({ data }) => {
        setLiveContests((data.contests || []).filter((c) => c.status === 'Live' || c.status === 'Running'));
      }).catch(() => {});
    };

    fetchLive();
    const interval = setInterval(fetchLive, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderNavLink = (item) => {
    const isQuiz = item.label.includes('Quiz');
    const isContest = item.label.includes('Contest');
    const hasLive = (isQuiz && liveQuizzes.length > 0) || (isContest && liveContests.length > 0);

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end || item.to === '/admin'}
        onClick={() => setOpen(false)}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            isActive
              ? 'bg-primary/10 text-primary font-semibold shadow-theme-xs'
              : 'text-text-secondary hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
          }`
        }
      >
        <item.icon size={18} className="shrink-0" />
        <span className="truncate">{item.label}</span>
        {hasLive && (
          <span className="ml-auto text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/30 animate-pulse shrink-0">
            LIVE
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <div className="h-screen flex bg-bg text-text overflow-hidden">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-up"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar - Permanently fixed on desktop/laptop, full height, with independent scroll */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 h-full w-72 max-w-[85vw] md:w-64 bg-surface border-r border-border flex flex-col shadow-theme-xl md:shadow-none shrink-0 transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-mono font-bold shadow-theme-xs">{'</>'}</div>
          <span className="font-bold text-[15px] tracking-tight">Local Judge</span>
          <button
            className="ml-auto md:hidden p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable nav list with clean organization */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-3 custom-scrollbar">
          {user?.role === 'admin' ? (
            <>
              <div>
                <div className="px-3 pb-1.5 text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={12} className="text-primary" />
                  <span>Admin Console</span>
                </div>
                <div className="space-y-1">
                  {adminNav.map(renderNavLink)}
                </div>
              </div>

              <div>
                <div className="px-3 pt-2 pb-1.5 text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 border-t border-border/50">
                  <LayoutDashboard size={12} className="text-text-secondary" />
                  <span>Student View</span>
                </div>
                <div className="space-y-1">
                  {studentNav.map(renderNavLink)}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              {studentNav.map(renderNavLink)}
            </div>
          )}
        </nav>

        {/* Docked Logout at bottom - never floats or scrolls away */}
        <div className="p-3 border-t border-border space-y-1 shrink-0 bg-surface">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content column with its own smooth scrolling */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto custom-scrollbar">
        <header className="h-16 border-b border-border flex items-center gap-2 sm:gap-4 px-3 sm:px-6 bg-surface/80 backdrop-blur sticky top-0 z-20 shrink-0 transition-colors">
          <button
            className="md:hidden p-2 rounded-xl text-text-secondary hover:text-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <span className="font-bold text-sm tracking-tight">Local Judge</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2 w-full max-w-xs lg:max-w-sm text-text-secondary shadow-theme-xs">
            <Search size={16} className="shrink-0" />
            <input placeholder="Search problems, contests..." className="bg-transparent outline-none text-sm text-text placeholder:text-text-secondary w-full" />
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3 shrink-0">
            <ThemeToggle />
            <NotificationsMenu liveQuizzes={liveQuizzes} liveContests={liveContests} />
            <AccountSwitcher />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
