export interface DerivHistoricalCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Fetches historical candles from Deriv public WS api as a Promise.
 * @param symbol The asset symbol (e.g., R_100)
 * @param granularity The timeframe in seconds (e.g., 60, 300, 900, 86400)
 * @param count The number of candles to fetch
 */
export function fetchHistoricalCandles(
  symbol: string,
  granularity: number,
  count: number = 50
): Promise<DerivHistoricalCandle[]> {
  return new Promise((resolve, reject) => {
    // 1089 is the public app_id for Deriv WS
    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout fetching historical candles"));
    }, 10000); // 10 seconds timeout

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: count,
          end: "latest",
          granularity: granularity,
          start: 1,
          style: "candles",
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(data.error.message));
          return;
        }

        if (data.msg_type === "history" || data.msg_type === "candles") {
          clearTimeout(timeout);
          ws.close();
          const candles = data.candles || data.history?.candles || [];
          // Format them the same way as standard candles
          const formatted = candles.map((c: any) => ({
            time: c.epoch,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));
          resolve(formatted);
        }
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        reject(err);
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      ws.close();
      reject(err);
    };
  });
}
