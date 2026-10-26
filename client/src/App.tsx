import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { pieceUrl } from './pieces';
import { AuthPage } from './pages/AuthPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { useSession } from './session';
import { socket, type SocketStatus } from './socket';

function Header() {
  const session = useSession();
  const [status, setStatus] = useState<SocketStatus>(socket.status);
  useEffect(() => socket.onStatus(setStatus), []);

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <img src={pieceUrl('w', 'bulb')} alt="" />
        Spy Chess
      </Link>
      <nav>
        <NavLink to="/" end>
          Play
        </NavLink>
        <NavLink to="/leaderboard">Leaderboard</NavLink>
      </nav>
      <div className="account">
        {status !== 'open' && <span className="conn">{status === 'connecting' ? 'Connecting…' : 'Offline'}</span>}
        {session.signedIn && session.user ? (
          <>
            <Link to={`/u/${session.user.name}`} className="account-name">
              {session.user.name} <span className="muted">{session.user.ratings?.standard.rating}</span>
            </Link>
            <button className="link-btn" onClick={session.signOut}>
              Sign out
            </button>
          </>
        ) : (
          <>
            {session.user?.guest && <span className="muted small">{session.user.name}</span>}
            <Link to="/login">Sign in</Link>
          </>
        )}
      </div>
    </header>
  );
}

export function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/g/:id" element={<GamePage />} />
          <Route path="/u/:name" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<div className="page narrow muted">Page not found.</div>} />
        </Routes>
      </main>
      <footer className="footer">
        Piece set “cburnett” by Colin M.L. Burnett, CC BY-SA 3.0.
      </footer>
    </>
  );
}
