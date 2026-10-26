import type { Color, GameSnapshot, PieceType } from '@spy/shared';
import { Link } from 'react-router-dom';
import { pieceUrl } from '../pieces';
import { formatClock, remaining } from '../useGame';

const ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p', 'k'];

export function PlayerBar({ game, color, offset, now }: { game: GameSnapshot; color: Color; offset: number; now: number }) {
  const seat = game.players[color];
  const ms = remaining(game, color, offset, now);
  const running = game.clockRunning?.color === color && game.phase === 'play';
  // Pieces this player has taken, i.e. captured pieces of the other color.
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
          {taken.map((c, i) => (
            <img key={i} className={`c-${c.color}`} src={pieceUrl(c.color, c.type)} alt={c.type} />
          ))}
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
