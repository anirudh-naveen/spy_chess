import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { type GameMode, GAME_MODES } from '@spy/shared';
import { api, type LeaderboardRow } from '../api';
import { MODE_NAME } from './GamePage';

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const mode: GameMode = params.get('mode') === 'armada' ? 'armada' : 'standard';
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setRows(null);
    setError(false);
    api<{ players: LeaderboardRow[] }>(`/leaderboard?mode=${mode}`)
      .then((r) => setRows(r.players))
      .catch(() => setError(true));
  }, [mode]);

  return (
    <div className="page narrow">
      <h1>Leaderboard</h1>
      <div className="mode-switch" role="tablist" aria-label="Game mode">
        {GAME_MODES.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setParams({ mode: m })}>
            {MODE_NAME[m]}
          </button>
        ))}
      </div>
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
