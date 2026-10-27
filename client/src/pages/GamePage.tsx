import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type Color,
  type GameMode,
  type GameSnapshot,
  type Layout,
  type PieceType,
  type PieceView,
  type ResultReason,
  ARMADA_GUESSES,
  ARMADA_MAX_PAWNS,
  ARMADA_TOTAL,
  ARMADA_TYPES,
  PIECE_INFO,
  STANDARD_GUESSES,
  squadPoints,
  defaultLayout,
  homeRanks,
  lastRank,
  other,
  randomLayout,
  setupSquares,
  toIndex,
  validateLayout,
} from '@spy/shared';
import { Board } from '../components/Board';
import { PromotionPicker } from '../components/BoardMenus';
import { type GuessTarget, GuessTray } from '../components/GuessTray';
import { MoveList } from '../components/MoveList';
import { PieceGuide } from '../components/PieceGuide';
import { PlayerBar } from '../components/PlayerBar';
import { useQueue } from '../queue';
import { pieceUrl } from '../pieces';
import { useSession } from '../session';
import { socket } from '../socket';
import { destsFor, useGame, useNow } from '../useGame';

const REASONS: Record<ResultReason, string> = {
  'king-captured': 'King captured',
  resign: 'Resignation',
  timeout: 'Time out',
  abandon: 'Opponent left the game',
  agreement: 'Draw agreed',
  'no-moves': 'No legal moves',
  insufficient: 'Only kings left',
  abort: 'Game aborted',
};

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
export const MODE_NAME: Record<GameMode, string> = { standard: 'Standard', armada: 'Armada' };

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
  const [dropOn, setDropOn] = useState<GuessTarget | null>(null);
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

  /** The enemy bulb a guess would land on, on the board or among captured pieces, if any. */
  const markable = (target: GuessTarget | null): { id: string } | null => {
    if (!target || !you || game.phase !== 'play' || !game.view) return null;
    const p =
      'square' in target
        ? game.view.board[toIndex(target.square)]
        : game.view.captured.find((c) => c.id === target.pieceId);
    return p && p.color !== you && p.type === 'bulb' ? p : null;
  };

  const dropPieceId = dropOn && 'pieceId' in dropOn && markable(dropOn) ? dropOn.pieceId : null;

  const markTarget = (target: GuessTarget, guess: PieceType | null) => {
    const piece = markable(target);
    if (!piece) return;
    socket.send({ t: 'mark', id: game.id, pieceId: piece.id, guess });
    patch((g) => {
      const marks = { ...g.marks };
      if (guess) marks[piece.id] = guess;
      else delete marks[piece.id];
      return { ...g, marks };
    });
  };

  return (
    <div className="game-layout">
      <div className="board-col">
        <PlayerBar game={game} color={top} offset={offset} now={now} dropPiece={dropPieceId} />
        {game.phase === 'setup' || game.phase === 'waiting' ? (
          <SetupBoard game={game} orientation={orientation} setup={setup} />
        ) : (
          <PlayBoard
            game={game}
            orientation={orientation}
            dropTarget={dropOn && 'square' in dropOn && markable(dropOn) ? dropOn.square : null}
            promo={promo}
            setPromo={setPromo}
            patch={patch}
          />
        )}
        <PlayerBar game={game} color={bottom} offset={offset} now={now} dropPiece={dropPieceId} />
      </div>
      <aside className="side">
        <Status game={game} offset={offset} now={now} />
        {error && <div className="notice error">{error}</div>}
        {game.phase === 'waiting' && <InvitePanel game={game} />}
        {game.phase === 'setup' && <SetupHelp game={game} setup={setup} />}
        {(game.phase === 'play' || game.phase === 'over') && game.view && <MoveList moves={game.view.moves} />}
        <Actions game={game} onFlip={() => setFlipped((f) => !f)} />
        {you && game.phase === 'play' && (
          <GuessTray
            enemy={other(you)}
            guesses={game.mode === 'armada' ? ARMADA_GUESSES : STANDARD_GUESSES}
            onDrop={markTarget}
            onHover={setDropOn}
          />
        )}
        {game.mode === 'armada' && game.phase !== 'setup' && <PieceGuide mode="armada" />}
      </aside>
    </div>
  );
}

// ---- board variants ---------------------------------------------------------

function PlayBoard(props: {
  game: GameSnapshot;
  orientation: Color;
  /** Square highlighted while a guess is dragged over it. */
  dropTarget: string | null;
  promo: { from: string; to: string } | null;
  setPromo(v: { from: string; to: string } | null): void;
  patch: (fn: (g: GameSnapshot) => GameSnapshot) => void;
}) {
  const { game, orientation, dropTarget, promo, setPromo, patch } = props;
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
  }

  return (
    <Board
      pieces={view.board}
      orientation={orientation}
      movable={live ? you : null}
      dests={dests}
      onMove={onMove}
      marks={game.marks}
      tinted={dropTarget ? [dropTarget] : []}
      lastMove={last ? { from: last.from, to: last.to } : null}
      overlay={overlay}
    />
  );
}

interface SetupState {
  layout: Layout | null;
  locked: boolean;
  /** Whether the current layout is a legal starting position. */
  complete: boolean;
  /** Squares the player may arrange pieces on. */
  squares: string[];
  swap(from: string, to: string): void;
  /** Armada only: whether another piece of this type fits (points, count and space). */
  canAdd(type: PieceType): boolean;
  /** Armada only: put a piece on an empty home square (pawns prefer the front rank). */
  add(type: PieceType): void;
  /** Armada only: take one piece of this type off the board. */
  remove(type: PieceType): void;
  shuffle(): void;
  reset(): void;
  ready(): void;
}

/** Local arrangement during setup. Complete drafts are sent so the layout is kept if the timer runs out. */
function useSetup(game: GameSnapshot): SetupState {
  const you = game.you;
  const mode = game.mode;
  const locked = !you || game.phase !== 'setup' || !!game.setup?.ready[you];
  const [layout, setLayout] = useState<Layout | null>(null);
  const draftTimer = useRef<number | null>(null);
  const squares = you ? setupSquares(you, mode) : [];
  const complete = !!you && !!layout && validateLayout(you, layout, mode) === null;

  // Seed from the server copy once; after that the local copy is the source of truth.
  useEffect(() => {
    if (you && !layout && game.phase === 'setup') setLayout(game.setup?.yourLayout ?? defaultLayout(you, mode));
  }, [you, mode, game.phase, game.setup?.yourLayout, layout]);

  const update = (next: Layout) => {
    setLayout(next);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!you || validateLayout(you, next, mode) !== null) return;
    draftTimer.current = window.setTimeout(
      () => socket.send({ t: 'setup.submit', id: game.id, layout: next, final: false }),
      250,
    );
  };

  const count = (type: PieceType) => Object.values(layout ?? {}).filter((t) => t === type).length;
  const canAdd = (type: PieceType) => {
    if (!layout || locked || mode !== 'armada' || type === 'k') return false;
    if (type === 'p' ? count('p') >= ARMADA_MAX_PAWNS : count(type) > 0) return false;
    return squares.some((sq) => !layout[sq]) && squadPoints(layout) + PIECE_INFO[type].value <= ARMADA_TOTAL;
  };
  // Pawns fill the front rank first, everything else the back rank.
  const preferred = (type: PieceType) => {
    if (!you) return squares;
    const [back, front] = homeRanks(you);
    const rank = type === 'p' ? front : back;
    return [...squares.filter((sq) => toIndex(sq) >> 3 === rank), ...squares.filter((sq) => toIndex(sq) >> 3 !== rank)];
  };

  return {
    layout,
    locked,
    complete,
    squares,
    swap(from, to) {
      if (!layout || locked || !squares.includes(from) || !squares.includes(to)) return;
      const next = { ...layout };
      const a = next[from];
      const b = next[to];
      delete next[from];
      delete next[to];
      if (a) next[to] = a;
      if (b) next[from] = b;
      update(next);
    },
    canAdd,
    add(type) {
      if (!layout || !canAdd(type)) return;
      const empty = preferred(type).find((sq) => !layout[sq]);
      if (empty) update({ ...layout, [empty]: type });
    },
    remove(type) {
      if (!layout || locked || type === 'k') return;
      const at = [...preferred(type)].reverse().find((sq) => layout[sq] === type);
      if (!at) return;
      const next = { ...layout };
      delete next[at];
      update(next);
    },
    shuffle: () => you && !locked && update(randomLayout(you, mode)),
    reset: () => you && !locked && update(defaultLayout(you, mode)),
    ready() {
      if (!layout || locked || !complete) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      socket.send({ t: 'setup.submit', id: game.id, layout, final: true });
    },
  };
}

function layoutPieces(layout: Layout, color: Color): (PieceView | null)[] {
  const pieces: (PieceView | null)[] = new Array(64).fill(null);
  for (const [sq, type] of Object.entries(layout)) pieces[toIndex(sq)] = { id: `${color}:${sq}`, color, type };
  return pieces;
}

function SetupBoard({ game, orientation, setup }: { game: GameSnapshot; orientation: Color; setup: SetupState }) {
  const you = game.you;
  const pieces = you && setup.layout ? layoutPieces(setup.layout, you) : new Array(64).fill(null);
  return (
    <Board
      pieces={pieces}
      orientation={orientation}
      movable={setup.locked ? null : you}
      dests={(from) => (setup.squares.includes(from) ? setup.squares.filter((s) => s !== from) : [])}
      onMove={setup.swap}
      tinted={setup.locked ? [] : setup.squares}
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
    for (const c of ['w', 'b'] as const) {
      const d = game.abandonDeadline[c];
      if (d === null || c === you) continue;
      const s = secondsLeft(d, offset, now);
      sub = you
        ? `Your opponent disconnected. If they don't return in ${s}s, you win.`
        : `${COLOR_NAME[c]} disconnected · ${s}s to return.`;
    }
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
        <span>{MODE_NAME[game.mode]}</span>
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
  const you = game.you;
  if (!you) return null;
  const armada = game.mode === 'armada';
  return (
    <div className="panel-block">
      <p className="hint">
        {armada
          ? `Build an armada worth exactly ${ARMADA_TOTAL} points: any of the 12 pieces, one of each (the king is free and required), plus up to ${ARMADA_MAX_PAWNS} pawns at 1 point each. Drag to arrange them anywhere on your first two ranks.`
          : 'Drag pieces between squares on your first two ranks to swap them.'}{' '}
        Your opponent will only see bulbs.
      </p>
      {armada && <Roster color={you} setup={setup} />}
      <div className="btn-row">
        <button className="btn" disabled={setup.locked} onClick={setup.shuffle}>
          Shuffle
        </button>
        <button className="btn" disabled={setup.locked} onClick={setup.reset}>
          {armada ? 'Default' : 'Standard'}
        </button>
        <button className="btn primary" disabled={setup.locked || !setup.complete} onClick={setup.ready}>
          {setup.locked ? 'Locked in' : 'Ready'}
        </button>
      </div>
    </div>
  );
}

/** The armada roster: toggle pieces in and out, count pawns, and hover any piece to see how it works. */
function Roster({ color, setup }: { color: Color; setup: SetupState }) {
  const [info, setInfo] = useState<PieceType | null>(null);
  const layout = setup.layout ?? {};
  const worth = squadPoints(layout);
  const left = ARMADA_TOTAL - worth;
  const pawns = Object.values(layout).filter((t) => t === 'p').length;
  const onBoard = new Set(Object.values(layout));
  const show = (t: PieceType) => ({
    onMouseEnter: () => setInfo(t),
    onFocus: () => setInfo(t),
  });

  return (
    <div className="roster">
      <div className="roster-head">
        <span className="label">Your armada</span>
        <span className={`small points ${left === 0 ? 'exact' : left < 0 ? 'over' : ''}`}>
          {worth} / {ARMADA_TOTAL} pts{left > 0 ? ` · ${left} to go` : left === 0 ? ' · ready' : ''}
        </span>
      </div>
      <div className="roster-grid">
        {ARMADA_TYPES.map((t) => {
          const active = onBoard.has(t);
          // Not `disabled`: disabled buttons get no hover, and the details should show for every piece.
          const off = setup.locked || t === 'k' || (!active && !setup.canAdd(t));
          return (
            <button
              key={t}
              className={`roster-chip${active ? ' active' : ''}${off ? ' off' : ''}${info === t ? ' shown' : ''}`}
              aria-disabled={off}
              onClick={() => {
                setInfo(t);
                if (!off) (active ? setup.remove : setup.add)(t);
              }}
              {...show(t)}
            >
              <img className={`c-${color}`} src={pieceUrl(color, t)} alt="" />
              <span className="roster-name">{PIECE_INFO[t].name}</span>
              <span className="roster-value">{t === 'k' ? '' : PIECE_INFO[t].value}</span>
            </button>
          );
        })}
        <div className={`roster-chip pawn-chip${pawns ? ' active' : ''}${info === 'p' ? ' shown' : ''}`} {...show('p')}>
          <img className={`c-${color}`} src={pieceUrl(color, 'p')} alt="" />
          <span className="roster-name">
            Pawns <span className="roster-value">×{pawns}</span>
          </span>
          <span className="stepper">
            <button aria-label="Remove a pawn" disabled={setup.locked || pawns === 0} onClick={() => setup.remove('p')} onFocus={() => setInfo('p')}>
              −
            </button>
            <button aria-label="Add a pawn" disabled={!setup.canAdd('p')} onClick={() => setup.add('p')} onFocus={() => setInfo('p')}>
              +
            </button>
          </span>
        </div>
      </div>
      <div className="roster-info" aria-live="polite">
        {info ? (
          <>
            <img className={`c-${color}`} src={pieceUrl(color, info)} alt="" />
            <div>
              <div className="guide-name">
                {PIECE_INFO[info].name}
                {info !== 'k' && <span className="muted"> · {PIECE_INFO[info].value} pt{PIECE_INFO[info].value === 1 ? '' : 's'}</span>}
              </div>
              <div className="guide-moves">{PIECE_INFO[info].moves}</div>
              <div className="guide-role">{PIECE_INFO[info].role}</div>
            </div>
          </>
        ) : (
          <p className="hint">Hover over or tap a piece to see how it moves.</p>
        )}
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
        <button className="btn primary" disabled={!!queue.searchingSince} onClick={() => queue.join(game.mode)}>
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
