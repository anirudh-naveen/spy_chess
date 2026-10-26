import { useEffect, useRef } from 'react';
import type { MoveRecord } from '@spy/shared';

function san(m: MoveRecord) {
  return `${m.from}${m.captured ? '×' : '–'}${m.to}${m.promo ? '=' + m.promo.toUpperCase() : ''}`;
}

/** Moves as squares only: piece identities stay hidden. */
export function MoveList({ moves }: { moves: MoveRecord[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [moves.length]);

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push(
      <li key={i}>
        <span className="move-no">{i / 2 + 1}</span>
        <span className="move">{san(moves[i])}</span>
        <span className="move">{moves[i + 1] ? san(moves[i + 1]) : ''}</span>
      </li>,
    );
  }
  return (
    <ol className="moves" ref={ref}>
      {rows.length ? rows : <li className="muted empty">No moves yet</li>}
    </ol>
  );
}
