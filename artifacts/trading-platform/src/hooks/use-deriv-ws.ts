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

export function useDerivWs(symbol: string): UseDerivWsReturn {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestTick, setLatestTick] = useState<Tick | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (!symbol) return;
    
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      
      // Subscribe to ticks
      ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      
      // Fetch candle history
      ws.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 100,
        end: "latest",
        granularity: 60,
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
      } else if (data.msg_type === "history") {
        const historyCandles: Candle[] = data.history.times.map((time: number, i: number) => ({
          time,
          open: data.history.prices[i],
          high: data.history.prices[i],
          low: data.history.prices[i],
          close: data.history.prices[i],
        }));
        // Note: The history API might not return true OHLC for ticks_history without style: candles
        // but we requested style: 'candles' so we should handle 'candles' msg_type
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
          return [...prev.slice(-99), candle];
        });
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect logic
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setError("WebSocket error occurred");
    };
  }, [symbol]);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        // Unsubscribe if needed, or just close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { ticks, candles, latestTick, isConnected, error };
}
