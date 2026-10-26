import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type GameMode, ARMADA_BUDGET, GAME_MODES } from '@spy/shared';
import { api, ApiError, type LeaderboardRow } from '../api';
import { PieceGuide } from '../components/PieceGuide';
import { useQueue } from '../queue';
import { useSession } from '../session';
import { useNow } from '../useGame';
import { pieceUrl } from '../pieces';
import { MODE_NAME } from './GamePage';

const MODE_KEY = 'spy.mode';

function elapsed(since: number, now: number) {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function savedMode(): GameMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'armada' ? 'armada' : 'standard';
  } catch {
    return 'standard';
  }
}

const MODE_BLURB: Record<GameMode, string> = {
  standard: 'The usual sixteen pieces, arranged anywhere on your first two ranks.',
  armada: `Build a back rank from 12 pieces, one of each, within a ${ARMADA_BUDGET}-point budget. Pawns stay in front.`,
};

export function HomePage() {
  const session = useSession();
  const queue = useQueue();
  const navigate = useNavigate();
  const now = useNow(1000);
  const [mode, setModeState] = useState<GameMode>(savedMode);
  const [color, setColor] = useState<'random' | 'w' | 'b'>('random');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState<LeaderboardRow[] | null>(null);

  const setMode = (m: GameMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* remembered for this visit only */
    }
  };

  useEffect(() => {
    setTop(null);
    api<{ players: LeaderboardRow[] }>(`/leaderboard?mode=${mode}`)
      .then((r) => setTop(r.players.slice(0, 8)))
      .catch(() => setTop([]));
  }, [mode]);

  const play = () => {
    if (!session.signedIn) return navigate(`/login?next=${mode}`);
    queue.join(mode);
  };

  const invite = async () => {
    setCreating(true);
    setError(null);
    try {
      const token = await session.ensureToken();
      const r = await api<{ id: string }>('/invites', { body: { color, mode }, token });
      navigate(`/g/${r.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the game');
    } finally {
      setCreating(false);
    }
  };

  const mine = session.signedIn ? session.user?.ratings?.[mode] : undefined;

  return (
    <div className="page home">
      <section className="home-main">
        <div className="intro">
          <h1>Veiled Chess</h1>
          <p>
            Arrange your army however you like. Your opponent sees every piece as a bulb, and you see theirs the same
            way. Read their moves, mark your guesses, and capture the king.
          </p>
        </div>

        <div className="mode-switch" role="tablist" aria-label="Game mode">
          {GAME_MODES.map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {MODE_NAME[m]}
            </button>
          ))}
        </div>
        <p className="mode-blurb muted">{MODE_BLURB[mode]}</p>

        <div className="play-grid">
          <div className="play-option">
            <div className="play-head">
              <h2>Play online</h2>
              <span className="muted">
                Rated {MODE_NAME[mode].toLowerCase()} · 10+0{mine ? ` · you're ${mine.rating}` : ''}
              </span>
            </div>
            {queue.searchingSince ? (
              <div className="searching">
                <span>
                  Searching{queue.searchingMode ? ` ${MODE_NAME[queue.searchingMode].toLowerCase()}` : ''} ·{' '}
                  {elapsed(queue.searchingSince, now)}
                </span>
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
              {creating ? 'Creating…' : `Create ${MODE_NAME[mode].toLowerCase()} invite link`}
            </button>
            {error && <div className="notice error">{error}</div>}
          </div>
        </div>

        <details className="rules">
          <summary>How it works</summary>
          <ul>
            <li>
              Before the game you have 60 seconds to set up. In standard, place all 16 pieces anywhere on your first two
              ranks. In armada, pick 8 different pieces for your back rank worth at most {ARMADA_BUDGET} points (the
              king is free); pawns stay on the second rank.
            </li>
            <li>Pawns can move two squares on their first move. There is no castling or en passant.</li>
            <li>There is no check. Capture the enemy king to win, so moving into danger is allowed, and fatal.</li>
            <li>
              Captured pieces are revealed. Drag a piece from the Guesses box onto an enemy bulb to mark what you think
              it is. Only you see your marks.
            </li>
            <li>If a player disconnects for a minute mid-game while their opponent stays, the opponent wins.</li>
            <li>When the game ends, every piece is revealed.</li>
          </ul>
        </details>
        {mode === 'armada' && <PieceGuide mode="armada" />}
      </section>

      <aside className="home-side">
        {session.signedIn && session.user?.ratings && (
          <div className="me">
            <Link to={`/u/${session.user.name}`} className="me-name">
              {session.user.name}
            </Link>
            <dl className="me-ratings">
              {GAME_MODES.map((m) => (
                <div key={m} className={m === mode ? 'current' : ''}>
                  <dt>{MODE_NAME[m]}</dt>
                  <dd>{session.user!.ratings![m].rating}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="mini-board-head">
          <h2>{MODE_NAME[mode]} leaderboard</h2>
          <Link to={`/leaderboard?mode=${mode}`} className="small">
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
