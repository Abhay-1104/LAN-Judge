import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import api from '../api/client';
import { Card, Avatar, Input, Skeleton } from '../components/ui';

export default function Leaderboard() {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/stats/leaderboard').then(({ data }) => setRows(data.leaderboard));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return search ? rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())) : rows;
  }, [rows, search]);

  const top3 = rows?.slice(0, 3) || [];
  const rest = filtered.filter((r) => r.rank > 3);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-text-secondary text-sm mt-1">Global rankings across all students.</p>
      </div>

      {!rows ? (
        <Skeleton className="h-40" />
      ) : (
        top3.length > 0 && (
          <div className="grid grid-cols-3 gap-3 items-end">
            {[top3[1], top3[0], top3[2]].filter(Boolean).map((r, i) => {
              const isFirst = r.rank === 1;
              return (
                <Card key={r.id} className={`p-5 text-center ${isFirst ? 'pb-8 border-primary/30 order-2' : i === 0 ? 'order-1' : 'order-3'}`}>
                  <div className="flex justify-center mb-3">
                    <Avatar name={r.name} color={r.avatar_color} size={isFirst ? 56 : 44} />
                  </div>
                  <p className={`font-bold ${isFirst ? 'text-lg' : 'text-sm'}`}>{r.name}</p>
                  <p className="text-text-secondary text-xs mt-1">{r.solved} solved</p>
                  <p className={`mt-2 font-mono font-bold ${isFirst ? 'text-2xl text-primary' : 'text-lg text-text-secondary'}`}>#{r.rank}</p>
                </Card>
              );
            })}
          </div>
        )
      )}

      <Card className="p-4">
        <div className="relative max-w-xs mb-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <Input placeholder="Search student…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {!rows ? (
          <div className="p-5 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-secondary text-xs border-b border-border">
                <th className="py-3 px-5 font-medium">Rank</th>
                <th className="py-3 px-5 font-medium">Student</th>
                <th className="py-3 px-5 font-medium">Solved</th>
                <th className="py-3 px-5 font-medium">Submissions</th>
                <th className="py-3 px-5 font-medium">Penalty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.02]">
                  <td className="py-2.5 px-5 font-mono">{r.rank}</td>
                  <td className="py-2.5 px-5"><div className="flex items-center gap-2"><Avatar name={r.name} color={r.avatar_color} size={28} />{r.name}</div></td>
                  <td className="py-2.5 px-5">{r.solved}</td>
                  <td className="py-2.5 px-5 text-text-secondary">{r.submissions}</td>
                  <td className="py-2.5 px-5 text-text-secondary">{r.penalty || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
