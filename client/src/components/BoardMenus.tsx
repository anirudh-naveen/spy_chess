import type { Color, PieceType } from '@spy/shared';
import { PIECE_NAMES, pieceUrl } from '../pieces';
import { squarePosition } from './Board';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Grid of square-sized choices anchored to a square, opening toward the board's center. */
function SquareMenu(props: {
  square: string;
  orientation: Color;
  count: number;
  columns?: number;
  onClose(): void;
  children: React.ReactNode;
  label: string;
}) {
  const pos = squarePosition(props.square, props.orientation);
  const columns = props.columns ?? 1;
  const rows = Math.ceil(props.count / columns);
  const down = pos.row < 4;
  const row = Math.min(8 - rows, Math.max(0, down ? pos.row : pos.row + 1 - rows));
  const col = Math.min(8 - columns, pos.col);
  return (
    <>
      <div className="menu-backdrop" onPointerDown={(e) => (stop(e), props.onClose())} onContextMenu={(e) => (e.preventDefault(), stop(e), props.onClose())} />
      <div
        className="square-menu"
        role="menu"
        aria-label={props.label}
        style={{
          left: `${col * 12.5}%`,
          top: `${row * 12.5}%`,
          width: `${columns * 12.5}%`,
          height: `${rows * 12.5}%`,
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
        }}
        onPointerDown={stop}
        onContextMenu={(e) => (e.preventDefault(), stop(e))}
      >
        {props.children}
      </div>
    </>
  );
}

export function PromotionPicker(props: {
  square: string;
  orientation: Color;
  color: Color;
  onPick(t: PieceType): void;
  onClose(): void;
}) {
  return (
    <SquareMenu square={props.square} orientation={props.orientation} count={4} onClose={props.onClose} label="Promote to">
      {(['q', 'r', 'b', 'n'] as PieceType[]).map((t) => (
        <button key={t} role="menuitem" className="menu-choice" title={PIECE_NAMES[t]} onClick={() => props.onPick(t)}>
          <img src={pieceUrl(props.color, t)} alt={PIECE_NAMES[t]} draggable={false} />
        </button>
      ))}
    </SquareMenu>
  );
}
