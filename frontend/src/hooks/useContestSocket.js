import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Connects to the backend's WebSocket endpoint, authenticates with the same
 * JWT used for REST calls, and joins a contest "room" for live updates
 * (violation events, activity pings, instant contest start/stop).
 *
 * Used by both students (to send activity/violations) and admins (to
 * receive the live monitor feed) — the server routes messages based on role.
 */
export function useContestSocket(contestId, { onMessage } = {}) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!contestId) return undefined;

    const token = localStorage.getItem('lj_token');
    if (!token) return undefined;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'auth_ok') {
        ws.send(JSON.stringify({ type: 'join_contest', contestId }));
        setConnected(true);
        return;
      }
      onMessageRef.current?.(msg);
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [contestId]);

  const send = useCallback((payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { connected, send };
}
