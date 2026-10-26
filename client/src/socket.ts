import type { ClientMsg, ServerMsg } from '@spy/shared';
import { WS_URL } from './api';

type Listener = (msg: ServerMsg) => void;
export type SocketStatus = 'connecting' | 'open' | 'closed';

/**
 * One WebSocket for the whole app. Reconnects with backoff, re-sends "hello"
 * and re-joins any games being watched, so pages don't have to care.
 */
class Socket {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: SocketStatus) => void>();
  private watching = new Set<string>();
  private outbox: ClientMsg[] = [];
  private ready = false;
  private retry = 0;
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  status: SocketStatus = 'closed';

  /** (Re)connects with the given token. Passing the same token is a no-op. */
  connect(token: string | null) {
    if (this.ws && token === this.token) return;
    this.token = token;
    this.close();
    this.open();
  }

  private open() {
    this.setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      if (this.token) ws.send(JSON.stringify({ t: 'hello', token: this.token }));
      else this.onReady();
      this.pingTimer = window.setInterval(() => this.raw({ t: 'ping' }), 25000);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMsg;
      if (msg.t === 'hello.ok') this.onReady();
      if (msg.t === 'error' && !this.ready && /Session expired|Account not found/.test(msg.message)) {
        // Bad token: continue as an anonymous viewer so pages still load.
        this.onReady();
      }
      this.listeners.forEach((l) => l(msg));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.cleanup();
      this.setStatus('closed');
      const delay = Math.min(10000, 500 * 2 ** this.retry++);
      this.retryTimer = window.setTimeout(() => this.open(), delay);
    };
  }

  private onReady() {
    this.ready = true;
    this.setStatus('open');
    for (const id of this.watching) this.raw({ t: 'game.join', id });
    const pending = this.outbox.splice(0);
    pending.forEach((m) => this.raw(m));
  }

  private cleanup() {
    this.ready = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private close() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.cleanup();
    ws?.close();
  }

  private raw(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  send(msg: ClientMsg) {
    if (this.ready) this.raw(msg);
    else if (msg.t !== 'game.join') this.outbox.push(msg);
  }

  watch(id: string) {
    this.watching.add(id);
    if (this.ready) this.raw({ t: 'game.join', id });
  }

  unwatch(id: string) {
    this.watching.delete(id);
    // A connection that isn't ready yet isn't watching anything; queuing a leave would
    // land after the re-join on connect and silently stop updates.
    if (this.ready) this.raw({ t: 'game.leave', id });
  }

  on(l: Listener) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }

  onStatus(l: (s: SocketStatus) => void) {
    this.statusListeners.add(l);
    return () => void this.statusListeners.delete(l);
  }

  private setStatus(s: SocketStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }
}

export const socket = new Socket();
