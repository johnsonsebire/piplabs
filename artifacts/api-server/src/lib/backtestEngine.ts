import type { HistCandle } from "./derivHistory";
import { buildSmcSeries, SMC_SERIES_NAMES, type SmcConfig } from "./smcEngine";

export type StrategyCondition = {
  indicatorA: string;
  operator: string;
  indicatorB: string;
};
export type HTFConfig = {
  enabled: boolean;
  timeframe: number; // Granularity in seconds
  marketFilters?: StrategyCondition[];
  confirmations?: StrategyCondition[];
};

export type RangingFilterConfig = {
  enabled: boolean;
  threshold: number;
  adx: { enabled: boolean; weight: number; period: number; value: number; };
  bb: { enabled: boolean; weight: number; period: number; percentile: number; };
  atr: { enabled: boolean; weight: number; period: number; smaPeriod: number; ratio: number; };
  rsi: { enabled: boolean; weight: number; period: number; min: number; max: number; };
};

export type StrategyLeg = {
  enabled: boolean;
  logic?: "AND" | "OR";
  conditions?: StrategyCondition[];
  marketFilters?: StrategyCondition[];
  triggers?: StrategyCondition[];
  confirmations?: StrategyCondition[];
  minConfidence?: number;
  useAIConfirmation?: boolean;
  sessions?: TradingSession[];
  htf?: HTFConfig;
  rangingFilter?: RangingFilterConfig;
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
  alternateDirection?: boolean;
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
    const sessionKey = (typeof s === 'string' ? s.toLowerCase() : s) as TradingSession;
    const config = SESSION_HOURS_UTC[sessionKey];
    if (!config) return true; // if invalid session, don't block
    const { start, end } = config;
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

export type SessionMetrics = {
  totalTrades: number;
  wins: number;
  losses: number;
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
  sessionMetrics?: Record<string, SessionMetrics>;
};


export type RiskManagement = {
  winCooldown?: { duration: number; consecutive: number };
  lossCooldown?: { duration: number; consecutive: number };
};

// ─── Strategy parsing (mirrors trading-platform strategies page) ───────────

export function parseStrategyLegs(rawCode: string | null | undefined): { buy: StrategyLeg; sell: StrategyLeg; riskManagement?: RiskManagement; smcConfig?: SmcConfig } {
  const empty: StrategyLeg = { enabled: false, logic: "AND", conditions: [] };
  if (!rawCode) return { buy: empty, sell: empty };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawCode);
  } catch (e) {
    return { buy: empty, sell: empty };
  }

  const toCondArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return undefined;
    return arr.map((c) => {
      const row = c as Record<string, unknown>;
      return {
        indicatorA: String(row.indicatorA ?? ""),
        operator: String(row.operator ?? ""),
        indicatorB: String(row.indicatorB ?? ""),
      };
    });
  };

  const toLeg = (src: unknown): StrategyLeg => {
    if (!src || typeof src !== "object") return empty;
    const s = src as Record<string, unknown>;
    
    // For backwards compatibility: if new fields are missing, parse legacy conditions
    const conditions = toCondArray(s.conditions);
    const marketFilters = toCondArray(s.marketFilters);
    const triggers = toCondArray(s.triggers);
    const confirmations = toCondArray(s.confirmations);
    
    const sessions = Array.isArray(s.sessions) ? s.sessions.map(String) as TradingSession[] : undefined;

    let htf: HTFConfig | undefined = undefined;
    if (s.htf && typeof s.htf === "object") {
      const htfObj = s.htf as Record<string, unknown>;
      htf = {
        enabled: htfObj.enabled === true,
        timeframe: typeof htfObj.timeframe === "number" ? htfObj.timeframe : 900,
        marketFilters: toCondArray(htfObj.marketFilters),
        confirmations: toCondArray(htfObj.confirmations),
      };
    }

    let rangingFilter: RangingFilterConfig | undefined = undefined;
    if (s.rangingFilter && typeof s.rangingFilter === "object") {
      const rf = s.rangingFilter as Record<string, any>;
      rangingFilter = {
        enabled: rf.enabled === true || rf.enabled === "true",
        threshold: !isNaN(Number(rf.threshold)) ? Number(rf.threshold) : 70,
        adx: {
          enabled: rf.adx?.enabled === true || rf.adx?.enabled === "true",
          weight: !isNaN(Number(rf.adx?.weight)) ? Number(rf.adx.weight) : 35,
          period: !isNaN(Number(rf.adx?.period)) ? Number(rf.adx.period) : 14,
          value: !isNaN(Number(rf.adx?.value)) ? Number(rf.adx.value) : 22,
        },
        bb: {
          enabled: rf.bb?.enabled === true,
          weight: typeof rf.bb?.weight === "number" ? rf.bb.weight : 25,
          period: typeof rf.bb?.period === "number" ? rf.bb.period : 20,
          percentile: typeof rf.bb?.percentile === "number" ? rf.bb.percentile : 25,
        },
        atr: {
          enabled: rf.atr?.enabled === true,
          weight: typeof rf.atr?.weight === "number" ? rf.atr.weight : 20,
          period: typeof rf.atr?.period === "number" ? rf.atr.period : 14,
          smaPeriod: typeof rf.atr?.smaPeriod === "number" ? rf.atr.smaPeriod : 50,
          ratio: typeof rf.atr?.ratio === "number" ? rf.atr.ratio : 0.8,
        },
        rsi: {
          enabled: rf.rsi?.enabled === true,
          weight: typeof rf.rsi?.weight === "number" ? rf.rsi.weight : 10,
          period: typeof rf.rsi?.period === "number" ? rf.rsi.period : 14,
          min: typeof rf.rsi?.min === "number" ? rf.rsi.min : 42,
          max: typeof rf.rsi?.max === "number" ? rf.rsi.max : 58,
        },
      };
    }

    return {
      enabled: s.enabled !== false,
      logic: s.logic === "OR" ? "OR" : "AND",
      conditions,
      marketFilters,
      triggers,
      confirmations,
      minConfidence: typeof s.minConfidence === "number" ? s.minConfidence : 50,
      useAIConfirmation: s.useAIConfirmation === true,
      sessions,
      htf,
      rangingFilter,
    };
  };

  // Parse optional SMC config
  let smcConfig: SmcConfig | undefined = undefined;
  if (parsed.smcConfig && typeof parsed.smcConfig === "object") {
    const sc = parsed.smcConfig as Record<string, unknown>;
    smcConfig = {
      swingLookback: typeof sc.swingLookback === "number" ? sc.swingLookback : undefined,
      obLookback: typeof sc.obLookback === "number" ? sc.obLookback : undefined,
      fvgLookback: typeof sc.fvgLookback === "number" ? sc.fvgLookback : undefined,
      displacementMultiplier: typeof sc.displacementMultiplier === "number" ? sc.displacementMultiplier : undefined,
      wickRatio: typeof sc.wickRatio === "number" ? sc.wickRatio : undefined,
      structureLegs: typeof sc.structureLegs === "number" ? sc.structureLegs : undefined,
    };
  }

  if (parsed.buy || parsed.sell) {
    return {
      buy: parsed.buy ? toLeg(parsed.buy) : empty,
      sell: parsed.sell ? toLeg(parsed.sell) : empty,
      riskManagement: parsed.riskManagement as RiskManagement | undefined,
      smcConfig,
    };
  }

  if (Array.isArray(parsed.conditions)) {
    const leg = toLeg(parsed);
    const action = typeof parsed.action === "string" ? parsed.action.toLowerCase() : 
                   typeof parsed.direction === "string" ? parsed.direction.toLowerCase() : "";
    return action === "sell" ? { buy: empty, sell: leg, riskManagement: parsed.riskManagement as RiskManagement | undefined, smcConfig } : { buy: leg, sell: empty, riskManagement: parsed.riskManagement as RiskManagement | undefined, smcConfig };
  }

  return { buy: empty, sell: empty, riskManagement: parsed.riskManagement as RiskManagement | undefined, smcConfig };
}

function hasRules(leg: StrategyLeg): boolean {
  if (!leg.enabled) return false;
  const count = (leg.conditions?.length ?? 0) + (leg.marketFilters?.length ?? 0) + (leg.triggers?.length ?? 0) + (leg.confirmations?.length ?? 0);
  return count > 0;
}

export function enabledDirections(legs: { buy: StrategyLeg; sell: StrategyLeg }): Array<"buy" | "sell"> {
  const out: Array<"buy" | "sell"> = [];
  if (hasRules(legs.buy)) out.push("buy");
  if (hasRules(legs.sell)) out.push("sell");
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

export function atr(candles: HistCandle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  const tr: number[] = new Array(candles.length).fill(0);
  if (candles.length <= period) return out;
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i-1].close;
    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  
  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    trSum += tr[i];
  }
  let prevAtr = trSum / period;
  out[period] = prevAtr;
  
  for (let i = period + 1; i < candles.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + tr[i]) / period; // Wilder's smoothing
    out[i] = currentAtr;
    prevAtr = currentAtr;
  }
  return out;
}

export function adx(candles: HistCandle[], period: number): { adx: (number | null)[], plusDI: (number | null)[], minusDI: (number | null)[] } {
  const outAdx: (number | null)[] = new Array(candles.length).fill(null);
  const outPlusDI: (number | null)[] = new Array(candles.length).fill(null);
  const outMinusDI: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period * 2) return { adx: outAdx, plusDI: outPlusDI, minusDI: outMinusDI };

  const tr: number[] = new Array(candles.length).fill(0);
  const plusDM: number[] = new Array(candles.length).fill(0);
  const minusDM: number[] = new Array(candles.length).fill(0);

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i-1].high;
    const prevLow = candles[i-1].low;
    const prevClose = candles[i-1].close;

    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
    if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
  }

  const smooth = (prev: number, current: number) => prev - (prev / period) + current;

  let trSmoothed = 0;
  let plusDmSmoothed = 0;
  let minusDmSmoothed = 0;

  for (let i = 1; i <= period; i++) {
    trSmoothed += tr[i];
    plusDmSmoothed += plusDM[i];
    minusDmSmoothed += minusDM[i];
  }

  const dx: number[] = new Array(candles.length).fill(0);

  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      trSmoothed = smooth(trSmoothed, tr[i]);
      plusDmSmoothed = smooth(plusDmSmoothed, plusDM[i]);
      minusDmSmoothed = smooth(minusDmSmoothed, minusDM[i]);
    }

    const plusDI = trSmoothed === 0 ? 0 : (plusDmSmoothed / trSmoothed) * 100;
    const minusDI = trSmoothed === 0 ? 0 : (minusDmSmoothed / trSmoothed) * 100;
    outPlusDI[i] = plusDI;
    outMinusDI[i] = minusDI;

    const diff = Math.abs(plusDI - minusDI);
    const sum = plusDI + minusDI;
    dx[i] = sum === 0 ? 0 : (diff / sum) * 100;
  }

  let adxSum = 0;
  for (let i = period; i < period * 2; i++) {
    adxSum += dx[i];
  }
  let prevAdx = adxSum / period;
  outAdx[period * 2 - 1] = prevAdx;

  for (let i = period * 2; i < candles.length; i++) {
    prevAdx = ((prevAdx * (period - 1)) + dx[i]) / period;
    outAdx[i] = prevAdx;
  }

  return { adx: outAdx, plusDI: outPlusDI, minusDI: outMinusDI };
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
  ADX: 14,
};

/**
 * Resolves a strategy indicator reference string into a canonical map key and period.
 * Handles both parameterised ("EMA(14)") and bare ("RSI", "CCI") forms.
 */
function resolveRef(ref: string): { key: string; kind: string; period: number } | null {
  const r = ref.trim().toUpperCase();

  // Parameterised: EMA(14), SMA(20), RSI(14), CCI(20), WMA(5), EMA 200, EMA200
  const mParam = r.match(/^(EMA|SMA|WMA|RSI|CCI|ATR|ADX)\s*\(?\s*(\d+)\s*\)?$/i);
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
    const allConds = [
      ...(leg.conditions || []),
      ...(leg.marketFilters || []),
      ...(leg.triggers || []),
      ...(leg.confirmations || []),
    ];
    for (const c of allConds) {
      refs.add(c.indicatorA.trim());
      refs.add(c.indicatorB.trim());
    }
    
    if (leg.rangingFilter?.enabled) {
      const rf = leg.rangingFilter;
      if (rf.adx.enabled) refs.add(`ADX(${rf.adx.period})`);
      if (rf.bb.enabled) {
        refs.add(`BB_UPPER`);
        refs.add(`BB_LOWER`);
        refs.add(`BB_MIDDLE`);
      }
      if (rf.atr.enabled) refs.add(`ATR(${rf.atr.period})`);
      if (rf.rsi.enabled) refs.add(`RSI(${rf.rsi.period})`);
    }
  }
  
  // Always include standard indicators for the AI Enhanced Matrix and safety checks
  refs.add("EMA(3)");
  refs.add("EMA(7)");
  refs.add("MACD");
  refs.add("MACD_SIGNAL");
  refs.add("RSI(14)");
  refs.add("ADX(14)");

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
  smcConfig?: SmcConfig,
): SeriesMap {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const opens = candles.map((c) => c.open);

  const map: SeriesMap = new Map([
    ["CLOSE", closes],
    ["PRICE", closes],
    ["CURRENT PRICE", closes],
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
    else if (kind === "ATR") map.set(key, atr(candles, period));
    else if (kind === "ADX") {
      const res = adx(candles, period);
      map.set(key, res.adx);
      map.set(key + "_PLUS_DI", res.plusDI);
      map.set(key + "_MINUS_DI", res.minusDI);
    }
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

  // ── SMC / ICT Price Action Series ─────────────────────────────────────────
  // Merge all SMC series into the map unless already present (e.g. from user indicators).
  // SMC series are always computed — the computation is cheap and allows any condition
  // to reference SMC concepts without pre-declaring them.
  const smcSeries = buildSmcSeries(candles, smcConfig ?? {});
  for (const name of SMC_SERIES_NAMES) {
    if (!map.has(name)) {
      const s = smcSeries.get(name);
      if (s) map.set(name, s);
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

  if (r.toUpperCase() === "CLOSE" || r.toUpperCase() === "PRICE" || r.toUpperCase() === "CURRENT PRICE") return closes[i];
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
      return false;
  }
}

function evalCondition(
  cond: StrategyCondition,
  i: number,
  map: SeriesMap,
  closes: number[],
): boolean {
  const a0 = seriesValue(cond.indicatorA, i - 1, map, closes);
  const a1 = seriesValue(cond.indicatorA, i, map, closes);

  const op = cond.operator.trim().toLowerCase();

  if (op === "rising" || op === "is rising") {
    if (a0 == null || a1 == null) return false;
    return a1 > a0;
  }
  if (op === "declining" || op === "is declining") {
    if (a0 == null || a1 == null) return false;
    return a1 < a0;
  }
  if (op === "is positive and rising") {
    if (a0 == null || a1 == null) return false;
    return a1 > 0 && a1 > a0;
  }
  if (op === "is negative and declining") {
    if (a0 == null || a1 == null) return false;
    return a1 < 0 && a1 < a0;
  }

  const b0 = seriesValue(cond.indicatorB, i - 1, map, closes);
  const b1 = seriesValue(cond.indicatorB, i, map, closes);
  if (a1 == null || b1 == null) return false;


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

function isRanging(rf: RangingFilterConfig, i: number, map: SeriesMap, closes: number[]): boolean {
  if (!rf.enabled) return false;
  let score = 0;

  if (rf.adx.enabled) {
    const adxKey = `ADX_${rf.adx.period}`;
    const adxVal = map.get(adxKey)?.[i];
    const adxPrev = map.get(adxKey)?.[i - 1];
    if (adxVal != null && adxVal < rf.adx.value) {
      if (adxPrev != null && adxVal <= adxPrev) {
        score += rf.adx.weight;
      }
    }
  }

  if (rf.bb.enabled) {
    const upper = map.get("BB_UPPER")?.[i];
    const lower = map.get("BB_LOWER")?.[i];
    const middle = map.get("BB_MIDDLE")?.[i];
    
    if (upper != null && lower != null && middle != null && middle !== 0) {
      const currentWidth = (upper - lower) / middle;
      
      const lookback = 50;
      let count = 0;
      let valid = 0;
      for (let j = Math.max(0, i - lookback); j <= i; j++) {
        const u = map.get("BB_UPPER")?.[j];
        const l = map.get("BB_LOWER")?.[j];
        const m = map.get("BB_MIDDLE")?.[j];
        if (u != null && l != null && m != null && m !== 0) {
          valid++;
          if ((u - l) / m < currentWidth) count++;
        }
      }
      if (valid > 10) {
        const percentile = (count / valid) * 100;
        if (percentile < rf.bb.percentile) {
          score += rf.bb.weight;
        }
      }
    }
  }

  if (rf.atr.enabled) {
    const atrKey = `ATR_${rf.atr.period}`;
    const currentAtr = map.get(atrKey)?.[i];
    if (currentAtr != null) {
      let sum = 0;
      let valid = 0;
      for (let j = Math.max(0, i - rf.atr.smaPeriod + 1); j <= i; j++) {
        const a = map.get(atrKey)?.[j];
        if (a != null) {
          sum += a;
          valid++;
        }
      }
      if (valid > 0) {
        const smaAtr = sum / valid;
        if (smaAtr > 0 && currentAtr / smaAtr < rf.atr.ratio) {
          score += rf.atr.weight;
        }
      }
    }
  }

  if (rf.rsi.enabled) {
    const rsiKey = `RSI_${rf.rsi.period}`;
    const currentRsi = map.get(rsiKey)?.[i];
    if (currentRsi != null && currentRsi > rf.rsi.min && currentRsi < rf.rsi.max) {
      score += rf.rsi.weight;
    }
  }

  return score >= rf.threshold;
}

export function evalLeg(
  leg: StrategyLeg, 
  i: number, 
  map: SeriesMap, 
  closes: number[], 
  epochSec: number,
  htfMap?: SeriesMap,
  htfCloses?: number[],
  htfIndex?: number
): boolean {
  if (!leg.enabled) return false;

  if (leg.rangingFilter?.enabled) {
    if (isRanging(leg.rangingFilter, i, map, closes)) {
      return false; // Block entry if ranging market
    }
  }

  // 1. Session Filter (Leg-level)
  if (!isWithinSessions(epochSec, leg.sessions)) return false;

  // Handle Legacy / Fallback Mode
  if (!leg.marketFilters && !leg.triggers && !leg.confirmations) {
    if (!leg.conditions || leg.conditions.length === 0) return false;
    if (leg.logic === "OR") {
      return leg.conditions.some((c) => evalCondition(c, i, map, closes));
    }
    return leg.conditions.every((c) => evalCondition(c, i, map, closes));
  }

  const filters = leg.marketFilters || [];
  const triggers = leg.triggers || [];
  const confs = leg.confirmations || [];

  const totalRules = filters.length + triggers.length + confs.length;
  if (totalRules === 0) return false;

  // 1.5 HTF Evaluation (HARD AND)
  if (leg.htf?.enabled && htfMap && htfCloses && htfIndex !== undefined && htfIndex >= 0) {
    const htfFilters = leg.htf.marketFilters || [];
    if (htfFilters.length > 0) {
      const allHtfFiltersPass = htfFilters.every((c) => evalCondition(c, htfIndex, htfMap, htfCloses));
      if (!allHtfFiltersPass) return false;
    }
    const htfConfs = leg.htf.confirmations || [];
    if (htfConfs.length > 0) {
      const allHtfConfsPass = htfConfs.every((c) => evalCondition(c, htfIndex, htfMap, htfCloses));
      if (!allHtfConfsPass) return false;
    }
  }

  // 2. Market Filters (HARD AND)
  if (filters.length > 0) {
    const allFiltersPass = filters.every((c) => evalCondition(c, i, map, closes));
    if (!allFiltersPass) return false;
  }

  // 3. Triggers (HARD OR)
  let passingTriggers = 0;
  if (triggers.length > 0) {
    passingTriggers = triggers.filter((c) => evalCondition(c, i, map, closes)).length;
    if (passingTriggers === 0) return false;
  }

  // 4. Confirmations (SOFT)
  const passingConfs = confs.filter((c) => evalCondition(c, i, map, closes)).length;

  // 5. Score Calculation
  const minConfidence = leg.minConfidence ?? 0;
  if (minConfidence <= 0) return true;

  const passingRules = filters.length + passingTriggers + passingConfs;
  const score = (passingRules / totalRules) * 100;

  return score >= minConfidence;
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
  htfData: Record<number, { candles: HistCandle[], map: SeriesMap, closes: number[] }> = {},
): BacktestRunResult {
  const { buy, sell, riskManagement, smcConfig } = parseStrategyLegs(strategyCode);
  const legs = { buy, sell };
  const directions = enabledDirections(legs);
  if (directions.length === 0) {
    throw new Error("Strategy has no enabled BUY or SELL leg with conditions");
  }

  const smcConfigWithTimeframe = { ...(smcConfig ?? {}), timeframe: granularitySec };
  const map = buildSeries(candles, legs, userIndicators, smcConfigWithTimeframe);
  const closes = candles.map((c) => c.close);
  const hold = holdSeconds(params.duration, params.durationUnit);
  const trades: SimTrade[] = [];
  let lastExitIdx = 0;
  let lastTradeSide: "buy" | "sell" | null = null;

  for (let i = 1; i < candles.length - 1; i++) {
    if (i <= lastExitIdx) continue;

    // Session filter — only allow trade entry if the candle's UTC hour
    // falls inside one of the requested sessions.
    if (!isWithinSessions(candles[i].time, params.sessions)) continue;

    // Evaluate Risk Management Cooldowns
    if (riskManagement && trades.length > 0 && lastExitIdx > 0) {
      let cooldownActive = false;
      const lastTradeTimeMs = candles[lastExitIdx].time * 1000;
      const currentTimeMs = candles[i].time * 1000;

      // check win cooldown
      if (riskManagement.winCooldown && riskManagement.winCooldown.duration > 0 && riskManagement.winCooldown.consecutive > 0) {
        const lastN = trades.slice(-riskManagement.winCooldown.consecutive);
        if (lastN.length === riskManagement.winCooldown.consecutive && lastN.every(t => t.outcome === "win")) {
          const cooldownDurationMs = riskManagement.winCooldown.duration * 60 * 1000;
          if (currentTimeMs - lastTradeTimeMs < cooldownDurationMs) {
            cooldownActive = true;
          }
        }
      }

      // check loss cooldown
      if (!cooldownActive && riskManagement.lossCooldown && riskManagement.lossCooldown.duration > 0 && riskManagement.lossCooldown.consecutive > 0) {
        const lastN = trades.slice(-riskManagement.lossCooldown.consecutive);
        if (lastN.length === riskManagement.lossCooldown.consecutive && lastN.every(t => t.outcome === "loss")) {
          const cooldownDurationMs = riskManagement.lossCooldown.duration * 60 * 1000;
          if (currentTimeMs - lastTradeTimeMs < cooldownDurationMs) {
            cooldownActive = true;
          }
        }
      }

      if (cooldownActive) continue;
    }
    
    // Find HTF indices matching the current candle time
    const htfIndexBuy = legs.buy.htf?.enabled && htfData[legs.buy.htf.timeframe] 
      ? htfData[legs.buy.htf.timeframe].candles.findIndex(c => c.time <= candles[i].time && c.time + legs.buy.htf!.timeframe > candles[i].time)
      : undefined;
    const htfIndexSell = legs.sell.htf?.enabled && htfData[legs.sell.htf.timeframe]
      ? htfData[legs.sell.htf.timeframe].candles.findIndex(c => c.time <= candles[i].time && c.time + legs.sell.htf!.timeframe > candles[i].time)
      : undefined;

    const isBuy = directions.includes("buy") && evalLeg(
      legs.buy, i, map, closes, candles[i].time, 
      legs.buy.htf?.enabled ? htfData[legs.buy.htf.timeframe]?.map : undefined,
      legs.buy.htf?.enabled ? htfData[legs.buy.htf.timeframe]?.closes : undefined,
      htfIndexBuy !== -1 ? htfIndexBuy : undefined
    );
    const isSell = directions.includes("sell") && evalLeg(
      legs.sell, i, map, closes, candles[i].time,
      legs.sell.htf?.enabled ? htfData[legs.sell.htf.timeframe]?.map : undefined,
      legs.sell.htf?.enabled ? htfData[legs.sell.htf.timeframe]?.closes : undefined,
      htfIndexSell !== -1 ? htfIndexSell : undefined
    );
    
    let side: "buy" | "sell" | null = null;
    
    if (isBuy && isSell) {
      // Conflicting signal — both legs fired at the same candle.
      // Only resolve it if alternateDirection is on (use opposite of last trade).
      // Otherwise skip to avoid placing a trade on ambiguous conditions.
      if (params.alternateDirection && lastTradeSide) {
        side = lastTradeSide === "buy" ? "sell" : "buy";
      } else {
        side = null; // ambiguous — skip
      }
    } else if (isBuy) {
      side = "buy";
    } else if (isSell) {
      side = "sell";
    }

    if (!side) continue;

    // Filter using alternateDirection logic
    if (params.alternateDirection && lastTradeSide && side === lastTradeSide) {
      continue;
    }

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
    lastTradeSide = side;
  }

  const wins = trades.filter((t) => t.outcome === "win").length;
  
  const sessionMetrics: Record<string, SessionMetrics> = {
    asian: { totalTrades: 0, wins: 0, losses: 0 },
    london: { totalTrades: 0, wins: 0, losses: 0 },
    newyork: { totalTrades: 0, wins: 0, losses: 0 },
    overlap_london_ny: { totalTrades: 0, wins: 0, losses: 0 },
  };

  for (const t of trades) {
    const utcHour = new Date(t.entryAt).getUTCHours();
    for (const [s, conf] of Object.entries(SESSION_HOURS_UTC)) {
      if (utcHour >= conf.start && utcHour < conf.end) {
        sessionMetrics[s].totalTrades++;
        if (t.outcome === "win") sessionMetrics[s].wins++;
        else sessionMetrics[s].losses++;
      }
    }
  }

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
    sessionMetrics,
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
