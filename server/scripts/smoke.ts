// End-to-end check against a running server: rated matchmaking in both modes, setup, hidden
// pieces, marks, a king capture, Elo, guest invites and abandonment.
// Usage: start the server with ABANDON_MS=3000, then npm run smoke -w server
import WebSocket from 'ws';
import { defaultLayout, type Color, type GameMode, type GameSnapshot, type ServerMsg } from '@spy/shared';

const API = process.env.API_URL ?? 'http://localhost:8080';
const WS = API.replace(/^http/, 'ws') + '/ws';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok  ${msg}`);
}

async function post(path: string, body: unknown, token?: string) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as any };
}

class Client {
  ws: WebSocket;
  frames: string[] = [];
  latest = new Map<string, GameSnapshot>();
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];

  constructor(public token: string) {
    this.ws = new WebSocket(WS);
    this.ws.on('message', (raw) => {
      const s = raw.toString();
      this.frames.push(s);
      const m = JSON.parse(s) as ServerMsg;
      if (m.t === 'game.state') this.latest.set(m.game.id, m.game);
      this.waiters = this.waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
    });
  }
  async open() {
    await new Promise((r) => this.ws.once('open', r));
    this.send({ t: 'hello', token: this.token });
    await this.wait((m) => m.t === 'hello.ok');
  }
  send(m: object) {
    this.ws.send(JSON.stringify(m));
  }
  wait(pred: (m: ServerMsg) => boolean, ms = 4000): Promise<ServerMsg> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timed out waiting for message')), ms);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }
  state(id: string, pred: (g: GameSnapshot) => boolean, ms?: number) {
    const g = this.latest.get(id);
    if (g && pred(g)) return Promise.resolve(g);
    return this.wait((m) => m.t === 'game.state' && m.game.id === id && pred(m.game), ms).then(
      (m) => (m as Extract<ServerMsg, { t: 'game.state' }>).game,
    );
  }
}

const tag = Math.random().toString(36).slice(2, 7);

console.log('rated game');
const a = await post('/auth/signup', { username: `alice_${tag}`, email: `a_${tag}@x.dev`, password: 'password1' });
const b = await post('/auth/signup', { username: `bob_${tag}`, email: `b_${tag}@x.dev`, password: 'password1' });
assert(a.status === 200 && b.status === 200, 'two accounts sign up');
assert((await post('/auth/signup', { username: `ALICE_${tag}`, email: 'z@x.dev', password: 'password1' })).status === 409, 'usernames are case-insensitive unique');
const login = await post('/auth/login', { login: `alice_${tag}`, password: 'password1' });
assert(
  login.status === 200 && login.body.user.ratings.standard.rating === 1000 && login.body.user.ratings.armada.rating === 1000,
  'login works, both ratings start at 1000',
);
assert((await post('/auth/login', { login: `alice_${tag}`, password: 'nope' })).status === 401, 'wrong password rejected');

const ca = new Client(a.body.token);
const cb = new Client(b.body.token);
await Promise.all([ca.open(), cb.open()]);
const foundA = ca.wait((m) => m.t === 'match.found');
const foundB = cb.wait((m) => m.t === 'match.found');
ca.send({ t: 'queue.join', mode: 'standard' });
cb.send({ t: 'queue.join', mode: 'standard' });
const [ma, mb] = (await Promise.all([foundA, foundB])) as Extract<ServerMsg, { t: 'match.found' }>[];
assert(ma.id === mb.id, 'queue pairs the two players into one game');
const id = ma.id;

ca.send({ t: 'game.join', id });
cb.send({ t: 'game.join', id });
const sa = await ca.state(id, (g) => g.phase === 'setup');
await cb.state(id, (g) => g.phase === 'setup');
assert(sa.rated && sa.stakes?.win === 20 && sa.stakes.loss === -20, 'stakes shown: +20 / -20');

const [white, black] = sa.you === 'w' ? [ca, cb] : [cb, ca];
const colorOf = (c: Client): Color => (c === white ? 'w' : 'b');

white.send({ t: 'setup.submit', id, layout: { a1: 'k' }, final: true });
await white.wait((m) => m.t === 'error');
assert(true, 'invalid layout rejected');
for (const c of [white, black]) c.send({ t: 'setup.submit', id, layout: defaultLayout(colorOf(c)), final: true });
const ws0 = await white.state(id, (g) => g.phase === 'play');
await black.state(id, (g) => g.phase === 'play');
assert(ws0.view!.board.filter((p) => p?.color === 'b').every((p) => p!.type === 'bulb'), 'white sees black pieces as bulbs');
assert(ws0.view!.board.filter((p) => p?.color === 'w').every((p) => p!.type !== 'bulb'), 'white sees own pieces');

black.send({ t: 'move', id, from: 'e7', to: 'e5' });
await black.wait((m) => m.t === 'error' && m.message === 'Not your turn');
assert(true, 'moving out of turn is rejected');

const moves: [Client, string, string][] = [
  [white, 'e2', 'e3'],
  [black, 'f7', 'f5'],
  [white, 'd1', 'h5'],
  [black, 'a7', 'a6'],
];
for (const [c, from, to] of moves) {
  const n = (c.latest.get(id)?.view?.moves.length ?? 0) + 1;
  c.send({ t: 'move', id, from, to });
  await white.state(id, (g) => g.view!.moves.length === n);
  await black.state(id, (g) => g.view!.moves.length === n);
}
const running = white.latest.get(id)!;
assert(running.clockRunning?.color === 'w', 'clock runs after both first moves');

white.send({ t: 'mark', id, pieceId: 'b:e8', guess: 'k' });
await white.state(id, (g) => g.marks['b:e8'] === 'k');
assert(Object.keys(black.latest.get(id)!.marks).length === 0, 'marks are private to the marker');
white.send({ t: 'mark', id, pieceId: 'w:e1', guess: 'k' });
await white.wait((m) => m.t === 'error');
assert(true, 'cannot mark own pieces');

white.send({ t: 'move', id, from: 'h5', to: 'e8' });
const end = await white.state(id, (g) => g.phase === 'over' && !!g.ratingChange);
assert(end.result?.winner === 'w' && end.result.reason === 'king-captured', 'capturing the king wins');
assert(end.ratingChange!.w.after === 1020 && end.ratingChange!.b.after === 980, 'ratings 1020 / 980');
assert(end.view!.board.every((p) => !p || p.type !== 'bulb'), 'board revealed after the game');

const playFrames = black.frames.filter((f) => f.includes('"phase":"play"'));
const leaked = playFrames.some((f) => {
  const g = (JSON.parse(f) as any).game as GameSnapshot;
  return g.view!.board.some((p) => p && p.color === 'w' && p.type !== 'bulb');
});
assert(!leaked, 'no white piece type ever reached black during play');

const whiteName = colorOf(ca) === 'w' ? `alice_${tag}` : `bob_${tag}`;
const prof = (await (await fetch(`${API}/users/${whiteName}`)).json()) as any;
assert(
  prof.user.ratings.standard.rating === 1020 && prof.history.length === 1 && prof.games[0].outcome === 'win',
  'profile shows rating, history, game',
);
const lb = (await (await fetch(`${API}/leaderboard`)).json()) as any;
assert(lb.players.some((p: any) => p.name === whiteName), 'leaderboard lists the winner');

console.log('guest invite');
const g1 = await post('/auth/guest', {});
const g2 = await post('/auth/guest', {});
const inv = await post('/invites', { color: 'w' }, g1.body.token);
assert(inv.status === 200, 'guest creates invite');
const c1 = new Client(g1.body.token);
const c2 = new Client(g2.body.token);
await Promise.all([c1.open(), c2.open()]);
c1.send({ t: 'game.join', id: inv.body.id });
await c1.state(inv.body.id, (g) => g.phase === 'waiting' && g.you === 'w');
c2.send({ t: 'queue.join', mode: 'standard' });
await c2.wait((m) => m.t === 'error' && /Sign in/.test(m.message));
assert(true, 'guests cannot queue for rated games');
c2.send({ t: 'game.join', id: inv.body.id });
const gs = await c2.state(inv.body.id, (g) => g.phase === 'setup');
assert(gs.you === 'b' && !gs.rated && gs.stakes === null, 'second guest takes black, unrated');
const spectator = new Client((await post('/auth/guest', {})).body.token);
await spectator.open();
spectator.send({ t: 'game.join', id: inv.body.id });
const sp = await spectator.state(inv.body.id, () => true);
assert(sp.you === null, 'third visitor watches as a spectator');
c1.send({ t: 'resign', id: inv.body.id });
const ab = await c2.state(inv.body.id, (g) => g.phase === 'over');
assert(ab.result?.reason === 'abort', 'leaving during setup aborts');

console.log('armada rated game');
const d = await post('/auth/signup', { username: `dana_${tag}`, email: `d_${tag}@x.dev`, password: 'password1' });
const e = await post('/auth/signup', { username: `eli_${tag}`, email: `e_${tag}@x.dev`, password: 'password1' });
const cd = new Client(d.body.token);
const ce = new Client(e.body.token);
await Promise.all([cd.open(), ce.open()]);
// Someone queued for standard must not be paired with an armada player.
const cx = new Client(a.body.token);
await cx.open();
cx.send({ t: 'queue.join', mode: 'standard' });
const foundD = cd.wait((m) => m.t === 'match.found');
const foundE = ce.wait((m) => m.t === 'match.found');
cd.send({ t: 'queue.join', mode: 'armada' as GameMode });
ce.send({ t: 'queue.join', mode: 'armada' as GameMode });
const [md, me] = (await Promise.all([foundD, foundE])) as Extract<ServerMsg, { t: 'match.found' }>[];
assert(md.id === me.id, 'armada queue pairs armada players only');
cx.send({ t: 'queue.leave' });
const aid = md.id;
cd.send({ t: 'game.join', id: aid });
ce.send({ t: 'game.join', id: aid });
const as0 = await cd.state(aid, (g) => g.phase === 'setup');
assert(as0.mode === 'armada' && as0.rated, 'game is a rated armada game');
const [aw, abl] = as0.you === 'w' ? [cd, ce] : [ce, cd];
aw.send({ t: 'setup.submit', id: aid, layout: defaultLayout('w'), final: true });
await aw.wait((m) => m.t === 'error');
assert(true, 'a standard layout is rejected in armada');
// Queen, chancellor and archbishop together blow the 30-point budget.
const heavy = { ...defaultLayout('w', 'armada'), a1: 'c', b1: 'a', c1: 'r' } as any;
aw.send({ t: 'setup.submit', id: aid, layout: heavy, final: true });
await aw.wait((m) => m.t === 'error' && /limit is 30/.test(m.message));
assert(true, 'an armada over the point budget is rejected');
// A creative 28-point squad: chancellor and archbishop instead of the queen.
const creative = { ...defaultLayout('w', 'armada'), a1: 'c', b1: 'a', c1: 'n', d1: 'b', f1: 's', g1: 'g', h1: 'l' } as any;
aw.send({ t: 'setup.submit', id: aid, layout: creative, final: true });
abl.send({ t: 'setup.submit', id: aid, layout: defaultLayout('b', 'armada'), final: true });
await aw.state(aid, (g) => g.phase === 'play');
aw.send({ t: 'move', id: aid, from: 'e2', to: 'e4' });
await abl.state(aid, (g) => g.view?.moves.length === 1);
abl.send({ t: 'move', id: aid, from: 'e7', to: 'e5' });
await aw.state(aid, (g) => g.view?.moves.length === 2);
abl.send({ t: 'resign', id: aid });
const aend = await aw.state(aid, (g) => g.phase === 'over' && !!g.ratingChange);
const gain = aend.ratingChange!.w.after - aend.ratingChange!.w.before;
assert(gain === 20, 'armada uses plain Elo (+20 between new players)');
const dName = aw === cd ? `dana_${tag}` : `eli_${tag}`;
const dprof = (await (await fetch(`${API}/users/${dName}`)).json()) as any;
assert(
  dprof.user.ratings.armada.rating === 1000 + gain && dprof.user.ratings.standard.rating === 1000,
  'only the armada rating changed',
);
const alb = (await (await fetch(`${API}/leaderboard?mode=armada`)).json()) as any;
assert(alb.players.some((p: any) => p.name === dName), 'armada leaderboard lists the winner');

console.log('abandonment');
const h1 = await post('/auth/guest', {});
const h2 = await post('/auth/guest', {});
const inv2 = await post('/invites', { color: 'w', mode: 'standard' }, h1.body.token);
const k1 = new Client(h1.body.token);
const k2 = new Client(h2.body.token);
await Promise.all([k1.open(), k2.open()]);
const gid = inv2.body.id;
k1.send({ t: 'game.join', id: gid });
await k1.state(gid, (g) => g.phase === 'waiting');
k2.send({ t: 'game.join', id: gid });
await k2.state(gid, (g) => g.phase === 'setup');
k1.send({ t: 'setup.submit', id: gid, layout: defaultLayout('w'), final: true });
k2.send({ t: 'setup.submit', id: gid, layout: defaultLayout('b'), final: true });
await k1.state(gid, (g) => g.phase === 'play');
k1.send({ t: 'move', id: gid, from: 'e2', to: 'e4' });
await k2.state(gid, (g) => g.view?.moves.length === 1);
k2.send({ t: 'move', id: gid, from: 'e7', to: 'e5' });
await k1.state(gid, (g) => g.view?.moves.length === 2);
k1.ws.close();
const away = await k2.state(gid, (g) => g.abandonDeadline.w !== null);
assert(!away.players.w!.connected, 'opponent sees white disconnect, with a countdown');
const ab2 = await k2.state(gid, (g) => g.phase === 'over', 10000);
assert(ab2.result?.winner === 'b' && ab2.result.reason === 'abandon', 'abandoning player loses');

console.log('\nall smoke checks passed');
for (const c of [ca, cb, c1, c2, spectator, cd, ce, cx, k2]) c.ws.close();
process.exit(0);
