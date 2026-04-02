"use client";

import { useEffect, useRef, useCallback } from "react";
import type { WsServerMessage } from "@rush/shared";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3000";

export function useMarketFeed(
  address: string | undefined,
  onMessage: (msg: WsServerMessage) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptRef = useRef(0);

  const connect = useCallback(() => {
    if (!address) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(`${WS_BASE}/ws/${address}`);

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        onMessageRef.current(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30_000);
      reconnectAttemptRef.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [address]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
