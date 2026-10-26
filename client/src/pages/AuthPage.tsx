import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, type AuthResponse } from '../api';
import { useQueue } from '../queue';
import { useSession } from '../session';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const session = useSession();
  const queue = useQueue();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const suffix = next ? `?next=${next}` : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthResponse>(mode === 'login' ? '/auth/login' : '/auth/signup', {
        body: mode === 'login' ? { login: username, password } : { username, email, password },
      });
      session.signIn(res);
      navigate('/');
      // The socket reconnects as the new user; joining is queued until it's ready.
      if (next === 'play') queue.join();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow auth">
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <form onSubmit={submit} className="form">
        <label>
          <span className="label">{mode === 'login' ? 'Username or email' : 'Username'}</span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={mode === 'login' ? 200 : 20}
          />
        </label>
        {mode === 'signup' && (
          <label>
            <span className="label">Email</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        )}
        <label>
          <span className="label">Password</span>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'signup' ? 8 : undefined}
          />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button className="btn primary wide" disabled={busy}>
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="muted small">
        {mode === 'login' ? (
          <>
            New here? <Link to={`/signup${suffix}`}>Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link to={`/login${suffix}`}>Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
