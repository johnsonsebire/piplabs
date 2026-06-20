import { useState, useEffect, useRef, useCallback } from "react";

export interface Tick {
  epoch: number;
  quote: number;
  id?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface UseDerivWsReturn {
  ticks: Tick[];
  candles: Candle[];
  latestTick: Tick | null;
  isConnected: boolean;
  error: string | null;
}

// Deriv public WebSocket for market data (ticks, candles) — no auth needed.
// app_id 1089 is Deriv's official public app_id for unauthenticated WS access.
const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

// Deriv supports these granularities (in seconds) for ticks_history.
// 1200 (20m) and 10800 (3h) are accepted by the API even though undocumented.
const DERIV_GRANULARITIES = new Set([60, 120, 180, 300, 600, 900, 1200, 1800, 3600, 7200, 10800, 14400, 28800, 86400]);

function clampGranularity(g: number): number {
  if (DERIV_GRANULARITIES.has(g)) return g;
  const supported = Array.from(DERIV_GRANULARITIES).sort((a, b) => a - b);
  let best = 60;
  for (const s of supported) if (s <= g) best = s;
  return best;
}

export function useDerivWs(symbol: string, granularitySec: number = 60): UseDerivWsReturn {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestTick, setLatestTick] = useState<Tick | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Track latest symbol/granularity without triggering reconnects
  const symbolRef = useRef(symbol);
  const granularityRef = useRef(clampGranularity(granularitySec));
  const connectRef = useRef<() => void>(() => {});

  // Send fresh subscriptions on an already-open socket (no reconnect needed)
  const resubscribe = useCallback((ws: WebSocket, sym: string, gran: number) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    setCandles([]);
    setTicks([]);
    setLatestTick(null);
    ws.send(JSON.stringify({ forget_all: "ticks" }));
    ws.send(JSON.stringify({ forget_all: "candles" }));
    ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
    ws.send(JSON.stringify({
      ticks_history: sym,
      adjust_start_time: 1,
      count: 1000,
      end: "latest",
      granularity: gran,
      start: 1,
      style: "candles",
      subscribe: 1,
    }));
  }, []);

  // Stable connection lifecycle — only runs once on mount
  useEffect(() => {
    function connect() {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        resubscribe(ws, symbolRef.current, granularityRef.current);
      };

      ws.onmessage = (event) => {
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.error) {
          // Ignore "AlreadySubscribed" — harmless race during resubscription
          if (data.error?.code !== "AlreadySubscribed") {
            setError(data.error.message);
          }
          return;
        }

        if (data.msg_type === "tick") {
          const tick: Tick = { epoch: data.tick.epoch, quote: data.tick.quote, id: data.tick.id };
          setLatestTick(tick);
          setTicks(prev => [...prev.slice(-99), tick]);
        } else if (data.msg_type === "candles") {
          const historyCandles: Candle[] = data.candles.map((c: any) => ({
            time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close,
          }));
          setCandles(historyCandles);
        } else if (data.msg_type === "ohlc") {
          const candle: Candle = {
            time: data.ohlc.open_time,
            open: parseFloat(data.ohlc.open),
            high: parseFloat(data.ohlc.high),
            low: parseFloat(data.ohlc.low),
            close: parseFloat(data.ohlc.close),
          };
          setCandles(prev => {
            const last = prev[prev.length - 1];
            if (last && last.time === candle.time) return [...prev.slice(0, -1), candle];
            return [...prev.slice(-499), candle];
          });
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), 3000);
      };

      ws.onerror = () => {
        setError("WebSocket error occurred");
      };
    }

    connectRef.current = connect;
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [resubscribe]);

  // When symbol or granularity changes: resubscribe on the existing socket,
  // no reconnect needed — eliminates the disconnect flicker.
  useEffect(() => {
    const gran = clampGranularity(granularitySec);
    symbolRef.current = symbol;
    granularityRef.current = gran;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      resubscribe(wsRef.current, symbol, gran);
    }
  }, [symbol, granularitySec, resubscribe]);

  return { ticks, candles, latestTick, isConnected, error };
}

export const TIMEFRAME_OPTIONS: ReadonlyArray<{ label: string; seconds: number; group: "MINUTES" | "HOURS" | "DAYS" }> = [
  // Minutes
  { label: "M1",  seconds: 60,      group: "MINUTES" },
  { label: "M2",  seconds: 120,     group: "MINUTES" },
  { label: "M3",  seconds: 180,     group: "MINUTES" },
  { label: "M4",  seconds: 240,     group: "MINUTES" },
  { label: "M5",  seconds: 300,     group: "MINUTES" },
  { label: "M6",  seconds: 360,     group: "MINUTES" },
  { label: "M10", seconds: 600,     group: "MINUTES" },
  { label: "M12", seconds: 720,     group: "MINUTES" },
  { label: "M15", seconds: 900,     group: "MINUTES" },
  { label: "M20", seconds: 1200,    group: "MINUTES" },
  { label: "M30", seconds: 1800,    group: "MINUTES" },
  // Hours
  { label: "H1",  seconds: 3600,    group: "HOURS" },
  { label: "H2",  seconds: 7200,    group: "HOURS" },
  { label: "H3",  seconds: 10800,   group: "HOURS" },
  { label: "H4",  seconds: 14400,   group: "HOURS" },
  { label: "H6",  seconds: 21600,   group: "HOURS" },
  { label: "H8",  seconds: 28800,   group: "HOURS" },
  { label: "H12", seconds: 43200,   group: "HOURS" },
  // Days
  { label: "D1",  seconds: 86400,   group: "DAYS" },
  { label: "W1",  seconds: 604800,  group: "DAYS" },
  { label: "MN",  seconds: 2592000, group: "DAYS" },
];

