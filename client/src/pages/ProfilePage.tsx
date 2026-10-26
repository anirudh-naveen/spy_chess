import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type Profile } from '../api';

const REASON: Record<string, string> = {
  'king-captured': 'king captured',
  resign: 'resignation',
  timeout: 'time',
  agreement: 'agreement',
  'no-moves': 'no moves',
  insufficient: 'kings only',
};

function RatingChart({ history }: { history: Profile['history'] }) {
  if (history.length === 0) return <p className="muted small">No rated games yet.</p>;
  const ratings = [1000, ...history.map((h) => h.rating)];
  const min = Math.min(...ratings) - 10;
  const max = Math.max(...ratings) + 10;
  const W = 600;
  const H = 140;
  const pts = ratings.map((r, i) => [(i / (ratings.length - 1)) * W, H - ((r - min) / (max - min)) * H]);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Rating history">
      <line x1="0" x2={W} y1={H - ((1000 - min) / (max - min)) * H} y2={H - ((1000 - min) / (max - min)) * H} className="chart-base" />
      <polyline points={pts.map((p) => p.join(',')).join(' ')} className="chart-line" />
    </svg>
  );
}

export function ProfilePage() {
  const { name = '' } = useParams();
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api<Profile>(`/users/${encodeURIComponent(name)}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load profile'));
  }, [name]);

  if (error) return <div className="page narrow"><h1>{name}</h1><p className="muted">{error}</p></div>;
  if (!data) return <div className="page narrow muted">Loading…</div>;

  const peak = Math.max(1000, ...data.history.map((h) => h.rating));
  const wins = data.games.filter((g) => g.outcome === 'win').length;

  return (
    <div className="page profile">
      <header className="profile-head">
        <h1>{data.user.name}</h1>
        <dl className="stats">
          <div>
            <dt>Rating</dt>
            <dd>{data.user.rating}</dd>
          </div>
          <div>
            <dt>Peak</dt>
            <dd>{peak}</dd>
          </div>
          <div>
            <dt>Rated games</dt>
            <dd>{data.user.gamesPlayed}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{new Date(data.user.joined).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</dd>
          </div>
        </dl>
      </header>

      <section>
        <h2>Rating</h2>
        <RatingChart history={data.history} />
      </section>

      <section>
        <h2>
          Recent games <span className="muted small">{data.games.length ? `${wins} won of last ${data.games.length}` : ''}</span>
        </h2>
        {data.games.length === 0 ? (
          <p className="muted small">No finished games yet.</p>
        ) : (
          <table className="games">
            <tbody>
              {data.games.map((g) => (
                <tr key={g.id}>
                  <td>
                    <span className={`result ${g.outcome}`}>{g.outcome === 'win' ? 'Won' : g.outcome === 'loss' ? 'Lost' : 'Draw'}</span>
                  </td>
                  <td>
                    <span className={`swatch ${g.color}`} title={g.color === 'w' ? 'White' : 'Black'} />
                    {g.opponent ? (
                      g.opponent.startsWith('Guest-') ? g.opponent : <Link to={`/u/${g.opponent}`}>{g.opponent}</Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="muted">{g.reason ? REASON[g.reason] ?? g.reason : ''}</td>
                  <td className="num">
                    {g.ratingChange === null ? (
                      <span className="muted">casual</span>
                    ) : (
                      <span className={g.ratingChange >= 0 ? 'up' : 'down'}>
                        {g.ratingChange >= 0 ? '+' : '−'}
                        {Math.abs(g.ratingChange)}
                      </span>
                    )}
                  </td>
                  <td className="num muted">
                    <Link to={`/g/${g.id}`}>{new Date(g.endedAt).toLocaleDateString()}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
