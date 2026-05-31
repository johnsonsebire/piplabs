import type { HistCandle } from "./derivHistory";

export type StrategyCondition = {
  indicatorA: string;
  operator: string;
  indicatorB: string;
};

export type StrategyLeg = {
  enabled: boolean;
  logic: "AND" | "OR";
  conditions: StrategyCondition[];
};

export type TradingSession = "asian" | "london" | "newyork" | "overlap_london_ny";

export type BacktestRunParams = {
  tradeType: string;
  duration: number;
  durationUnit: string;
  stakePerTrade: number;
  initialBalance: number;
  /**
   * Optional list of UTC trading sessions to restrict trade entries to.
   * If undefined or empty, all sessions are allowed.
   *
   * Session hours (UTC):
   *   asian:            00:00 – 09:00
   *   london:           08:00 – 17:00
   *   newyork:          13:00 – 22:00
   *   overlap_london_ny: 13:00 – 17:00
   */
  sessions?: TradingSession[];
};

const SESSION_HOURS_UTC: Record<TradingSession, { start: number; end: number }> = {
  asian: { start: 0, end: 9 },
  london: { start: 8, end: 17 },
  newyork: { start: 13, end: 22 },
  overlap_london_ny: { start: 13, end: 17 },
};

/**
 * Returns true if the candle's UTC hour falls inside ANY of the requested sessions.
 * If no sessions are specified, returns true (no filter).
 */
export function isWithinSessions(epochSec: number, sessions?: TradingSession[]): boolean {
  if (!sessions || sessions.length === 0) return true;
  const utcHour = new Date(epochSec * 1000).getUTCHours();
  return sessions.some((s) => {
    const { start, end } = SESSION_HOURS_UTC[s];
    return utcHour >= start && utcHour < end;
  });
}


export type SimTrade = {
  id: number;
  entryAt: string;
  exitAt: string;
  direction: "CALL" | "PUT";
  type: string;
  duration: string;
  entry: number;
  exit: number;
  stake: number;
  pnl: number;
  outcome: "win" | "loss";
};

export type BacktestRunResult = {
  wins: number;
  losses: number;
  tradeType: string;
  duration: number;
  durationUnit: string;
  trades: SimTrade[];
  dataSource: "deriv_ws_ticks_history";
  candleCount: number;
  granularitySec: number;
  sessions?: TradingSession[];
  seriesMap: SeriesMap;
};


// ─── Strategy parsing (mirrors trading-platform strategies page) ───────────

export function parseStrategyLegs(rawCode: string | null | undefined): { buy: StrategyLeg; sell: StrategyLeg } {
  const empty: StrategyLeg = { enabled: false, logic: "AND", conditions: [] };
  if (!rawCode) return { buy: empty, sell: empty };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawCode) as Record<string, unknown>;
  } catch {
    return { buy: empty, sell: empty };
  }

  const toLeg = (src: unknown): StrategyLeg => {
    if (!src || typeof src !== "object") return empty;
    const s = src as Record<string, unknown>;
    const conditions = Array.isArray(s.conditions)
      ? s.conditions.map((c) => {
          const row = c as Record<string, unknown>;
          return {
            indicatorA: String(row.indicatorA ?? ""),
            operator: String(row.operator ?? ""),
            indicatorB: String(row.indicatorB ?? ""),
          };
        })
      : [];
    return {
      enabled: s.enabled !== false,
      logic: s.logic === "OR" ? "OR" : "AND",
      conditions,
    };
  };

  if (parsed.buy || parsed.sell) {
    return {
      buy: parsed.buy ? toLeg(parsed.buy) : empty,
      sell: parsed.sell ? toLeg(parsed.sell) : empty,
    };
  }

  if (Array.isArray(parsed.conditions)) {
    const leg = toLeg(parsed);
    const action = typeof parsed.action === "string" ? parsed.action.toLowerCase() : "";
    return action === "sell" ? { buy: empty, sell: leg } : { buy: leg, sell: empty };
  }

  return { buy: empty, sell: empty };
}

export function enabledDirections(legs: { buy: StrategyLeg; sell: StrategyLeg }): Array<"buy" | "sell"> {
  const out: Array<"buy" | "sell"> = [];
  if (legs.buy.enabled && legs.buy.conditions.length > 0) out.push("buy");
  if (legs.sell.enabled && legs.sell.conditions.length > 0) out.push("sell");
  return out;
}

// ─── Indicator series ────────────────────────────────────────────────────────

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seed += values[i];
      out.push(null);
    } else if (i === period - 1) {
      seed += values[i];
      prev = seed / period;
      out.push(prev);
    } else {
      prev = values[i] * k + (prev as number) * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

function rsi(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function cci(candles: HistCandle[], period: number): (number | null)[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += tp[i - j];
    const mean = sum / period;
    let md = 0;
    for (let j = 0; j < period; j++) md += Math.abs(tp[i - j] - mean);
    md /= period;
    out[i] = md === 0 ? 0 : (tp[i] - mean) / (0.015 * md);
  }
  return out;
}

export type SeriesMap = Map<string, (number | null)[]>;

// Default periods used when an indicator is specified without a period (e.g. "RSI", "CCI")
const DEFAULT_PERIODS: Record<string, number> = {
  RSI: 14, CCI: 20, ATR: 14, MACD: 12, STOCH_K: 14, STOCH_D: 3,
  BB_UPPER: 20, BB_LOWER: 20, BB_MIDDLE: 20, MACD_SIGNAL: 9,
};

/**
 * Resolves a strategy indicator reference string into a canonical map key and period.
 * Handles both parameterised ("EMA(14)") and bare ("RSI", "CCI") forms.
 */
function resolveRef(ref: string): { key: string; kind: string; period: number } | null {
  const r = ref.trim().toUpperCase();

  // Parameterised: EMA(14), SMA(20), RSI(14), CCI(20), WMA(5)
  const mParam = r.match(/^(EMA|SMA|WMA|RSI|CCI|ATR)\((\d+)\)$/);
  if (mParam) {
    const kind = mParam[1];
    const period = parseInt(mParam[2], 10);
    return { key: `${kind}_${period}`, kind, period };
  }

  // Bare names with defaults: RSI, CCI, ATR, BB_UPPER, BB_LOWER, BB_MIDDLE, MACD, MACD_SIGNAL, STOCH_K, STOCH_D
  if (r in DEFAULT_PERIODS) {
    return { key: r, kind: r, period: DEFAULT_PERIODS[r] };
  }

  return null;
}

function collectRefs(legs: { buy: StrategyLeg; sell: StrategyLeg }): Set<string> {
  const refs = new Set<string>();
  for (const leg of [legs.buy, legs.sell]) {
    for (const c of leg.conditions) {
      refs.add(c.indicatorA.trim());
      refs.add(c.indicatorB.trim());
    }
  }
  return refs;
}

/** A user-configured indicator from the DB */
export type UserIndicator = {
  name: string;
  code: string; // e.g. "MA", "RSI"
  parameters: string | null; // JSON string with period, subtype etc.
};

/** Parse a user indicator's parameters JSON into a config usable for series computation */
function parseUserIndicatorParams(ind: UserIndicator): Record<string, any> {
  try {
    return JSON.parse(ind.parameters || "{}");
  } catch {
    return {};
  }
}

export function buildSeries(
  candles: HistCandle[],
  legs: { buy: StrategyLeg; sell: StrategyLeg },
  userIndicators: UserIndicator[] = [],
): SeriesMap {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const opens = candles.map((c) => c.open);

  const map: SeriesMap = new Map([
    ["CLOSE", closes],
    ["PRICE", closes],
    ["OPEN", opens],
    ["HIGH", highs],
    ["LOW", lows],
  ]);

  // Build a lookup of user indicator name → indicator object (case-insensitive)
  const userIndMap = new Map<string, UserIndicator>();
  for (const ind of userIndicators) {
    userIndMap.set(ind.name.trim().toLowerCase(), ind);
  }

  for (const ref of collectRefs(legs)) {
    if (!ref || map.has(ref)) continue;

    // Extract base name if it has a suffix (e.g. "Stochastic_K" -> "Stochastic")
    let baseRef = ref;
    const suffixes = ["_K", "_D", "_SIGNAL", "_UPPER", "_LOWER", "_MIDDLE"];
    for (const s of suffixes) {
      if (ref.toUpperCase().endsWith(s)) {
        baseRef = ref.slice(0, -s.length);
        break;
      }
    }

    // 1. Try to resolve as a user-configured indicator by baseRef name
    const userInd = userIndMap.get(baseRef.trim().toLowerCase());
    if (userInd) {
      const p = parseUserIndicatorParams(userInd);
      const kind = (p.type || userInd.code || "").toUpperCase();
      const period = p.period || 14;
      const key = baseRef; // use the base indicator name as the map key

      if (kind === "MA" || kind === "EMA" || kind === "SMA") {
        const sub = (p.subtype || "EMA").toUpperCase();
        if (sub === "SMA") map.set(key, sma(closes, period));
        else map.set(key, ema(closes, period));
      } else if (kind === "RSI") {
        map.set(key, rsi(closes, period));
      } else if (kind === "CCI") {
        map.set(key, cci(candles, period));
      } else if (kind === "BB") {
        const dev = p.deviations || 2;
        const mid = sma(closes, period);
        const sdArr = closes.map((_, i) => {
          if (i < period - 1) return null;
          let s = 0; for (let j = 0; j < period; j++) s += closes[i - j];
          const m2 = s / period;
          let sq = 0; for (let j = 0; j < period; j++) sq += (closes[i - j] - m2) ** 2;
          return Math.sqrt(sq / period);
        });
        map.set(key + "_MIDDLE", mid);
        map.set(key + "_UPPER", mid.map((v, i) => (v == null || sdArr[i] == null ? null : v + dev * (sdArr[i] as number))));
        map.set(key + "_LOWER", mid.map((v, i) => (v == null || sdArr[i] == null ? null : v - dev * (sdArr[i] as number))));
        map.set(key, mid); // default = middle
      } else if (kind === "MACD") {
        const fast = p.fast || 12, slow = p.slow || 26, signal = p.signal || 9;
        const fastEma = ema(closes, fast);
        const slowEma = ema(closes, slow);
        const macdLine = fastEma.map((f, i) => (f == null || slowEma[i] == null ? null : f - (slowEma[i] as number)));
        map.set(key, macdLine);
        
        // Build signal EMA only over the valid (non-null) MACD region, then map back
        const firstValid = macdLine.findIndex(v => v != null);
        const sigArr: (number | null)[] = new Array(macdLine.length).fill(null);
        if (firstValid >= 0) {
          const validVals = macdLine.slice(firstValid).map(v => v as number);
          const sigVals = ema(validVals, signal);
          for (let i = 0; i < sigVals.length; i++) {
            sigArr[firstValid + i] = sigVals[i];
          }
        }
        map.set(key + "_SIGNAL", sigArr);
      } else if (kind === "STOCH") {
        const kP = p.kPeriod || 14, dP = p.dPeriod || 3;
        const kArr: (number | null)[] = candles.map((_, i) => {
          if (i < kP - 1) return null;
          const slice = candles.slice(i - kP + 1, i + 1);
          const high = Math.max(...slice.map(c => c.high));
          const low = Math.min(...slice.map(c => c.low));
          return high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100;
        });
        map.set(key + "_K", kArr);
        
        // Compute %D only over the valid %K region
        const firstValidK = kArr.findIndex(v => v != null);
        const dArr: (number | null)[] = new Array(kArr.length).fill(null);
        if (firstValidK >= 0) {
          const valid = kArr.slice(firstValidK).map(v => v as number);
          const dVals = sma(valid, dP);
          for (let i = 0; i < dVals.length; i++) {
            dArr[firstValidK + i] = dVals[i];
          }
        }
        map.set(key + "_D", dArr);
        map.set(key, kArr); // default = %K
      }
      continue; // done for this ref
    }

    // 2. Fall back to built-in resolveRef (handles EMA(14), RSI, CCI etc.)
    const resolved = resolveRef(ref);
    if (!resolved || map.has(resolved.key)) continue;
    const { key, kind, period } = resolved;

    if (kind === "EMA") map.set(key, ema(closes, period));
    else if (kind === "SMA") map.set(key, sma(closes, period));
    else if (kind === "WMA") map.set(key, sma(closes, period));
    else if (kind === "RSI") map.set(key, rsi(closes, period));
    else if (kind === "CCI") map.set(key, cci(candles, period));
    else if (kind === "BB_UPPER" || kind === "BB_LOWER" || kind === "BB_MIDDLE") {
      const mid = sma(closes, 20);
      if (!map.has("BB_MIDDLE")) map.set("BB_MIDDLE", mid);
      if (!map.has("BB_UPPER") || !map.has("BB_LOWER")) {
        const sdArr = closes.map((_, i) => {
          if (i < 19) return null;
          let s = 0; for (let j = 0; j < 20; j++) s += closes[i - j];
          const m2 = s / 20; let sq = 0;
          for (let j = 0; j < 20; j++) sq += (closes[i - j] - m2) ** 2;
          return Math.sqrt(sq / 20);
        });
        map.set("BB_UPPER", mid.map((v, i) => (v == null || sdArr[i] == null ? null : v + 2 * (sdArr[i] as number))));
        map.set("BB_LOWER", mid.map((v, i) => (v == null || sdArr[i] == null ? null : v - 2 * (sdArr[i] as number))));
      }
    } else if (kind === "MACD" || kind === "MACD_SIGNAL") {
      if (!map.has("MACD") && !map.has("MACD_SIGNAL")) {
        const fast = ema(closes, 12), slow = ema(closes, 26);
        const macdLine = fast.map((f, i) => (f == null || slow[i] == null ? null : f - (slow[i] as number)));
        map.set("MACD", macdLine);
        
        // Build signal EMA only over the valid (non-null) MACD region, then map back
        const firstValid = macdLine.findIndex(v => v != null);
        const sigArr: (number | null)[] = new Array(macdLine.length).fill(null);
        if (firstValid >= 0) {
          const validVals = macdLine.slice(firstValid).map(v => v as number);
          const sigVals = ema(validVals, 9);
          for (let i = 0; i < sigVals.length; i++) {
            sigArr[firstValid + i] = sigVals[i];
          }
        }
        map.set("MACD_SIGNAL", sigArr);
      }
    } else if (kind === "STOCH_K" || kind === "STOCH_D") {
      if (!map.has("STOCH_K") && !map.has("STOCH_D")) {
        const kArr: (number | null)[] = candles.map((_, i) => {
          if (i < 13) return null;
          const slice = candles.slice(i - 13, i + 1);
          const high = Math.max(...slice.map(c => c.high)), low = Math.min(...slice.map(c => c.low));
          return high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100;
        });
        map.set("STOCH_K", kArr);
        
        // Compute %D only over the valid %K region
        const firstValidK = kArr.findIndex(v => v != null);
        const dArr: (number | null)[] = new Array(kArr.length).fill(null);
        if (firstValidK >= 0) {
          const valid = kArr.slice(firstValidK).map(v => v as number);
          const dVals = sma(valid, 3);
          for (let i = 0; i < dVals.length; i++) {
            dArr[firstValidK + i] = dVals[i];
          }
        }
        map.set("STOCH_D", dArr);
      }
    }
  }

  return map;
}

function seriesValue(ref: string, i: number, map: SeriesMap, closes: number[]): number | null {
  const r = ref.trim();
  const numeric = Number(r);
  if (r !== "" && Number.isFinite(numeric) && !map.has(r)) return numeric;

  // Direct map lookup (exact key)
  const fromMap = map.get(r) ?? map.get(r.toUpperCase());
  if (fromMap) {
    const v = fromMap[i];
    return v == null || !Number.isFinite(v) ? null : v;
  }

  // Resolve via resolveRef (handles both EMA(14) and bare RSI etc.)
  const resolved = resolveRef(r);
  if (resolved) {
    const v = map.get(resolved.key)?.[i];
    return v == null || !Number.isFinite(v) ? null : v;
  }

  if (r.toUpperCase() === "CLOSE" || r.toUpperCase() === "PRICE") return closes[i];
  return null;
}

function compareValues(a: number, b: number, op: string): boolean {
  switch (op) {
    case "crosses above":
    case "is above":
    case ">":
      return a > b;
    case "crosses below":
    case "is below":
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case "==":
    case "=":
      return a === b;
    default:
      return a > b;
  }
}

function evalCondition(
  cond: StrategyCondition,
  i: number,
  map: SeriesMap,
  closes: number[],
): boolean {
  const a0 = seriesValue(cond.indicatorA, i - 1, map, closes);
  const b0 = seriesValue(cond.indicatorB, i - 1, map, closes);
  const a1 = seriesValue(cond.indicatorA, i, map, closes);
  const b1 = seriesValue(cond.indicatorB, i, map, closes);
  if (a1 == null || b1 == null) return false;

  const op = cond.operator.trim().toLowerCase();
  if (op === "crosses above") {
    if (a0 == null || b0 == null) return false;
    return a0 <= b0 && a1 > b1;
  }
  if (op === "crosses below") {
    if (a0 == null || b0 == null) return false;
    return a0 >= b0 && a1 < b1;
  }

  return compareValues(a1, b1, op);
}

export function evalLeg(leg: StrategyLeg, i: number, map: SeriesMap, closes: number[]): boolean {
  if (!leg.enabled || leg.conditions.length === 0) return false;
  if (leg.logic === "OR") {
    return leg.conditions.some((c) => evalCondition(c, i, map, closes));
  }
  return leg.conditions.every((c) => evalCondition(c, i, map, closes));
}

function holdSeconds(duration: number, unit: string): number {
  switch (unit) {
    case "t":
      return Math.max(duration, 1);
    case "s":
      return duration;
    case "m":
      return duration * 60;
    case "h":
      return duration * 3600;
    case "d":
      return duration * 86400;
    default:
      return duration * 60;
  }
}

function findExitIndex(candles: HistCandle[], entryIdx: number, holdSec: number): number {
  const target = candles[entryIdx].time + holdSec;
  for (let j = entryIdx + 1; j < candles.length; j++) {
    if (candles[j].time >= target) return j;
  }
  return candles.length - 1;
}

const PAYOUT_RATE = 0.85;

export function runBacktestOnCandles(
  candles: HistCandle[],
  strategyCode: string,
  params: BacktestRunParams,
  granularitySec: number,
  userIndicators: UserIndicator[] = [],
): BacktestRunResult {
  const legs = parseStrategyLegs(strategyCode);
  const directions = enabledDirections(legs);
  if (directions.length === 0) {
    throw new Error("Strategy has no enabled BUY or SELL leg with conditions");
  }

  const map = buildSeries(candles, legs, userIndicators);
  const closes = candles.map((c) => c.close);
  const hold = holdSeconds(params.duration, params.durationUnit);
  const trades: SimTrade[] = [];
  let lastExitIdx = 0;

  for (let i = 1; i < candles.length - 1; i++) {
    if (i <= lastExitIdx) continue;

    // Session filter — only allow trade entry if the candle's UTC hour
    // falls inside one of the requested sessions.
    if (!isWithinSessions(candles[i].time, params.sessions)) continue;

    let side: "buy" | "sell" | null = null;
    if (directions.includes("buy") && evalLeg(legs.buy, i, map, closes)) side = "buy";
    else if (directions.includes("sell") && evalLeg(legs.sell, i, map, closes)) side = "sell";
    if (!side) continue;

    const exitIdx = findExitIndex(candles, i, hold);
    if (exitIdx <= i) continue;

    const entry = candles[i].close;
    const exit = candles[exitIdx].close;
    const direction: "CALL" | "PUT" = side === "buy" ? "CALL" : "PUT";
    const won =
      direction === "CALL" ? exit > entry : exit < entry;
    const pnl = won
      ? Math.round(params.stakePerTrade * PAYOUT_RATE * 100) / 100
      : -params.stakePerTrade;

    trades.push({
      id: trades.length + 1,
      entryAt: new Date(candles[i].time * 1000).toISOString(),
      exitAt: new Date(candles[exitIdx].time * 1000).toISOString(),
      direction,
      type: params.tradeType,
      duration: `${params.duration}${params.durationUnit}`,
      entry: Math.round(entry * 10000) / 10000,
      exit: Math.round(exit * 10000) / 10000,
      stake: params.stakePerTrade,
      pnl: Math.round(pnl * 100) / 100,
      outcome: won ? "win" : "loss",
    });

    lastExitIdx = exitIdx;
  }

  const wins = trades.filter((t) => t.outcome === "win").length;
  return {
    wins,
    losses: trades.length - wins,
    tradeType: params.tradeType,
    duration: params.duration,
    durationUnit: params.durationUnit,
    trades,
    dataSource: "deriv_ws_ticks_history",
    candleCount: candles.length,
    granularitySec,
    sessions: params.sessions && params.sessions.length > 0 ? params.sessions : undefined,
    seriesMap: map,
  };
}

export function computeMaxDrawdown(initialBalance: number, trades: SimTrade[]): number {
  let equity = initialBalance;
  let peak = initialBalance;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return Math.round(maxDd * 100) / 100;
}

export function computeSharpe(trades: SimTrade[]): number {
  if (trades.length < 2) return 0;
  const returns = trades.map((t) => t.pnl);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return Math.round((mean / std) * Math.sqrt(returns.length) * 100) / 100;
}
