import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicUser } from '@spy/shared';
import { api, type AuthResponse } from './api';
import { socket } from './socket';

const USER_KEY = 'spy.token';
const GUEST_KEY = 'spy.guest';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: session lasts for this tab only */
  }
}

interface Session {
  /** Signed-in account, or the guest identity once one exists. */
  user: PublicUser | null;
  signedIn: boolean;
  loading: boolean;
  signIn(res: AuthResponse): void;
  signOut(): void;
  /** Returns a token usable for invite games, creating a guest identity if needed. */
  ensureToken(): Promise<string>;
  refresh(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userToken, setUserToken] = useState(() => read(USER_KEY));
  const [guestToken, setGuestToken] = useState(() => read(GUEST_KEY));
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const token = userToken ?? guestToken;

  useEffect(() => {
    socket.connect(token);
  }, [token]);

  // hello.ok carries the freshest identity (and rating) for whoever is connected.
  useEffect(
    () =>
      socket.on((m) => {
        if (m.t === 'hello.ok') setUser(m.user);
      }),
    [],
  );

  const refresh = useCallback(async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const r = await api<{ user: PublicUser }>('/me', { token });
      setUser(r.user);
    } catch {
      if (userToken) {
        write(USER_KEY, null);
        setUserToken(null);
      } else {
        write(GUEST_KEY, null);
        setGuestToken(null);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token, userToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<Session>(
    () => ({
      user,
      signedIn: !!userToken && !!user && !user.guest,
      loading,
      signIn(res) {
        // Reconnect right away so anything sent next (e.g. joining the queue) goes out as this user.
        socket.connect(res.token);
        write(USER_KEY, res.token);
        setUserToken(res.token);
        setUser(res.user);
      },
      signOut() {
        socket.connect(guestToken);
        write(USER_KEY, null);
        setUserToken(null);
        setUser(null);
      },
      async ensureToken() {
        if (token) return token;
        const res = await api<AuthResponse>('/auth/guest', { body: {} });
        write(GUEST_KEY, res.token);
        setGuestToken(res.token);
        setUser(res.user);
        return res.token;
      },
      refresh,
    }),
    [user, userToken, guestToken, token, loading, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
