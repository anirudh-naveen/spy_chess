import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameMode } from '@spy/shared';
import { socket } from './socket';

interface Queue {
  searchingSince: number | null;
  /** Which mode's queue we're in while searching. */
  searchingMode: GameMode | null;
  error: string | null;
  join(mode: GameMode): void;
  leave(): void;
}

const Ctx = createContext<Queue | null>(null);

/** Rated matchmaking state, kept app-wide so searching survives page changes. */
export function QueueProvider({ children }: { children: ReactNode }) {
  const [since, setSince] = useState<number | null>(null);
  const [mode, setMode] = useState<GameMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(
    () =>
      socket.on((m) => {
        if (m.t === 'queue.status') {
          setSince(m.searching ? m.since : null);
          setMode(m.searching ? m.mode : null);
        }
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
      searchingMode: mode,
      error,
      join(m) {
        setError(null);
        setSince(Date.now());
        setMode(m);
        socket.send({ t: 'queue.join', mode: m });
      },
      leave() {
        setSince(null);
        socket.send({ t: 'queue.leave' });
      },
    }),
    [since, mode, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQueue(): Queue {
  const q = useContext(Ctx);
  if (!q) throw new Error('useQueue outside QueueProvider');
  return q;
}
