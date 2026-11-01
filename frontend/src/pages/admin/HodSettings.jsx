import { useEffect, useState } from 'react';
import { KeyRound, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api from '../../api/client';
import { Card, Button, Input, Avatar, Skeleton, useToast } from '../../components/ui';

export default function HodSettings() {
  const toast = useToast();
  const [configured, setConfigured] = useState(null);
  const [passkey, setPasskey] = useState('');
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState(null);

  const load = () => {
    api.get('/settings/passkey/status').then(({ data }) => setConfigured(data.configured));
    api.get('/users/admin-requests').then(({ data }) => setRequests(data.requests));
  };

  useEffect(() => { load(); }, []);

  const savePasskey = async () => {
    if (passkey.trim().length < 6) return toast('Passkey must be at least 6 characters', 'error');
    setSaving(true);
    try {
      await api.post('/settings/passkey', { passkey });
      toast('Master passkey updated', 'success');
      setPasskey('');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to update passkey', 'error');
    } finally {
      setSaving(false);
    }
  };

  const clearPasskey = async () => {
    if (!confirm('Remove the master passkey? New professors will need HOD approval for every request.')) return;
    await api.delete('/settings/passkey');
    toast('Passkey cleared', 'success');
    load();
  };

  const approve = async (id) => {
    await api.post(`/users/${id}/approve-admin`);
    toast('Faculty access granted', 'success');
    load();
  };
  const reject = async (id) => {
    await api.post(`/users/${id}/reject-admin`);
    toast('Request rejected', 'info');
    load();
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">HOD Settings</h1>
        <p className="text-text-secondary text-sm mt-1">Institutional access control — the master passkey and the faculty approval queue.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={16} className="text-secondary" />
          <h3 className="font-semibold">Master HOD Passkey</h3>
        </div>
        <p className="text-text-secondary text-sm mb-4">
          Faculty who enter this passkey while registering get admin access instantly, skipping the approval queue below. Share it directly with
          trusted colleagues (verbally, on a printed sheet, etc) — it is never shown again once saved.
        </p>
        {configured === null ? (
          <Skeleton className="h-10" />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${configured ? 'text-primary border-primary/30 bg-primary/10' : 'text-text-secondary border-border'}`}>
                {configured ? 'Passkey is set' : 'No passkey configured'}
              </span>
            </div>
            <div className="flex gap-2">
              <Input value={passkey} onChange={(e) => setPasskey(e.target.value)} placeholder={configured ? 'Enter a new passkey to rotate it' : 'e.g. HOD-LAN-2026'} />
              <Button onClick={savePasskey} disabled={saving}>{saving ? 'Saving…' : configured ? 'Rotate' : 'Set Passkey'}</Button>
              {configured && (
                <Button variant="danger" onClick={clearPasskey}>
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-warning" />
          <h3 className="font-semibold">Pending Faculty Access Requests {requests ? `(${requests.length})` : ''}</h3>
        </div>
        {!requests ? (
          <Skeleton className="h-24" />
        ) : requests.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 size={28} className="text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">All faculty requests cleared</p>
            <p className="text-text-secondary text-xs mt-1">No pending applications awaiting review.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
                <Avatar name={r.name} color={r.avatar_color} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-text-secondary truncate">{r.email} {r.college_id ? `· ${r.college_id}` : ''}</p>
                </div>
                <Button variant="ghost" onClick={() => approve(r.id)} className="!px-3 !py-1.5 text-xs">
                  <CheckCircle2 size={13} /> Approve
                </Button>
                <Button variant="danger" onClick={() => reject(r.id)} className="!px-3 !py-1.5 text-xs">
                  <XCircle size={13} /> Reject
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
