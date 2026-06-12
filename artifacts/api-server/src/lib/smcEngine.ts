/**
 * smcEngine.ts — Smart Money Concepts (SMC) / ICT Price Action Engine
 *
 * Computes per-candle binary (0/1) series for all SMC/ICT concepts.
 * The output is a Map<string, (number|null)[]> compatible with the existing
 * SeriesMap so that the existing evalCondition() machinery can reference any
 * SMC concept as-is using standard operators ("> 0", "is rising", etc.).
 *
 * Design decisions:
 *   - Swing lookback default = 3 bars (fast, good for 1m–5m Deriv charts)
 *   - OB is "mitigated" (invalidated) when price CLOSES beyond the OB boundary
 *   - All series are pre-computed in a single O(n) pass where possible
 *   - No side effects; fully pure function
 */

import type { HistCandle } from "./derivHistory";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface SmcConfig {
  /** Bars each side to confirm a swing pivot. Default "auto" (3 for <15m, 5 for >=15m). */
  swingLookback?: number | "auto";
  /** Timeframe in seconds, used for auto-detecting parameters like swingLookback. */
  timeframe?: number;
  /** Max candles to look back when searching for active Order Blocks. Default 100. */
  obLookback?: number;
  /** Max candles to look back when searching for open Fair Value Gaps. Default 100. */
  fvgLookback?: number;
  /** Body-size multiplier vs ATR(14) to call a candle a "displacement". Default 1.5. */
  displacementMultiplier?: number;
  /** Lower/upper wick must be N× body size to flag a rejection wick. Default 2.0. */
  wickRatio?: number;
  /** Number of consecutive HH+HL (or LL+LH) required to declare trend structure. Default 2. */
  structureLegs?: number;
}

const DEFAULTS: Required<Omit<SmcConfig, "timeframe">> = {
  swingLookback: "auto",
  obLookback: 100,
  fvgLookback: 100,
  displacementMultiplier: 1.5,
  wickRatio: 2.0,
  structureLegs: 2,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type SmcSeries = Map<string, (number | null)[]>;

interface SwingPoint {
  index: number;
  price: number; // high for swing highs, low for swing lows
  type: "high" | "low";
}

interface Zone {
  top: number;
  bottom: number;
  startIdx: number;
  mitigated: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zeros(n: number): number[] {
  return new Array(n).fill(0);
}

function nulls(n: number): (number | null)[] {
  return new Array(n).fill(null);
}

/** Wilder's ATR over a rolling window, returns array aligned with candles */
function calcAtr(candles: HistCandle[], period = 14): (number | null)[] {
  const out: (number | null)[] = nulls(candles.length);
  if (candles.length <= period) return out;
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close),
      ),
    );
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

// ─── Core computations ───────────────────────────────────────────────────────

/**
 * Detect confirmed swing highs and lows.
 * A swing high at index i requires: candles[i].high > candles[i±k].high for k in 1..N
 * We can only confirm a swing AFTER N bars have passed (look-right constraint).
 */
function detectSwings(
  candles: HistCandle[],
  N: number,
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  const n = candles.length;

  for (let i = N; i < n - N; i++) {
    const pivotHigh = candles[i].high;
    const pivotLow = candles[i].low;

    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= N; k++) {
      if (candles[i - k].high >= pivotHigh || candles[i + k].high >= pivotHigh) isHigh = false;
      if (candles[i - k].low <= pivotLow || candles[i + k].low <= pivotLow) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) swingHighs.push({ index: i, price: pivotHigh, type: "high" });
    if (isLow) swingLows.push({ index: i, price: pivotLow, type: "low" });
  }

  return { swingHighs, swingLows };
}

/**
 * Build SWING_HIGH and SWING_LOW binary series.
 * Value is 1 at the confirmed swing candle index, 0 elsewhere.
 * Note: there is an inherent N-bar lag (the swing is only confirmed N bars later).
 */
function buildSwingSeries(
  candles: HistCandle[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
): { swingHighSeries: number[]; swingLowSeries: number[] } {
  const swingHighSeries = zeros(candles.length);
  const swingLowSeries = zeros(candles.length);
  for (const sh of swingHighs) swingHighSeries[sh.index] = 1;
  for (const sl of swingLows) swingLowSeries[sl.index] = 1;
  return { swingHighSeries, swingLowSeries };
}

/**
 * Build BOS (Break of Structure) and CHoCH (Change of Character) series.
 *
 * BOS_BULL = price closes above last confirmed swing high → bullish BOS
 * BOS_BEAR = price closes below last confirmed swing low  → bearish BOS
 * CHoCH_BULL = BOS_BULL that occurs while the prior structure was bearish
 * CHoCH_BEAR = BOS_BEAR that occurs while the prior structure was bullish
 *
 * We track the current trend as "bull" | "bear" | "neutral" and flip it on BOS.
 */
function buildBosChochSeries(
  candles: HistCandle[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
): {
  bosBull: number[];
  bosBear: number[];
  chochBull: number[];
  chochBear: number[];
} {
  const n = candles.length;
  const bosBull = zeros(n);
  const bosBear = zeros(n);
  const chochBull = zeros(n);
  const chochBear = zeros(n);

  // Pre-sort swing points by index
  const sortedHighs = [...swingHighs].sort((a, b) => a.index - b.index);
  const sortedLows = [...swingLows].sort((a, b) => a.index - b.index);

  let lastSwingHighPrice: number | null = null;
  let lastSwingLowPrice: number | null = null;
  let shPtr = 0;
  let slPtr = 0;
  let trend: "bull" | "bear" | "neutral" = "neutral";

  for (let i = 0; i < n; i++) {
    // Advance swing pointers to include confirmed swings at or before i
    while (shPtr < sortedHighs.length && sortedHighs[shPtr].index <= i) {
      lastSwingHighPrice = sortedHighs[shPtr].price;
      shPtr++;
    }
    while (slPtr < sortedLows.length && sortedLows[slPtr].index <= i) {
      lastSwingLowPrice = sortedLows[slPtr].price;
      slPtr++;
    }

    const close = candles[i].close;

    if (lastSwingHighPrice !== null && close > lastSwingHighPrice) {
      bosBull[i] = 1;
      if (trend === "bear") {
        chochBull[i] = 1; // CHoCH: first bullish BOS after a downtrend
      }
      trend = "bull";
      lastSwingHighPrice = null; // reset so we don't re-fire every candle
    }

    if (lastSwingLowPrice !== null && close < lastSwingLowPrice) {
      bosBear[i] = 1;
      if (trend === "bull") {
        chochBear[i] = 1; // CHoCH: first bearish BOS after an uptrend
      }
      trend = "bear";
      lastSwingLowPrice = null;
    }
  }

  return { bosBull, bosBear, chochBull, chochBear };
}

/**
 * Build Order Block series.
 *
 * Bullish OB: The last bearish (down) candle before a bullish BOS.
 *   - Identified at the time of BOS; the OB is the down-candle immediately
 *     before the impulse that caused BOS.
 *   - Active (OB_BULL=1) on subsequent candles while price is inside [OB.low, OB.high]
 *     and the OB has not been mitigated (close below OB.low).
 *
 * Bearish OB: The last bullish (up) candle before a bearish BOS.
 *   - Active (OB_BEAR=1) while price is inside [OB.low, OB.high] and not mitigated.
 *
 * We keep a list of active OBs and evaluate each candle against all active ones.
 */
function buildOrderBlockSeries(
  candles: HistCandle[],
  bosBull: number[],
  bosBear: number[],
  obLookback: number,
): { obBull: number[]; obBear: number[] } {
  const n = candles.length;
  const obBull = zeros(n);
  const obBear = zeros(n);

  const activeBullOBs: Zone[] = [];
  const activeBearOBs: Zone[] = [];

  for (let i = 1; i < n; i++) {
    const close = candles[i].close;

    // ── Create new OBs on BOS candles ──────────────────────────────────────
    if (bosBull[i] === 1) {
      // Walk backward to find last bearish candle before this BOS
      for (let k = i - 1; k >= Math.max(0, i - obLookback); k--) {
        if (candles[k].close < candles[k].open) {
          // This is the bullish OB (the last bearish candle before the BOS)
          activeBullOBs.push({
            top: candles[k].open, // bearish candle: open > close, top = open
            bottom: candles[k].low,
            startIdx: k,
            mitigated: false,
          });
          break;
        }
      }
    }

    if (bosBear[i] === 1) {
      // Walk backward to find last bullish candle before this BOS
      for (let k = i - 1; k >= Math.max(0, i - obLookback); k--) {
        if (candles[k].close > candles[k].open) {
          // Bearish OB (last bullish candle before bearish BOS)
          activeBearOBs.push({
            top: candles[k].high,
            bottom: candles[k].open, // bullish candle: close > open, bottom = open
            startIdx: k,
            mitigated: false,
          });
          break;
        }
      }
    }

    // ── Evaluate active OBs at this candle ────────────────────────────────
    for (const ob of activeBullOBs) {
      if (ob.mitigated) continue;
      if (close < ob.bottom) {
        ob.mitigated = true; // violated — price closed below bullish OB
        continue;
      }
      if (close >= ob.bottom && close <= ob.top) {
        obBull[i] = 1; // price is inside the bullish OB zone
      }
    }

    for (const ob of activeBearOBs) {
      if (ob.mitigated) continue;
      if (close > ob.top) {
        ob.mitigated = true; // violated — price closed above bearish OB
        continue;
      }
      if (close >= ob.bottom && close <= ob.top) {
        obBear[i] = 1; // price is inside the bearish OB zone
      }
    }
  }

  return { obBull, obBear };
}

/**
 * Build Fair Value Gap (FVG / Imbalance) series.
 *
 * Bullish FVG: candle[i-2].high < candle[i].low  (gap between i-2 and i)
 * Bearish FVG: candle[i-2].low  > candle[i].high (gap between i-2 and i)
 *
 * An FVG is open while price has not retraced to fill it (closed inside the gap).
 * Once filled, it's mitigated. We mark FVG_BULL/BEAR=1 on candles where price
 * is inside an open gap.
 */
function buildFvgSeries(
  candles: HistCandle[],
  fvgLookback: number,
): { fvgBull: number[]; fvgBear: number[] } {
  const n = candles.length;
  const fvgBull = zeros(n);
  const fvgBear = zeros(n);

  const activeBullFvgs: Zone[] = [];
  const activeBearFvgs: Zone[] = [];

  for (let i = 2; i < n; i++) {
    const close = candles[i].close;

    // ── Detect new FVG formed at i ─────────────────────────────────────────
    if (candles[i - 2].high < candles[i].low) {
      activeBullFvgs.push({
        top: candles[i].low,
        bottom: candles[i - 2].high,
        startIdx: i,
        mitigated: false,
      });
    }

    if (candles[i - 2].low > candles[i].high) {
      activeBearFvgs.push({
        top: candles[i - 2].low,
        bottom: candles[i].high,
        startIdx: i,
        mitigated: false,
      });
    }

    // ── Evaluate active FVGs ───────────────────────────────────────────────
    for (const fvg of activeBullFvgs) {
      if (fvg.mitigated) continue;
      if (i - fvg.startIdx > fvgLookback) { fvg.mitigated = true; continue; }
      if (close >= fvg.bottom && close <= fvg.top) {
        fvgBull[i] = 1;
        fvg.mitigated = true; // FVG filled
      }
    }

    for (const fvg of activeBearFvgs) {
      if (fvg.mitigated) continue;
      if (i - fvg.startIdx > fvgLookback) { fvg.mitigated = true; continue; }
      if (close >= fvg.bottom && close <= fvg.top) {
        fvgBear[i] = 1;
        fvg.mitigated = true; // FVG filled
      }
    }
  }

  return { fvgBull, fvgBear };
}

/**
 * Build Premium / Discount zone series.
 *
 * Tracks the most recent confirmed swing high (SH) and swing low (SL).
 * Equilibrium = (SH + SL) / 2.
 * PREMIUM = 1 when close > equilibrium
 * DISCOUNT = 1 when close < equilibrium
 */
function buildPremiumDiscountSeries(
  candles: HistCandle[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
): { premium: number[]; discount: number[] } {
  const n = candles.length;
  const premium = zeros(n);
  const discount = zeros(n);

  const sortedHighs = [...swingHighs].sort((a, b) => a.index - b.index);
  const sortedLows = [...swingLows].sort((a, b) => a.index - b.index);

  let lastSH: number | null = null;
  let lastSL: number | null = null;
  let shPtr = 0;
  let slPtr = 0;

  for (let i = 0; i < n; i++) {
    while (shPtr < sortedHighs.length && sortedHighs[shPtr].index <= i) {
      lastSH = sortedHighs[shPtr].price;
      shPtr++;
    }
    while (slPtr < sortedLows.length && sortedLows[slPtr].index <= i) {
      lastSL = sortedLows[slPtr].price;
      slPtr++;
    }

    if (lastSH !== null && lastSL !== null) {
      const equilibrium = (lastSH + lastSL) / 2;
      const close = candles[i].close;
      if (close > equilibrium) premium[i] = 1;
      else if (close < equilibrium) discount[i] = 1;
    }
  }

  return { premium, discount };
}

/**
 * Build Liquidity Sweep series.
 *
 * A liquidity sweep is a candle that:
 *   - Wicks above a prior swing high and then closes BELOW it (LiqSweep_High)
 *   - Wicks below a prior swing low and then closes ABOVE it (LiqSweep_Low)
 *
 * These represent engineered liquidity grabs by smart money.
 */
function buildLiquiditySweepSeries(
  candles: HistCandle[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
): { liqSweepHigh: number[]; liqSweepLow: number[] } {
  const n = candles.length;
  const liqSweepHigh = zeros(n);
  const liqSweepLow = zeros(n);

  const sortedHighs = [...swingHighs].sort((a, b) => a.index - b.index);
  const sortedLows = [...swingLows].sort((a, b) => a.index - b.index);

  let lastSH: number | null = null;
  let lastSL: number | null = null;
  let shPtr = 0;
  let slPtr = 0;

  for (let i = 0; i < n; i++) {
    while (shPtr < sortedHighs.length && sortedHighs[shPtr].index <= i - 1) {
      lastSH = sortedHighs[shPtr].price;
      shPtr++;
    }
    while (slPtr < sortedLows.length && sortedLows[slPtr].index <= i - 1) {
      lastSL = sortedLows[slPtr].price;
      slPtr++;
    }

    const c = candles[i];

    // Wick above last swing high but close below it → sweep high
    if (lastSH !== null && c.high > lastSH && c.close < lastSH) {
      liqSweepHigh[i] = 1;
    }

    // Wick below last swing low but close above it → sweep low
    if (lastSL !== null && c.low < lastSL && c.close > lastSL) {
      liqSweepLow[i] = 1;
    }
  }

  return { liqSweepHigh, liqSweepLow };
}

/**
 * Build Displacement series.
 *
 * A displacement candle has a body size > multiplier × ATR(14).
 * DISP_BULL = bullish displacement (close > open AND body > threshold)
 * DISP_BEAR = bearish displacement (close < open AND body > threshold)
 */
function buildDisplacementSeries(
  candles: HistCandle[],
  atr: (number | null)[],
  multiplier: number,
): { dispBull: number[]; dispBear: number[] } {
  const n = candles.length;
  const dispBull = zeros(n);
  const dispBear = zeros(n);

  for (let i = 0; i < n; i++) {
    const atrVal = atr[i];
    if (atrVal == null || atrVal === 0) continue;
    const body = Math.abs(candles[i].close - candles[i].open);
    if (body < multiplier * atrVal) continue;

    if (candles[i].close > candles[i].open) dispBull[i] = 1;
    else if (candles[i].close < candles[i].open) dispBear[i] = 1;
  }

  return { dispBull, dispBear };
}

/**
 * Build Rejection Wick series.
 *
 * WICK_BULL = lower wick ≥ wickRatio × body (bullish rejection / hammer-like)
 * WICK_BEAR = upper wick ≥ wickRatio × body (bearish rejection / shooting star-like)
 */
function buildRejectionWickSeries(
  candles: HistCandle[],
  wickRatio: number,
): { wickBull: number[]; wickBear: number[] } {
  const n = candles.length;
  const wickBull = zeros(n);
  const wickBear = zeros(n);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    if (body === 0) continue; // doji — skip
    if (lowerWick >= wickRatio * body) wickBull[i] = 1;
    if (upperWick >= wickRatio * body) wickBear[i] = 1;
  }

  return { wickBull, wickBear };
}

/**
 * Build Market Structure State series (MSS_BULL / MSS_BEAR).
 *
 * Tracks whether the market is currently in a bullish or bearish structure
 * by counting consecutive HH+HL (bullish) or LL+LH (bearish) sequences.
 *
 * MSS_BULL = 1 when structure is bullish
 * MSS_BEAR = 1 when structure is bearish
 */
function buildMarketStructureSeries(
  candles: HistCandle[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  structureLegs: number,
): { mssBull: number[]; mssBear: number[] } {
  const n = candles.length;
  const mssBull = zeros(n);
  const mssBear = zeros(n);

  // Interleave swing highs and lows by index
  const allSwings: SwingPoint[] = [...swingHighs, ...swingLows].sort(
    (a, b) => a.index - b.index,
  );

  if (allSwings.length < 2) return { mssBull, mssBear };

  // For each candle, determine structure based on prior swings
  let bullLegs = 0;
  let bearLegs = 0;
  let lastHigh: number | null = null;
  let lastLow: number | null = null;
  let swingPtr = 0;
  let currentStructure: "bull" | "bear" | "neutral" = "neutral";

  for (let i = 0; i < n; i++) {
    // Advance swings confirmed by candle i
    while (swingPtr < allSwings.length && allSwings[swingPtr].index <= i) {
      const sw = allSwings[swingPtr];
      if (sw.type === "high") {
        if (lastHigh !== null && sw.price > lastHigh) bullLegs = Math.min(bullLegs + 1, structureLegs);
        else if (lastHigh !== null) bullLegs = Math.max(bullLegs - 1, 0);
        lastHigh = sw.price;
      } else {
        if (lastLow !== null && sw.price > lastLow) bullLegs = Math.min(bullLegs + 1, structureLegs);
        else if (lastLow !== null) bearLegs = Math.min(bearLegs + 1, structureLegs);
        if (lastLow !== null && sw.price < lastLow) bearLegs = Math.min(bearLegs + 1, structureLegs);
        else if (lastLow !== null) bearLegs = Math.max(bearLegs - 1, 0);
        lastLow = sw.price;
      }
      swingPtr++;

      if (bullLegs >= structureLegs) currentStructure = "bull";
      else if (bearLegs >= structureLegs) currentStructure = "bear";
    }

    if (currentStructure === "bull") mssBull[i] = 1;
    else if (currentStructure === "bear") mssBear[i] = 1;
  }

  return { mssBull, mssBear };
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Compute all SMC/ICT series for the given candle array.
 *
 * Returns a SeriesMap-compatible Map where each key is an SMC indicator name
 * and each value is an array of 0/1 (or null during warm-up) aligned with candles.
 *
 * Series produced:
 *   SWING_HIGH, SWING_LOW
 *   BOS_BULL, BOS_BEAR
 *   CHOCH_BULL, CHOCH_BEAR
 *   OB_BULL, OB_BEAR
 *   FVG_BULL, FVG_BEAR
 *   PREMIUM, DISCOUNT
 *   LIQSWEEP_HIGH, LIQSWEEP_LOW
 *   DISP_BULL, DISP_BEAR
 *   WICK_BULL, WICK_BEAR
 *   MSS_BULL, MSS_BEAR
 */
export function buildSmcSeries(
  candles: HistCandle[],
  config: SmcConfig = {},
): Map<string, (number | null)[]> {
  const cfg = { ...DEFAULTS, ...config };
  const n = candles.length;
  const series = new Map<string, (number | null)[]>();

  let resolvedSwingLookback = 3;
  if (cfg.swingLookback === "auto") {
    // Auto detect: >=15m (900s) use 5, else use 3
    if (cfg.timeframe && cfg.timeframe >= 900) {
      resolvedSwingLookback = 5;
    } else {
      resolvedSwingLookback = 3;
    }
  } else if (typeof cfg.swingLookback === "number") {
    resolvedSwingLookback = cfg.swingLookback;
  }

  if (n < resolvedSwingLookback * 2 + 2) {
    // Not enough data — return all-zero series so conditions evaluate to false
    for (const name of SMC_SERIES_NAMES) {
      series.set(name, zeros(n));
    }
    return series;
  }

  // ── ATR (needed for displacement) ─────────────────────────────────────────
  const atrSeries = calcAtr(candles, 14);

  // ── Swing points ──────────────────────────────────────────────────────────
  const { swingHighs, swingLows } = detectSwings(candles, resolvedSwingLookback);

  // ── Swing series ──────────────────────────────────────────────────────────
  const { swingHighSeries, swingLowSeries } = buildSwingSeries(
    candles,
    swingHighs,
    swingLows,
  );
  series.set("SWING_HIGH", swingHighSeries);
  series.set("SWING_LOW", swingLowSeries);

  // ── BOS / CHoCH ───────────────────────────────────────────────────────────
  const { bosBull, bosBear, chochBull, chochBear } = buildBosChochSeries(
    candles,
    swingHighs,
    swingLows,
  );
  series.set("BOS_BULL", bosBull);
  series.set("BOS_BEAR", bosBear);
  series.set("CHOCH_BULL", chochBull);
  series.set("CHOCH_BEAR", chochBear);

  // ── Order Blocks ──────────────────────────────────────────────────────────
  const { obBull, obBear } = buildOrderBlockSeries(
    candles,
    bosBull,
    bosBear,
    cfg.obLookback,
  );
  series.set("OB_BULL", obBull);
  series.set("OB_BEAR", obBear);

  // ── Fair Value Gaps ───────────────────────────────────────────────────────
  const { fvgBull, fvgBear } = buildFvgSeries(candles, cfg.fvgLookback);
  series.set("FVG_BULL", fvgBull);
  series.set("FVG_BEAR", fvgBear);

  // ── Premium / Discount ────────────────────────────────────────────────────
  const { premium, discount } = buildPremiumDiscountSeries(
    candles,
    swingHighs,
    swingLows,
  );
  series.set("PREMIUM", premium);
  series.set("DISCOUNT", discount);

  // ── Liquidity Sweeps ──────────────────────────────────────────────────────
  const { liqSweepHigh, liqSweepLow } = buildLiquiditySweepSeries(
    candles,
    swingHighs,
    swingLows,
  );
  series.set("LIQSWEEP_HIGH", liqSweepHigh);
  series.set("LIQSWEEP_LOW", liqSweepLow);

  // ── Displacement ──────────────────────────────────────────────────────────
  const { dispBull, dispBear } = buildDisplacementSeries(
    candles,
    atrSeries,
    cfg.displacementMultiplier,
  );
  series.set("DISP_BULL", dispBull);
  series.set("DISP_BEAR", dispBear);

  // ── Rejection Wicks ───────────────────────────────────────────────────────
  const { wickBull, wickBear } = buildRejectionWickSeries(candles, cfg.wickRatio);
  series.set("WICK_BULL", wickBull);
  series.set("WICK_BEAR", wickBear);

  // ── Market Structure State ────────────────────────────────────────────────
  const { mssBull, mssBear } = buildMarketStructureSeries(
    candles,
    swingHighs,
    swingLows,
    cfg.structureLegs,
  );
  series.set("MSS_BULL", mssBull);
  series.set("MSS_BEAR", mssBear);

  return series;
}

/** All SMC series names — used for validation and UI dropdowns */
export const SMC_SERIES_NAMES = [
  "SWING_HIGH",
  "SWING_LOW",
  "BOS_BULL",
  "BOS_BEAR",
  "CHOCH_BULL",
  "CHOCH_BEAR",
  "OB_BULL",
  "OB_BEAR",
  "FVG_BULL",
  "FVG_BEAR",
  "PREMIUM",
  "DISCOUNT",
  "LIQSWEEP_HIGH",
  "LIQSWEEP_LOW",
  "DISP_BULL",
  "DISP_BEAR",
  "WICK_BULL",
  "WICK_BEAR",
  "MSS_BULL",
  "MSS_BEAR",
] as const;

export type SmcSeriesName = (typeof SMC_SERIES_NAMES)[number];
