import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, type LeaderboardRow } from '../api';
import { useQueue } from '../queue';
import { useSession } from '../session';
import { useNow } from '../useGame';
import { pieceUrl } from '../pieces';

function elapsed(since: number, now: number) {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function HomePage() {
  const session = useSession();
  const queue = useQueue();
  const navigate = useNavigate();
  const now = useNow(1000);
  const [color, setColor] = useState<'random' | 'w' | 'b'>('random');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    api<{ players: LeaderboardRow[] }>('/leaderboard')
      .then((r) => setTop(r.players.slice(0, 8)))
      .catch(() => setTop([]));
  }, []);

  const play = () => {
    if (!session.signedIn) return navigate('/login?next=play');
    queue.join();
  };

  const invite = async () => {
    setCreating(true);
    setError(null);
    try {
      const token = await session.ensureToken();
      const r = await api<{ id: string }>('/invites', { body: { color }, token });
      navigate(`/g/${r.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the game');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page home">
      <section className="home-main">
        <div className="intro">
          <h1>Spy Chess</h1>
          <p>
            Arrange your army however you like. Your opponent sees every piece as a bulb, and you see theirs the same
            way. Read their moves, mark your guesses, and capture the king.
          </p>
        </div>

        <div className="play-grid">
          <div className="play-option">
            <div className="play-head">
              <h2>Play online</h2>
              <span className="muted">Rated · 10+0</span>
            </div>
            {queue.searchingSince ? (
              <div className="searching">
                <span>Searching for an opponent · {elapsed(queue.searchingSince, now)}</span>
                <button className="btn" onClick={queue.leave}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn primary wide" onClick={play}>
                {session.signedIn ? 'Find a game' : 'Sign in to play rated'}
              </button>
            )}
            {queue.error && <div className="notice error">{queue.error}</div>}
          </div>

          <div className="play-option">
            <div className="play-head">
              <h2>Play a friend</h2>
              <span className="muted">Casual · no account needed</span>
            </div>
            <div className="color-pick" role="radiogroup" aria-label="Your color">
              {(['w', 'random', 'b'] as const).map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={color === c}
                  className={`color-choice${color === c ? ' active' : ''}`}
                  onClick={() => setColor(c)}
                  title={c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                >
                  {c === 'random' ? (
                    <span className="half-bulb">
                      <img src={pieceUrl('w', 'bulb')} alt="" />
                      <img className="c-b" src={pieceUrl('b', 'bulb')} alt="" />
                    </span>
                  ) : (
                    <img className={`c-${c}`} src={pieceUrl(c, 'bulb')} alt="" />
                  )}
                  <span>{c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}</span>
                </button>
              ))}
            </div>
            <button className="btn wide" onClick={invite} disabled={creating}>
              {creating ? 'Creating…' : 'Create invite link'}
            </button>
            {error && <div className="notice error">{error}</div>}
          </div>
        </div>

        <details className="rules">
          <summary>How it works</summary>
          <ul>
            <li>Before the game you have 60 seconds to place all 16 pieces anywhere on your first two ranks.</li>
            <li>Pieces move as in normal chess. Pawns can move two squares on their first move. There is no castling or en passant.</li>
            <li>There is no check. Capture the enemy king to win, so moving into danger is allowed, and fatal.</li>
            <li>Captured pieces are revealed. Right-click or long-press an enemy bulb to mark what you think it is. Only you see your marks.</li>
            <li>When the game ends, every piece is revealed.</li>
          </ul>
        </details>
      </section>

      <aside className="home-side">
        {session.signedIn && session.user && (
          <div className="me">
            <Link to={`/u/${session.user.name}`} className="me-name">
              {session.user.name}
            </Link>
            <div className="me-rating">{session.user.rating}</div>
            <div className="muted small">{session.user.gamesPlayed} rated game{session.user.gamesPlayed === 1 ? '' : 's'}</div>
          </div>
        )}
        <div className="mini-board-head">
          <h2>Leaderboard</h2>
          <Link to="/leaderboard" className="small">
            All
          </Link>
        </div>
        {top === null ? (
          <p className="muted small">Loading…</p>
        ) : top.length === 0 ? (
          <p className="muted small">No rated games yet.</p>
        ) : (
          <ol className="lb compact">
            {top.map((p, i) => (
              <li key={p.name}>
                <span className="lb-rank">{i + 1}</span>
                <Link to={`/u/${p.name}`}>{p.name}</Link>
                <span className="lb-rating">{p.rating}</span>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
