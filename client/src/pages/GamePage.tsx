import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type Color,
  type GameSnapshot,
  type Layout,
  type PieceType,
  type PieceView,
  type ResultReason,
  defaultLayout,
  homeSquares,
  lastRank,
  other,
  randomLayout,
  toIndex,
} from '@spy/shared';
import { Board } from '../components/Board';
import { MarkMenu, PromotionPicker } from '../components/BoardMenus';
import { MoveList } from '../components/MoveList';
import { PlayerBar } from '../components/PlayerBar';
import { useQueue } from '../queue';
import { useSession } from '../session';
import { socket } from '../socket';
import { destsFor, useGame, useNow } from '../useGame';

const REASONS: Record<ResultReason, string> = {
  'king-captured': 'King captured',
  resign: 'Resignation',
  timeout: 'Time out',
  agreement: 'Draw agreed',
  'no-moves': 'No legal moves',
  insufficient: 'Only kings left',
  abort: 'Game aborted',
};

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };

function secondsLeft(deadline: number, offset: number, now: number) {
  return Math.max(0, Math.round((deadline - (now + offset)) / 1000));
}

export function GamePage() {
  const { id = '' } = useParams();
  const session = useSession();
  const { game, offset, error, notFound, patch } = useGame(id);

  // Visiting a game link always needs an identity, so a logged-out visitor becomes a guest.
  useEffect(() => {
    if (!session.loading) session.ensureToken().catch(() => {});
  }, [session.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) {
    return (
      <div className="page narrow">
        <h1>Game not found</h1>
        <p className="muted">The link may be wrong, or the game was never started.</p>
        <Link to="/">Back to lobby</Link>
      </div>
    );
  }
  if (!game) return <div className="page narrow muted">Loading game…</div>;
  return <GameView game={game} offset={offset} error={error} patch={patch} />;
}

function GameView({
  game,
  offset,
  error,
  patch,
}: {
  game: GameSnapshot;
  offset: number;
  error: string | null;
  patch: (fn: (g: GameSnapshot) => GameSnapshot) => void;
}) {
  const now = useNow(100);
  const you = game.you;
  const [flipped, setFlipped] = useState(false);
  const orientation: Color = flipped ? other(you ?? 'w') : (you ?? 'w');
  const [markAt, setMarkAt] = useState<{ pieceId: string; square: string } | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const setup = useSetup(game);
  const session = useSession();
  const rated = !!game.ratingChange;

  // Pick up the new rating for the header once a rated game is scored.
  useEffect(() => {
    if (rated) void session.refresh();
  }, [rated]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = other(orientation);
  const bottom = orientation;

  return (
    <div className="game-layout">
      <div className="board-col">
        <PlayerBar game={game} color={top} offset={offset} now={now} />
        {game.phase === 'setup' || game.phase === 'waiting' ? (
          <SetupBoard game={game} orientation={orientation} setup={setup} />
        ) : (
          <PlayBoard
            game={game}
            orientation={orientation}
            markAt={markAt}
            setMarkAt={setMarkAt}
            promo={promo}
            setPromo={setPromo}
            patch={patch}
          />
        )}
        <PlayerBar game={game} color={bottom} offset={offset} now={now} />
      </div>
      <aside className="side">
        <Status game={game} offset={offset} now={now} />
        {error && <div className="notice error">{error}</div>}
        {game.phase === 'waiting' && <InvitePanel game={game} />}
        {game.phase === 'setup' && <SetupHelp game={game} setup={setup} />}
        {(game.phase === 'play' || game.phase === 'over') && game.view && <MoveList moves={game.view.moves} />}
        <Actions game={game} onFlip={() => setFlipped((f) => !f)} />
        {you && game.phase === 'play' && (
          <p className="hint">Right-click or long-press an enemy piece to mark your guess.</p>
        )}
      </aside>
    </div>
  );
}

// ---- board variants ---------------------------------------------------------

function PlayBoard(props: {
  game: GameSnapshot;
  orientation: Color;
  markAt: { pieceId: string; square: string } | null;
  setMarkAt(v: { pieceId: string; square: string } | null): void;
  promo: { from: string; to: string } | null;
  setPromo(v: { from: string; to: string } | null): void;
  patch: (fn: (g: GameSnapshot) => GameSnapshot) => void;
}) {
  const { game, orientation, markAt, setMarkAt, promo, setPromo, patch } = props;
  const view = game.view!;
  const you = game.you;
  const live = game.phase === 'play';
  const dests = useMemo(() => destsFor(view, live ? you : null), [view, you, live]);
  const last = view.moves.at(-1);

  const send = (from: string, to: string, promoType?: PieceType) => {
    socket.send({ t: 'move', id: game.id, from, to, promo: promoType });
    // Show the move immediately; the server's snapshot replaces this.
    patch((g) => {
      if (!g.view) return g;
      const board = g.view.board.slice();
      const piece = board[toIndex(from)];
      if (!piece) return g;
      board[toIndex(to)] = promoType ? { ...piece, type: promoType } : piece;
      board[toIndex(from)] = null;
      return {
        ...g,
        view: {
          ...g.view,
          board,
          turn: other(g.view.turn),
          moves: [...g.view.moves, { from, to, color: piece.color, pieceId: piece.id }],
        },
      };
    });
  };

  const onMove = (from: string, to: string) => {
    const p = view.board[toIndex(from)];
    if (p?.type === 'p' && toIndex(to) >> 3 === lastRank(p.color)) setPromo({ from, to });
    else send(from, to);
  };

  const mark = (pieceId: string, guess: PieceType | null) => {
    socket.send({ t: 'mark', id: game.id, pieceId, guess });
    patch((g) => {
      const marks = { ...g.marks };
      if (guess) marks[pieceId] = guess;
      else delete marks[pieceId];
      return { ...g, marks };
    });
    setMarkAt(null);
  };

  let overlay = null;
  if (promo && you) {
    overlay = (
      <PromotionPicker
        square={promo.to}
        orientation={orientation}
        color={you}
        onPick={(t) => {
          send(promo.from, promo.to, t);
          setPromo(null);
        }}
        onClose={() => setPromo(null)}
      />
    );
  } else if (markAt && you) {
    overlay = (
      <MarkMenu
        square={markAt.square}
        orientation={orientation}
        enemy={other(you)}
        current={game.marks[markAt.pieceId]}
        onPick={(g) => mark(markAt.pieceId, g)}
        onClose={() => setMarkAt(null)}
      />
    );
  }

  return (
    <Board
      pieces={view.board}
      orientation={orientation}
      movable={live ? you : null}
      dests={dests}
      onMove={onMove}
      onMarkRequest={
        you && live
          ? (pieceId, square) => {
              const p = view.board[toIndex(square)];
              if (p?.type === 'bulb') setMarkAt({ pieceId, square });
            }
          : undefined
      }
      marks={game.marks}
      lastMove={last ? { from: last.from, to: last.to } : null}
      overlay={overlay}
    />
  );
}

function layoutPieces(layout: Layout, color: Color): (PieceView | null)[] {
  const pieces: (PieceView | null)[] = new Array(64).fill(null);
  for (const [sq, type] of Object.entries(layout)) pieces[toIndex(sq)] = { id: `${color}:${sq}`, color, type };
  return pieces;
}

interface SetupState {
  layout: Layout | null;
  locked: boolean;
  swap(from: string, to: string): void;
  shuffle(): void;
  standard(): void;
  ready(): void;
}

/** Local arrangement during setup. Drafts are sent so the layout is kept if the timer runs out. */
function useSetup(game: GameSnapshot): SetupState {
  const you = game.you;
  const locked = !you || game.phase !== 'setup' || !!game.setup?.ready[you];
  const [layout, setLayout] = useState<Layout | null>(null);
  const draftTimer = useRef<number | null>(null);

  // Seed from the server copy once; after that the local copy is the source of truth.
  useEffect(() => {
    if (you && !layout && game.phase === 'setup') setLayout(game.setup?.yourLayout ?? defaultLayout(you));
  }, [you, game.phase, game.setup?.yourLayout, layout]);

  const update = (next: Layout) => {
    setLayout(next);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(
      () => socket.send({ t: 'setup.submit', id: game.id, layout: next, final: false }),
      250,
    );
  };

  return {
    layout,
    locked,
    swap(from, to) {
      if (!layout || locked) return;
      const next = { ...layout };
      const a = next[from];
      const b = next[to];
      delete next[from];
      delete next[to];
      if (a) next[to] = a;
      if (b) next[from] = b;
      update(next);
    },
    shuffle: () => you && !locked && update(randomLayout(you)),
    standard: () => you && !locked && update(defaultLayout(you)),
    ready() {
      if (!layout || locked) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      socket.send({ t: 'setup.submit', id: game.id, layout, final: true });
    },
  };
}

function SetupBoard({ game, orientation, setup }: { game: GameSnapshot; orientation: Color; setup: SetupState }) {
  const you = game.you;
  const home = you ? homeSquares(you) : [];
  const pieces = you && setup.layout ? layoutPieces(setup.layout, you) : new Array(64).fill(null);
  return (
    <Board
      pieces={pieces}
      orientation={orientation}
      movable={setup.locked ? null : you}
      dests={(from) => home.filter((s) => s !== from)}
      onMove={setup.swap}
      tinted={setup.locked ? [] : home}
    />
  );
}

// ---- side panel -------------------------------------------------------------

function Status({ game, offset, now }: { game: GameSnapshot; offset: number; now: number }) {
  const you = game.you;
  let title = '';
  let sub: string | null = null;

  if (game.phase === 'waiting') {
    title = you ? 'Waiting for your opponent' : 'Waiting for players';
  } else if (game.phase === 'setup') {
    const s = game.setup!;
    title = `Arrange your pieces · ${secondsLeft(s.deadline, offset, now)}s`;
    if (!you) title = `Players are arranging · ${secondsLeft(s.deadline, offset, now)}s`;
    else sub = s.ready[other(you)] ? 'Opponent is ready.' : 'Opponent is arranging.';
  } else if (game.phase === 'play') {
    const turn = game.view!.turn;
    title = you ? (turn === you ? 'Your move' : "Opponent's move") : `${COLOR_NAME[turn]} to move`;
    if (game.firstMoveDeadline) {
      const s = secondsLeft(game.firstMoveDeadline, offset, now);
      sub = turn === you ? `Make your first move within ${s}s or the game is aborted.` : `${COLOR_NAME[turn]} has ${s}s to make a first move.`;
    }
    if (game.drawOffer && game.drawOffer !== you) sub = you ? 'Your opponent offers a draw.' : `${COLOR_NAME[game.drawOffer]} offers a draw.`;
  } else {
    const r = game.result!;
    if (r.reason === 'abort') title = 'Game aborted';
    else if (r.winner === null) title = 'Draw';
    else if (you) title = r.winner === you ? 'You won' : 'You lost';
    else title = `${COLOR_NAME[r.winner]} wins`;
    sub = r.reason === 'abort' ? 'No rating change.' : REASONS[r.reason];
  }

  return (
    <div className="status">
      <div className="status-title">{title}</div>
      {sub && <div className="status-sub">{sub}</div>}
      <div className="status-meta">
        <span>10+0</span>
        <span>{game.rated ? 'Rated' : 'Casual'}</span>
        {game.stakes && game.phase !== 'over' && (
          <span className="stakes" title="Rating change for a win / draw / loss">
            <span>Win <span className="up">+{game.stakes.win}</span></span>
            <span>Draw {game.stakes.draw >= 0 ? `+${game.stakes.draw}` : `−${-game.stakes.draw}`}</span>
            <span>Loss −{-game.stakes.loss}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function InvitePanel({ game }: { game: GameSnapshot }) {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;
  if (!game.you) return null;
  return (
    <div className="panel-block">
      <label className="label" htmlFor="invite-url">
        Send this link to your opponent
      </label>
      <div className="copy-row">
        <input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="hint">The game starts when they open it. Invite games are unrated.</p>
    </div>
  );
}

function SetupHelp({ game, setup }: { game: GameSnapshot; setup: SetupState }) {
  if (!game.you) return null;
  return (
    <div className="panel-block">
      <p className="hint">
        Drag pieces between squares on your first two ranks to swap them. Your opponent will only see bulbs.
      </p>
      <div className="btn-row">
        <button className="btn" disabled={setup.locked} onClick={setup.shuffle}>
          Shuffle
        </button>
        <button className="btn" disabled={setup.locked} onClick={setup.standard}>
          Standard
        </button>
        <button className="btn primary" disabled={setup.locked} onClick={setup.ready}>
          {setup.locked ? 'Locked in' : 'Ready'}
        </button>
      </div>
    </div>
  );
}

function Actions({ game, onFlip }: { game: GameSnapshot; onFlip(): void }) {
  const you = game.you;
  const session = useSession();
  const queue = useQueue();
  const [confirmResign, setConfirmResign] = useState(false);

  useEffect(() => {
    if (!confirmResign) return;
    const t = window.setTimeout(() => setConfirmResign(false), 3000);
    return () => clearTimeout(t);
  }, [confirmResign]);

  const send = (t: 'resign' | 'draw.offer' | 'draw.accept' | 'draw.decline') => socket.send({ t, id: game.id });
  const live = game.phase === 'setup' || game.phase === 'play';
  const noMovesYet = !game.view || game.view.moves.length === 0;

  return (
    <div className="actions">
      {you && live && (
        <>
          <button
            className={`btn${confirmResign ? ' danger' : ''}`}
            onClick={() => (confirmResign ? (send('resign'), setConfirmResign(false)) : setConfirmResign(true))}
          >
            {confirmResign ? 'Confirm' : noMovesYet ? 'Abort' : 'Resign'}
          </button>
          {game.phase === 'play' && !noMovesYet && (
            <>
              {game.drawOffer === other(you) ? (
                <>
                  <button className="btn" onClick={() => send('draw.accept')}>
                    Accept draw
                  </button>
                  <button className="btn" onClick={() => send('draw.decline')}>
                    Decline
                  </button>
                </>
              ) : (
                <button className="btn" disabled={game.drawOffer === you} onClick={() => send('draw.offer')}>
                  {game.drawOffer === you ? 'Draw offered' : 'Offer draw'}
                </button>
              )}
            </>
          )}
        </>
      )}
      {game.phase === 'over' && game.rated && session.signedIn && (
        <button className="btn primary" disabled={!!queue.searchingSince} onClick={queue.join}>
          {queue.searchingSince ? 'Searching…' : 'New game'}
        </button>
      )}
      {game.phase === 'over' && (
        <Link className="btn" to="/">
          Lobby
        </Link>
      )}
      <button className="btn icon" title="Flip board" aria-label="Flip board" onClick={onFlip}>
        ⇅
      </button>
    </div>
  );
}
