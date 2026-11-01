import { useEffect, useRef, useState } from 'react';
import { Pencil, Camera, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Card, Avatar, VerdictBadge, DifficultyBadge, Skeleton, Button, Input, useToast } from '../components/ui';

function Heatmap({ data }) {
  const map = new Map(data.map((d) => [d.day, d.c]));
  const days = [];
  const today = new Date();
  for (let i = 119; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: map.get(key) || 0 });
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const shade = (c) => {
    if (c === 0) return 'bg-white/5';
    if (c === 1) return 'bg-primary/30';
    if (c <= 3) return 'bg-primary/60';
    return 'bg-primary';
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {week.map((d) => (
            <div key={d.key} title={`${d.key}: ${d.count} submissions`} className={`w-5 h-5 rounded-md ${shade(d.count)}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Edit Profile modal — avatar upload, name/email/college ID, and a separate
// change-password section. Save commits all changed fields together;
// Cancel discards everything and closes without touching the server.
function EditProfileModal({ profile, onClose, onSaved }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);

  const [name, setName] = useState(profile.name || '');
  const [email, setEmail] = useState(profile.email || '');
  const [collegeId, setCollegeId] = useState(profile.college_id || '');
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setRemoveAvatar(false);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
  };

  const patchLocalUser = (patch) => {
    setUser((u) => {
      const next = { ...u, ...patch };
      localStorage.setItem('lj_user', JSON.stringify(next));
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) return toast('Name cannot be empty', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast('Enter a valid email address', 'error');

    setSaving(true);
    try {
      const { data } = await api.put('/users/me', { name: name.trim(), email: email.trim(), collegeId: collegeId.trim() });

      let avatarUrl = data.user.avatar_url;
      if (avatarFile) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        const up = await api.post('/users/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        avatarUrl = up.data.avatarUrl;
      } else if (removeAvatar) {
        await api.delete('/users/me/avatar');
        avatarUrl = null;
      }

      patchLocalUser({ name: data.user.name, email: data.user.email, college_id: data.user.college_id, avatar_url: avatarUrl });
      toast('Profile updated', 'success');
      onSaved({ ...data.user, avatar_url: avatarUrl });
      onClose();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return toast('Fill in both password fields', 'error');
    if (newPassword.length < 6) return toast('New password must be at least 6 characters', 'error');
    if (newPassword !== confirmPassword) return toast("New passwords don't match", 'error');

    setChangingPw(true);
    try {
      await api.put('/users/me/password', { currentPassword, newPassword });
      toast('Password changed', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to change password', 'error');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h3 className="font-semibold text-base">Edit Profile</h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar name={name} color={profile.avatar_color} src={avatarPreview} size={64} />
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 bg-primary text-bg rounded-full p-1.5 border-2 border-card"
                title="Change photo"
              >
                <Camera size={12} />
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={pickFile} />
            </div>
            <div>
              <p className="text-sm font-medium">Profile photo</p>
              {avatarPreview ? (
                <button onClick={clearAvatar} className="text-xs text-error hover:underline flex items-center gap-1 mt-1">
                  <Trash2 size={11} /> Remove photo
                </button>
              ) : (
                <p className="text-xs text-text-secondary mt-1">Click the camera icon to upload one</p>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">College ID</label>
              <Input value={collegeId} onChange={(e) => setCollegeId(e.target.value)} placeholder="e.g. BT1024O1002" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving} className="!px-4 !py-2 text-xs">Cancel</Button>
            <Button onClick={save} disabled={saving} className="!px-4 !py-2 text-xs">{saving ? 'Saving…' : 'Save'}</Button>
          </div>

          {/* Change password */}
          <div className="border-t border-border pt-5 space-y-3">
            <p className="text-sm font-semibold">Change Password</p>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Current Password</label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">New Password</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">Confirm New Password</label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="subtle" onClick={changePassword} disabled={changingPw} className="!px-4 !py-2 text-xs">
                {changingPw ? 'Changing…' : 'Change Password'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (user) api.get(`/users/${user.id}/profile`).then(({ data }) => setProfile(data.profile));
  }, [user]);

  if (!profile) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5 animate-fade-up">
      <Card className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <Avatar name={profile.name} color={profile.avatar_color} src={profile.avatar_url} size={64} />
        <div className="flex-1">
          <h1 className="text-xl font-bold">{profile.name}</h1>
          <p className="text-text-secondary text-sm">{profile.email}</p>
          {profile.college_id && <p className="text-text-secondary text-xs mt-1">College ID: {profile.college_id}</p>}
        </div>
        <div className="flex items-start gap-4">
          <div className="text-right">
            <p className="text-xs text-text-secondary">Member since</p>
            <p className="text-sm font-medium">{new Date(profile.created_at + 'Z').toLocaleDateString()}</p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-text-secondary hover:text-primary border border-border rounded-lg p-2 shrink-0"
            title="Edit Profile"
          >
            <Pencil size={14} />
          </button>
        </div>
      </Card>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Judge Rating', value: profile.rating, accent: true },
          { label: 'Problems Solved', value: profile.solved },
          { label: 'Accuracy', value: `${profile.accuracy}%` },
          { label: 'Submissions', value: profile.totalSubs },
          { label: 'Contests', value: profile.contestsJoined },
          { label: 'Practice Streak', value: `${profile.streak} 🔥` },
        ].map((s) => (
          <Card key={s.label} className={`p-5 ${s.accent ? 'border-primary/30 bg-primary/5' : ''}`}>
            <p className="text-text-secondary text-xs mb-2">{s.label}</p>
            <p className={`text-2xl font-bold ${s.accent ? 'text-primary' : ''}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-4">Submission Heatmap</h3>
        <Heatmap data={profile.heatmap} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Solved by Difficulty</h3>
          <div className="space-y-3">
            {['Easy', 'Medium', 'Hard'].map((d) => {
              const found = profile.byDifficulty.find((x) => x.difficulty === d);
              return (
                <div key={d} className="flex items-center gap-3">
                  <DifficultyBadge level={d} />
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (found?.c || 0) * 10)}%` }} />
                  </div>
                  <span className="text-xs text-text-secondary w-6 text-right">{found?.c || 0}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {profile.recent.length === 0 ? (
              <p className="text-text-secondary text-sm text-center py-6">No activity yet.</p>
            ) : (
              profile.recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.problem}</span>
                  <VerdictBadge verdict={r.status} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {editing && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(updated) => setProfile((p) => ({ ...p, ...updated }))}
        />
      )}
    </div>
  );
}
