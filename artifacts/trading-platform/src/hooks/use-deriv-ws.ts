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
}

export interface UseDerivWsReturn {
  ticks: Tick[];
  candles: Candle[];
  latestTick: Tick | null;
  isConnected: boolean;
  error: string | null;
}

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

// Deriv supports these granularities (in seconds) for ticks_history.
// Anything outside this set must be aggregated client-side or clamped.
const DERIV_GRANULARITIES = new Set([60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400]);

function clampGranularity(g: number): number {
  if (DERIV_GRANULARITIES.has(g)) return g;
  // Find the closest supported granularity ≤ g, fall back to 60
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

  const granularity = clampGranularity(granularitySec);

  const connect = useCallback(() => {
    if (!symbol) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    // Reset candles on (re)connect to avoid mixing timeframes
    setCandles([]);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);

      ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));

      ws.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 500,
        end: "latest",
        granularity,
        start: 1,
        style: "candles",
        subscribe: 1
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.error) {
        setError(data.error.message);
        return;
      }

      if (data.msg_type === "tick") {
        const tick: Tick = {
          epoch: data.tick.epoch,
          quote: data.tick.quote,
          id: data.tick.id
        };
        setLatestTick(tick);
        setTicks(prev => [...prev.slice(-99), tick]);
      } else if (data.msg_type === "candles") {
        const historyCandles: Candle[] = data.candles.map((c: any) => ({
          time: c.epoch,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        }));
        setCandles(historyCandles);
      } else if (data.msg_type === "ohlc") {
        const candle: Candle = {
          time: data.ohlc.open_time,
          open: parseFloat(data.ohlc.open),
          high: parseFloat(data.ohlc.high),
          low: parseFloat(data.ohlc.low),
          close: parseFloat(data.ohlc.close)
        };
        setCandles(prev => {
          const last = prev[prev.length - 1];
          if (last && last.time === candle.time) {
            return [...prev.slice(0, -1), candle];
          }
          return [...prev.slice(-499), candle];
        });
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setError("WebSocket error occurred");
    };
  }, [symbol, granularity]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { ticks, candles, latestTick, isConnected, error };
}

export const TIMEFRAME_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: "1m", seconds: 60 },
  { label: "2m", seconds: 120 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
  { label: "2h", seconds: 7200 },
  { label: "4h", seconds: 14400 },
  { label: "8h", seconds: 28800 },
  { label: "1d", seconds: 86400 },
];
