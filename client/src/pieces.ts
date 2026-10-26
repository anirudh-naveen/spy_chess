import { type Color, type PieceType, PIECE_INFO } from '@spy/shared';

// cburnett piece set by Colin M.L. Burnett, CC BY-SA 3.0. Bulbs and armada pieces are our own.
const sources = import.meta.glob('./assets/pieces/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<
  string,
  string
>;

const MARK_RED = '#d8463c';

const toUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const plain = new Map<string, string>();
const marked = new Map<string, string>();
for (const [path, svg] of Object.entries(sources)) {
  const key = path.slice(path.lastIndexOf('/') + 1, -4);
  plain.set(key, toUrl(svg));
  // A guessed piece is drawn with red outlines so the highlight sits on the piece itself.
  marked.set(key, toUrl(svg.replace(/stroke="#000"/g, `stroke="${MARK_RED}"`)));
}

export function pieceUrl(color: Color, type: PieceType | 'bulb', isMarked = false): string {
  return (isMarked ? marked : plain).get(`${color}${type}`)!;
}

export const PIECE_NAMES = Object.fromEntries(
  Object.entries(PIECE_INFO).map(([t, info]) => [t, info.name]),
) as Record<PieceType, string>;
