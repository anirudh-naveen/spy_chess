import type { Color, PieceType } from '@spy/shared';
import { PIECE_NAMES, pieceUrl } from '../pieces';
import { squarePosition } from './Board';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Column of choices anchored to a square, opening toward the board's center. */
function SquareMenu(props: {
  square: string;
  orientation: Color;
  count: number;
  onClose(): void;
  children: React.ReactNode;
  label: string;
}) {
  const pos = squarePosition(props.square, props.orientation);
  const down = pos.row < 4;
  const top = down ? pos.row * 12.5 : (pos.row + 1 - props.count) * 12.5;
  return (
    <>
      <div className="menu-backdrop" onPointerDown={(e) => (stop(e), props.onClose())} onContextMenu={(e) => (e.preventDefault(), stop(e), props.onClose())} />
      <div
        className="square-menu"
        role="menu"
        aria-label={props.label}
        style={{ left: pos.left, top: `${Math.max(0, top)}%`, height: `${props.count * 12.5}%` }}
        onPointerDown={stop}
        onContextMenu={(e) => (e.preventDefault(), stop(e))}
      >
        {props.children}
      </div>
    </>
  );
}

const GUESSES: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export function MarkMenu(props: {
  square: string;
  orientation: Color;
  enemy: Color;
  current: PieceType | undefined;
  onPick(guess: PieceType | null): void;
  onClose(): void;
}) {
  return (
    <SquareMenu square={props.square} orientation={props.orientation} count={7} onClose={props.onClose} label="Mark piece">
      {GUESSES.map((t) => (
        <button
          key={t}
          role="menuitem"
          className={`menu-choice${props.current === t ? ' active' : ''}`}
          title={`Mark as ${PIECE_NAMES[t]}`}
          onClick={() => props.onPick(t)}
        >
          <img src={pieceUrl(props.enemy, t)} alt={PIECE_NAMES[t]} draggable={false} />
        </button>
      ))}
      <button role="menuitem" className="menu-choice clear" title="Clear mark" onClick={() => props.onPick(null)}>
        <img src={pieceUrl(props.enemy, 'bulb')} alt="Clear" draggable={false} />
      </button>
    </SquareMenu>
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
