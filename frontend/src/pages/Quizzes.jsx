import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Users, ListChecks, Lock } from 'lucide-react';
import api from '../api/client';
import { Card, Button, Skeleton, EmptyState } from '../components/ui';

const statusStyle = {
  Live: 'text-primary bg-primary/10 border-primary/30',
  Upcoming: 'text-warning bg-warning/10 border-warning/30',
  Finished: 'text-text-secondary bg-white/5 border-border',
};

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/quizzes').then(({ data }) => setQuizzes(data.quizzes));
  }, []);

  const filtered = quizzes ? quizzes.filter((q) => filter === 'all' || q.status.toLowerCase() === filter) : [];

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold">Quizzes</h1>
        <p className="text-text-secondary text-sm mt-1">Timed MCQ assessments, proctored the same way as coding contests.</p>
      </div>

      <div className="flex gap-2">
        {['all', 'live', 'upcoming', 'finished'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-colors ${
              filter === f ? 'bg-primary text-bg border-primary' : 'border-border text-text-secondary hover:text-text'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {!quizzes ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No quizzes" subtitle="Nothing scheduled in this category yet." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((q) => (
            <Card key={q.id} className="p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold">{q.title}</h3>
                <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 shrink-0 ${statusStyle[q.status]}`}>{q.status}</span>
              </div>
              <p className="text-text-secondary text-sm mb-4 line-clamp-2">{q.description}</p>
              <div className="flex items-center gap-4 text-xs text-text-secondary mb-4">
                <span className="flex items-center gap-1"><ListChecks size={13} /> {q.questionCount} Qs · {q.totalPoints} pts</span>
                <span className="flex items-center gap-1"><Users size={13} /> {q.participants}</span>
                {q.hasPin && <span className="flex items-center gap-1"><Lock size={13} /> PIN</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Clock size={13} /> {new Date(q.start_time).toLocaleString()}
                </span>
                <Link to={`/quizzes/${q.id}`}>
                  <Button variant="ghost" className="!px-3 !py-1.5 text-xs">
                    {q.joined ? 'Open' : 'View'}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
