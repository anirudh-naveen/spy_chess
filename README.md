# Spy Chess

A variant of king-capture chess where the pieces' roles are unknown.

Each player arranges their 16 pieces however they like on their first two ranks. Your opponent sees every one of your
pieces as an identical **bulb**, and you see theirs the same way. Work out what each enemy piece is from how it moves,
**mark** your guesses (only you see them), and capture the king.

## Rules

- **Setup:** 60 seconds to place all 16 pieces anywhere on your two home ranks. If time runs out, your current
  arrangement is used.
- **Movement:** pieces move as in normal chess. A pawn may move two squares on its first move, from either home rank.
  There is no castling and no en passant.
- **No check.** Moving into danger is allowed. Capturing the enemy king wins.
- **Information:** captured pieces are revealed to both players. Promotions are hidden from the opponent. Every piece
  is revealed when the game ends.
- **Marking:** right-click (or long-press) an enemy bulb to mark it as a king, queen, rook, bishop, knight or pawn.
  The mark follows the piece as it moves.
- **Draws:** by agreement, when only kings are left, or when the side to move has no legal moves.
- **Time:** 10+0. Clocks start once both sides have moved. Each side has 30 seconds to make its first move, or the
  game is aborted.

## Ratings

Everyone starts at 1000. Ratings use standard Elo:

- K = 40 for your first 30 rated games, then K = 20.
- Changes are whole points, and a decisive result moves you at least 1 point.
- Before a rated game you see what you stand to gain or lose for a win, draw or loss.

Only matchmaking games are rated, and they require an account. Invite-link games are casual, and anyone can play them
without signing in.

## Layout

```
shared/   game rules, hidden-information views, Elo, message types (used by server and client)
server/   Fastify + WebSocket API, Postgres; deployed to Railway
client/   Vite + React app; deployed to GitHub Pages
```

## Local development

Requires Node 22. You need three terminals.

First, install dependencies:

```bash
npm install
```

Terminal 1, a local Postgres on port 5433 (no Docker needed; data lives in `server/.pgdata`):

```bash
npm run db:dev -w server
```

Terminal 2, the API on port 8080. Copy `server/.env.example` to `server/.env` first:

```bash
npm run dev -w server
```

Terminal 3, the app at http://localhost:5173/spy_chess/:

```bash
npm run dev -w client
```

To check everything, run the rules tests (`npm test`) and the end-to-end server checks (`npm run smoke -w server`, with
the server running).

Two tabs in one browser share a guest identity. To play yourself, sign one tab in to an account.

## Deploying

### 1. Server on Railway

1. In your Railway project, add a **Postgres** database.
2. Add a new service named `server` from this GitHub repository. Leave the root directory empty. The build and
   deploy settings (Dockerfile path, watch paths, health check) live in `.railway/railway.ts`. After `npm install`
   and `railway link`, apply them with `railway config apply`, and run `railway config plan` first to preview.
3. Set these variables on the service:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway's reference to the database)
   - `JWT_SECRET`: a long random string, e.g. the output of `openssl rand -hex 32`
   - `CLIENT_ORIGIN` = `https://anirudh-naveen.github.io` (origin only, no path; separate several with commas)
4. Under **Settings → Networking**, generate a public domain and copy the URL.
5. Check that `https://<your-domain>/health` returns `{"ok":true}`. Migrations run automatically on startup.

### 2. Client on GitHub Pages

1. In the GitHub repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions → Variables**, add `VITE_API_URL` with the Railway URL from above
   (e.g. `https://spy-chess-production.up.railway.app`).
3. Push to `main`, or run the **Deploy client to GitHub Pages** workflow by hand. The site is published at
   https://anirudh-naveen.github.io/spy_chess/.

Invite links look like `https://anirudh-naveen.github.io/spy_chess/#/g/<id>`.

## Credits

The piece set is "cburnett" by Colin M.L. Burnett, licensed
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The bulb pieces are original to this project.
