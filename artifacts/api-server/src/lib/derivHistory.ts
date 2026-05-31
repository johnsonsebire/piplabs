import WebSocket from "ws";
import { DERIV_PUBLIC_WS } from "./derivApi";

export type HistCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const SUPPORTED_GRANULARITIES = [60, 120, 180, 300, 600, 900, 1200, 1800, 3600, 7200, 10800, 14400, 28800, 86400] as const;

export function clampGranularity(seconds: number): number {
  if (SUPPORTED_GRANULARITIES.includes(seconds as (typeof SUPPORTED_GRANULARITIES)[number])) {
    return seconds;
  }
  let best = 60;
  for (const g of SUPPORTED_GRANULARITIES) {
    if (g <= seconds) best = g;
  }
  return best;
}

function fetchCandleBatch(
  symbol: string,
  endSec: number | "latest",
  granularity: number,
  count: number,
): Promise<HistCandle[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_PUBLIC_WS);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      safeClose(ws);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Deriv market history timed out for ${symbol}`)));
    }, 45_000);

    ws.on("open", () => {
      // Deriv's ticks_history accepts EITHER `count` (paginated backwards from `end`)
      // OR `start` + `end`. Using `count` + `end` is the most reliable mode for
      // long ranges. `end` can be a UNIX epoch OR the literal string "latest".
      // We use "latest" for the first page (avoids "end in future" errors) and
      // explicit epochs for subsequent pages.
      const payload: Record<string, unknown> = {
        ticks_history: symbol,
        adjust_start_time: 1,
        count: Math.min(Math.max(count, 1), 5000),
        end: endSec,
        granularity,
        style: "candles",
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on("message", (raw: Buffer) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const err = data.error as { message?: string; code?: string } | undefined;
      if (err) {
        const code = err.code ? ` [${err.code}]` : "";
        finish(() => reject(new Error(`${err.message ?? "Deriv ticks_history error"}${code}`)));
        return;
      }

      if (data.msg_type === "candles" && Array.isArray(data.candles)) {
        const candles = (data.candles as Array<Record<string, unknown>>).map((c) => ({
          time: Number(c.epoch),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        })).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close));

        finish(() => resolve(candles));
      }
    });

    ws.on("error", (e: Error) => {
      finish(() => reject(new Error(`Deriv WebSocket error: ${e.message}`)));
    });

    ws.on("close", () => {
      finish(() => reject(new Error("Deriv WebSocket closed before history response")));
    });
  });
}


function safeClose(ws: WebSocket): void {
  try {
    ws.removeAllListeners();
  } catch {
    /* noop */
  }
  try {
    ws.close();
  } catch {
    /* noop */
  }
  try {
    ws.terminate();
  } catch {
    /* noop */
  }
}

/**
 * Fetches OHLC candles from Deriv public WebSocket API (ticks_history, style=candles).
 *
 * Strategy: page backwards from `toSec` using `count`+`end` (no `start`), which is
 * the most reliable mode and never trips Deriv's "Sorry, an error occurred..."
 * response that you get when the `start`+`end` window is too wide.
 *
 * We compute how many candles we expect in the full range and cap pages
 * accordingly so we don't over-fetch.
 */
export async function fetchDerivCandles(
  symbol: string,
  fromSec: number,
  toSec: number,
  granularitySec = 60,
): Promise<HistCandle[]> {
  if (toSec <= fromSec) {
    throw new Error("Backtest date range is invalid (end must be after start)");
  }

  const granularity = clampGranularity(granularitySec);
  // Deriv rejects requests where `end` is in the future. The UI date picker
  // gives us a midnight-UTC date that often is "later today" — clamp it to
  // a few minutes ago so we are guaranteed in the past.
  const nowSec = Math.floor(Date.now() / 1000) - 60;
  const safeToSec = Math.min(toSec, nowSec);

  if (safeToSec <= fromSec) {
    throw new Error(
      `Backtest 'to' date (${new Date(toSec * 1000).toISOString()}) is too close to now ` +
      "for the requested range. Pick an earlier start date or wait for more history to accumulate.",
    );
  }

  const expectedCandles = Math.ceil((safeToSec - fromSec) / granularity);
  const PAGE_SIZE = 5000;
  // +1 page of slack so we definitely reach the start of the window.
  const maxPages = Math.min(Math.ceil(expectedCandles / PAGE_SIZE) + 1, 50);

  const byTime = new Map<number, HistCandle>();
  // For the first page use the literal "latest" so Deriv anchors to current
  // server time (avoids any "end in future" / mismatched epoch errors). For
  // subsequent pages we use explicit epochs to walk backwards.
  let endParam: number | "latest" = "latest";
  let lastError: Error | null = null;

  for (let page = 0; page < maxPages; page++) {
    let batch: HistCandle[];
    try {
      batch = await fetchCandleBatch(symbol, endParam, granularity, PAGE_SIZE);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // If the very first page fails, abort. If a later page fails we keep
      // whatever we already collected.
      if (page === 0) throw lastError;
      break;
    }
    if (batch.length === 0) break;

    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const c of batch) {
      if (c.time >= fromSec && c.time <= safeToSec) {
        byTime.set(c.time, c);
      }
      if (c.time < oldestSeen) oldestSeen = c.time;
    }

    // Stop if we've reached (or gone past) the start of the requested window
    // or if Deriv returned fewer than a full page (no more history left).
    if (oldestSeen <= fromSec || batch.length < PAGE_SIZE) break;

    // Continue paginating: step `end` back to just before the oldest candle.
    endParam = oldestSeen - granularity;
    if ((endParam as number) <= fromSec) break;
  }

  const candles = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (candles.length < 10) {
    const tail = lastError ? ` Last Deriv error: ${lastError.message}` : "";
    throw new Error(
      `Insufficient Deriv history for ${symbol} (${candles.length} candles).` +
      ` Try a shorter date range, a different granularity, or a symbol like R_100, R_75, frxEURUSD.${tail}`,
    );
  }

  return candles;
}

export function pickBacktestGranularity(durationUnit: string): number {
  switch (durationUnit) {
    case "t":
      return 60;
    case "s":
      return 60;
    case "m":
      return 60;
    case "h":
      return 300;
    case "d":
      return 3600;
    default:
      return 60;
  }
}
