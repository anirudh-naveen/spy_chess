import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type Color, type PieceType, type PieceView, FILES, toIndex, toSquare } from '@spy/shared';
import { pieceUrl } from '../pieces';

export interface BoardProps {
  /** 64 entries, a1 = 0. */
  pieces: (PieceView | null)[];
  orientation: Color;
  /** Which side's pieces the user may pick up, if any. */
  movable?: Color | null;
  /** Legal destinations for a picked-up piece. */
  dests?: (from: string) => string[];
  onMove?: (from: string, to: string) => void;
  marks?: Record<string, PieceType>;
  lastMove?: { from: string; to: string } | null;
  /** Squares drawn with a subtle tint (home ranks during setup, a guess's drop target). */
  tinted?: string[];
  /** Absolutely positioned content over the board, e.g. menus. */
  overlay?: ReactNode;
}

interface Drag {
  from: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  wasSelected: boolean;
}

/** Percent offsets of a square inside the board, for positioning overlays. */
export function squarePosition(sq: string, orientation: Color) {
  const i = toIndex(sq);
  const f = i % 8;
  const r = i >> 3;
  const col = orientation === 'w' ? f : 7 - f;
  const row = orientation === 'w' ? 7 - r : r;
  return { left: `${col * 12.5}%`, top: `${row * 12.5}%`, col, row };
}

export function Board(props: BoardProps) {
  const { pieces, orientation, movable, dests, onMove, marks, lastMove, tinted, overlay } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const targets = selected && dests ? dests(selected) : [];

  // Drop the selection if the piece it pointed at is no longer ours to move.
  useEffect(() => {
    if (!selected) return;
    const p = pieces[toIndex(selected)];
    if (!p || p.color !== movable) setSelected(null);
  }, [pieces, movable, selected]);

  const squareAt = (x: number, y: number): string | null => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const f = orientation === 'w' ? col : 7 - col;
    const r = orientation === 'w' ? 7 - row : row;
    return toSquare(r * 8 + f);
  };

  const tryMove = (from: string, to: string) => {
    if (from !== to && dests?.(from).includes(to)) {
      onMove?.(from, to);
      setSelected(null);
      return true;
    }
    return false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    const piece = pieces[toIndex(sq)];

    if (selected && tryMove(selected, sq)) return;

    if (piece && movable && piece.color === movable) {
      ref.current?.setPointerCapture(e.pointerId);
      setDrag({
        from: sq,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false,
        wasSelected: selected === sq,
      });
      setSelected(sq);
      return;
    }

    setSelected(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const active = drag.active || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, active });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const to = squareAt(e.clientX, e.clientY);
    if (drag.active) {
      if (!(to && tryMove(drag.from, to))) setSelected(null);
    } else if (drag.wasSelected && to === drag.from) {
      setSelected(null);
    }
    setDrag(null);
  };


  const rect = ref.current?.getBoundingClientRect();
  const size = rect ? rect.width / 8 : 0;

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = orientation === 'w' ? col : 7 - col;
      const r = orientation === 'w' ? 7 - row : row;
      const sq = toSquare(r * 8 + f);
      const piece = pieces[r * 8 + f];
      const dark = (f + r) % 2 === 0;
      const isTarget = targets.includes(sq);
      const guess = piece && piece.type === 'bulb' ? marks?.[piece.id] : undefined;
      const dragging = drag?.active && drag.from === sq;
      const cls = [
        'sq',
        dark ? 'dark' : 'light',
        lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last' : '',
        selected === sq ? 'selected' : '',
        tinted?.includes(sq) ? 'tinted' : '',
        piece?.confirmed ? 'confirmed' : '',
        isTarget ? (piece ? 'target capture' : 'target') : '',
      ]
        .filter(Boolean)
        .join(' ');
      squares.push(
        <div key={sq} className={cls} data-square={sq}>
          {piece && (
            <img
              className={`piece${dragging ? ' ghosted' : ''}`}
              src={pieceUrl(piece.color, guess ?? piece.type, !!guess)}
              alt=""
              draggable={false}
            />
          )}
          {col === 0 && <span className="coord rank">{r + 1}</span>}
          {row === 7 && <span className="coord file">{FILES[f]}</span>}
        </div>,
      );
    }
  }

  const dragPiece = drag?.active ? pieces[toIndex(drag.from)] : null;

  return (
    <div
      ref={ref}
      className="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {squares}
      {dragPiece && rect && (
        <img
          className="piece dragging"
          src={pieceUrl(dragPiece.color, dragPiece.type)}
          alt=""
          draggable={false}
          style={{
            width: size,
            height: size,
            left: drag!.x - rect.left - size / 2,
            top: drag!.y - rect.top - size / 2,
          }}
        />
      )}
      {overlay}
    </div>
  );
}
