import { type GameMode, type PieceType, ARMADA_TYPES, PIECE_INFO, STANDARD_GUESSES } from '@spy/shared';
import { pieceUrl } from '../pieces';

/** How each piece in a mode moves, with its point value. */
export function PieceGuide({ mode, open = false }: { mode: GameMode; open?: boolean }) {
  const types: PieceType[] = mode === 'armada' ? [...ARMADA_TYPES, 'p'] : STANDARD_GUESSES;
  return (
    <details className="guide" open={open}>
      <summary>Piece guide</summary>
      <ul>
        {types.map((t) => (
          <li key={t}>
            <img src={pieceUrl('w', t)} alt="" />
            <div>
              <div className="guide-name">
                {PIECE_INFO[t].name}
                {t !== 'k' && <span className="muted"> · {PIECE_INFO[t].value}</span>}
              </div>
              <div className="guide-moves">{PIECE_INFO[t].moves}</div>
              <div className="guide-role">{PIECE_INFO[t].role}</div>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
