import { useState } from 'react';
import type { Color, PieceType } from '@spy/shared';
import { PIECE_NAMES, pieceUrl } from '../pieces';

interface Drag {
  /** null drags the "clear" bulb. */
  guess: PieceType | null;
  pointerId: number;
  x: number;
  y: number;
  size: number;
}

/** Board square under a screen point, if any. */
function squareAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-square]');
  return el?.getAttribute('data-square') ?? null;
}

/**
 * A box of piece icons to drag onto enemy bulbs. Dropping one marks that bulb
 * as your guess; dropping the plain bulb clears a mark.
 */
export function GuessTray(props: {
  enemy: Color;
  guesses: PieceType[];
  onDrop(square: string, guess: PieceType | null): void;
  onHover(square: string | null): void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);

  const start = (guess: PieceType | null) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const board = document.querySelector('.board')?.getBoundingClientRect();
    setDrag({ guess, pointerId: e.pointerId, x: e.clientX, y: e.clientY, size: board ? board.width / 8 : 56 });
  };

  const move = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    props.onHover(squareAt(e.clientX, e.clientY));
  };

  const end = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (sq) props.onDrop(sq, drag.guess);
    props.onHover(null);
    setDrag(null);
  };

  const cancel = () => {
    props.onHover(null);
    setDrag(null);
  };

  const chip = (guess: PieceType | null) => (
    <button
      key={guess ?? 'clear'}
      className={`guess-chip${guess ? '' : ' clear'}`}
      title={guess ? `Drag onto a bulb to mark it as a ${PIECE_NAMES[guess]}` : 'Drag onto a marked piece to clear it'}
      onPointerDown={start(guess)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
    >
      <img className={`c-${props.enemy}`} src={pieceUrl(props.enemy, guess ?? 'bulb')} alt={guess ? PIECE_NAMES[guess] : 'Clear'} draggable={false} />
    </button>
  );

  return (
    <div className="guess-tray">
      <div className="label">Guesses</div>
      <div className="guess-grid">
        {props.guesses.map(chip)}
        {chip(null)}
      </div>
      <p className="hint">Drag a piece onto an enemy bulb to mark it. Drop the plain bulb to clear a mark.</p>
      {drag && (
        <img
          className="guess-ghost"
          src={pieceUrl(props.enemy, drag.guess ?? 'bulb', !!drag.guess)}
          alt=""
          style={{ width: drag.size, height: drag.size, left: drag.x - drag.size / 2, top: drag.y - drag.size / 2 }}
        />
      )}
    </div>
  );
}
