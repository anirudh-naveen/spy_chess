import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type LeaderboardRow } from '../api';

export function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ players: LeaderboardRow[] }>('/leaderboard')
      .then((r) => setRows(r.players))
      .catch(() => setError(true));
  }, []);

  return (
    <div className="page narrow">
      <h1>Leaderboard</h1>
      {error ? (
        <p className="muted">Could not load the leaderboard.</p>
      ) : rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No rated games yet.</p>
      ) : (
        <ol className="lb">
          {rows.map((p, i) => (
            <li key={p.name}>
              <span className="lb-rank">{i + 1}</span>
              <Link to={`/u/${p.name}`}>{p.name}</Link>
              <span className="muted small">{p.gamesPlayed} games</span>
              <span className="lb-rating">{p.rating}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
