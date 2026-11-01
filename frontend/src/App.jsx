import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui';
import { RequireAuth, RequireAdmin } from './components/RouteGuards';
import AppLayout from './components/AppLayout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminRequestPending from './pages/AdminRequestPending';
import Dashboard from './pages/Dashboard';
import ProblemsList from './pages/ProblemsList';
import ProblemDetail from './pages/ProblemDetail';
import Contests from './pages/Contests';
import ContestDetail from './pages/ContestDetail';
import Quizzes from './pages/Quizzes';
import QuizTake from './pages/QuizTake';
import Leaderboard from './pages/Leaderboard';
import SubmissionHistory from './pages/SubmissionHistory';
import Profile from './pages/Profile';
import Reports from './pages/Reports';

import AdminDashboard from './pages/admin/AdminDashboard';
import AddProblem from './pages/admin/AddProblem';
import UploadTestCases from './pages/admin/UploadTestCases';
import ContestManagement from './pages/admin/ContestManagement';
import ContestMonitor from './pages/admin/ContestMonitor';
import QuizManagement from './pages/admin/QuizManagement';
import QuizMonitor from './pages/admin/QuizMonitor';
import UserManagement from './pages/admin/UserManagement';
import HodSettings from './pages/admin/HodSettings';
import LanDiagnostic from './pages/admin/LanDiagnostic';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin-request-pending" element={<RequireAuth><AdminRequestPending /></RequireAuth>} />

            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/problems" element={<ProblemsList />} />
              <Route path="/problems/:id" element={<ProblemDetail />} />
              <Route path="/contests" element={<Contests />} />
              <Route path="/contests/:id" element={<ContestDetail />} />
              <Route path="/quizzes" element={<Quizzes />} />
              <Route path="/quizzes/:id" element={<QuizTake />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/submissions" element={<SubmissionHistory />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/reports" element={<Reports />} />

              <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
              <Route path="/admin/problems/new" element={<RequireAdmin><AddProblem /></RequireAdmin>} />
              <Route path="/admin/problems/:id/edit" element={<RequireAdmin><AddProblem /></RequireAdmin>} />
              <Route path="/admin/problems/:id/testcases" element={<RequireAdmin><UploadTestCases /></RequireAdmin>} />
              <Route path="/admin/contests" element={<RequireAdmin><ContestManagement /></RequireAdmin>} />
              <Route path="/admin/contests/:id/monitor" element={<RequireAdmin><ContestMonitor /></RequireAdmin>} />
              <Route path="/admin/quizzes" element={<RequireAdmin><QuizManagement /></RequireAdmin>} />
              <Route path="/admin/quizzes/:id/monitor" element={<RequireAdmin><QuizMonitor /></RequireAdmin>} />
              <Route path="/admin/users" element={<RequireAdmin><UserManagement /></RequireAdmin>} />
              <Route path="/admin/settings" element={<RequireAdmin><HodSettings /></RequireAdmin>} />
              <Route path="/admin/diagnostics" element={<RequireAdmin><LanDiagnostic /></RequireAdmin>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
