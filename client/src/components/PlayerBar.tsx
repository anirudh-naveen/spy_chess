import type { Color, GameSnapshot, PieceType } from '@spy/shared';
import { Link } from 'react-router-dom';
import { PIECE_NAMES, pieceUrl } from '../pieces';
import { formatClock, remaining } from '../useGame';

const ORDER: (PieceType | 'bulb')[] = ['q', 'c', 'a', 'r', 'j', 'b', 'n', 'm', 'g', 'l', 's', 'p', 'k', 'bulb'];

export function PlayerBar(props: {
  game: GameSnapshot;
  color: Color;
  offset: number;
  now: number;
  /** Captured piece a dragged guess is hovering over. */
  dropPiece?: string | null;
}) {
  const { game, color, offset, now, dropPiece } = props;
  const seat = game.players[color];
  const ms = remaining(game, color, offset, now);
  const running = game.clockRunning?.color === color && game.phase === 'play';
  // Pieces this player has taken, i.e. captured pieces of the other color. Ones the
  // viewer took stay veiled, and can still be marked with a guess.
  const taken = (game.view?.captured ?? [])
    .filter((c) => c.color !== color)
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const change = game.ratingChange?.[color];

  return (
    <div className={`player-bar${running ? ' to-move' : ''}`}>
      <div className="player-id">
        <span className={`dot${seat?.connected ? ' online' : ''}`} title={seat?.connected ? 'Online' : 'Offline'} />
        {seat ? (
          seat.guest ? (
            <span className="player-name">{seat.name}</span>
          ) : (
            <Link className="player-name" to={`/u/${seat.name}`}>
              {seat.name}
            </Link>
          )
        ) : (
          <span className="player-name muted">Waiting for opponent</span>
        )}
        {seat?.rating !== undefined && (
          <span className="player-rating">
            {change ? change.after : seat.rating}
            {change && (
              <span className={change.after >= change.before ? 'delta up' : 'delta down'}>
                {change.after >= change.before ? '+' : '−'}
                {Math.abs(change.after - change.before)}
              </span>
            )}
          </span>
        )}
        <span className="taken">
          {taken.map((c) => {
            const guess = c.type === 'bulb' ? game.marks[c.id] : undefined;
            const markable = c.type === 'bulb' && !!game.you && c.color !== game.you && game.phase === 'play';
            const label = c.type !== 'bulb' ? PIECE_NAMES[c.type] : guess ? `Marked as ${PIECE_NAMES[guess]}` : 'Unknown piece';
            return (
              <span
                key={c.id}
                className={`taken-chip${markable ? ' markable' : ''}${dropPiece === c.id ? ' drop' : ''}`}
                data-piece={markable ? c.id : undefined}
                title={label}
              >
                <img className={`c-${c.color}`} src={pieceUrl(c.color, guess ?? c.type, !!guess)} alt={label} draggable={false} />
              </span>
            );
          })}
        </span>
      </div>
      {(game.phase === 'play' || game.phase === 'over') && (
        <div className={`clock${running ? ' running' : ''}${ms < 30000 && game.phase === 'play' ? ' low' : ''}`}>
          {formatClock(ms)}
        </div>
      )}
    </div>
  );
}
