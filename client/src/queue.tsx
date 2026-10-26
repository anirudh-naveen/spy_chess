import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from './socket';

interface Queue {
  searchingSince: number | null;
  error: string | null;
  join(): void;
  leave(): void;
}

const Ctx = createContext<Queue | null>(null);

/** Rated matchmaking state, kept app-wide so searching survives page changes. */
export function QueueProvider({ children }: { children: ReactNode }) {
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(
    () =>
      socket.on((m) => {
        if (m.t === 'queue.status') setSince(m.searching ? m.since : null);
        if (m.t === 'match.found') {
          setSince(null);
          navigate(`/g/${m.id}`);
        }
        if (m.t === 'error' && /rated|Sign in/.test(m.message)) {
          setError(m.message);
          setSince(null);
        }
      }),
    [navigate],
  );

  const value = useMemo<Queue>(
    () => ({
      searchingSince: since,
      error,
      join() {
        setError(null);
        setSince(Date.now());
        socket.send({ t: 'queue.join' });
      },
      leave() {
        setSince(null);
        socket.send({ t: 'queue.leave' });
      },
    }),
    [since, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQueue(): Queue {
  const q = useContext(Ctx);
  if (!q) throw new Error('useQueue outside QueueProvider');
  return q;
}
