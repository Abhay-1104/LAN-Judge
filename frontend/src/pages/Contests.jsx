import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Clock, Users } from 'lucide-react';
import api from '../api/client';
import { Card, Button, Skeleton, EmptyState } from '../components/ui';

const statusStyle = {
  Live: 'text-primary bg-primary/10 border-primary/30',
  Upcoming: 'text-warning bg-warning/10 border-warning/30',
  Finished: 'text-text-secondary bg-white/5 border-border',
};

export default function Contests() {
  const [contests, setContests] = useState(null);

  useEffect(() => {
    api.get('/contests').then(({ data }) => setContests(data.contests));
  }, []);

  const groups = contests
    ? {
        Live: contests.filter((c) => c.status === 'Live'),
        Upcoming: contests.filter((c) => c.status === 'Upcoming'),
        Finished: contests.filter((c) => c.status === 'Finished'),
      }
    : null;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contests</h1>
          <p className="text-text-secondary text-sm mt-1">Compete live or check what's coming up.</p>
        </div>
      </div>

      {!groups ? (
        <div className="grid md:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : contests.length === 0 ? (
        <EmptyState title="No contests yet" subtitle="Your professor hasn't scheduled any contests." />
      ) : (
        ['Live', 'Upcoming', 'Finished'].map(
          (status) =>
            groups[status].length > 0 && (
              <div key={status}>
                <h2 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wide">{status}</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {groups[status].map((c) => (
                    <Card key={c.id} className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold">{c.title}</h3>
                        <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 shrink-0 ${statusStyle[c.status]}`}>{c.status}</span>
                      </div>
                      <p className="text-text-secondary text-sm mb-4 line-clamp-2">{c.description}</p>
                      <div className="flex items-center gap-4 text-xs text-text-secondary mb-4">
                        <span className="flex items-center gap-1"><Clock size={12} /> {new Date(c.start_time).toLocaleString()}</span>
                        <span className="flex items-center gap-1"><Users size={12} /> {c.participants} joined</span>
                        <span className="flex items-center gap-1"><Trophy size={12} /> {c.problems.length} problems</span>
                      </div>
                      <Link to={`/contests/${c.id}`}>
                        <Button variant={c.status === 'Live' ? 'primary' : 'ghost'} className="w-full">
                          {c.status === 'Finished' ? 'View Results' : c.joined ? 'Enter Contest' : 'Join Contest'}
                        </Button>
                      </Link>
                    </Card>
                  ))}
                </div>
              </div>
            )
        )
      )}
    </div>
  );
}
