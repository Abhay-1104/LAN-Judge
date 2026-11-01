import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Same idea as useContestSocket, for quizzes — joins a quiz "room" instead
 * of a contest one. Kept as a separate hook (rather than a shared one with a
 * "type" param) so the working contest flow can never be affected by
 * changes made here.
 */
export function useQuizSocket(quizId, { onMessage } = {}) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!quizId) return undefined;

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
        ws.send(JSON.stringify({ type: 'join_quiz', quizId }));
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
  }, [quizId]);

  const send = useCallback((payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { connected, send };
}
