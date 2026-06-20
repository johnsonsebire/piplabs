import type { Candle } from "@/hooks/use-deriv-ws";

export type IndicatorKind = "MA" | "RSI" | "MACD" | "STOCH" | "BB" | "CCI" | "ATR" | "ADX" | "ICH" | "SUPERT" | "PSAR" | "DONCH" | "KELT" | "OBV" | "CMF" | "VWAP" | "CUSTOM";

export interface IndicatorConfig {
  type: IndicatorKind;
  subtype?: "SMA" | "EMA" | "WMA" | "TMA";
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  kPeriod?: number;
  dPeriod?: number;
  smooth?: number;
  deviations?: number;
  overbought?: number;
  oversold?: number;
  color?: string;
  thickness?: number;
  code?: string;
  // Ichimoku
  conversionPeriod?: number;
  basePeriod?: number;
  laggingSpan2Period?: number;
  displacement?: number;
  // Supertrend
  multiplier?: number;
  // PSAR
  start?: number;
  increment?: number;
  maximum?: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export interface IndicatorSeries {
  id: string;
  name: string;
  pane: "overlay" | "oscillator";
  color: string;
  thickness: number;
  data: LinePoint[];
  yMin?: number;
  yMax?: number;
  guides?: { value: number; color: string }[];
  oscillatorKey?: string;
  additionalSeries?: { name: string; color: string; data: any[]; thickness?: number; type?: "line" | "histogram" | "area" | "baseline"; baseValue?: number; topColor?: string; bottomColor?: string }[];
}

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

function wma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const weightSum = (period * (period + 1)) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let s = 0;
    for (let j = 0; j < period; j++) s += values[i - j] * (period - j);
    out.push(s / weightSum);
  }
  return out;
}

function tma(values: number[], period: number): (number | null)[] {
  const half = Math.ceil(period / 2);
  const first = sma(values, half);
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i < half - 1) continue;
    let s = 0; let ok = true;
    for (let j = 0; j < half; j++) {
      const v = first[i - j];
      if (v == null) { ok = false; break; }
      s += v;
    }
    if (ok) out[i] = s / half;
  }
  return out;
}

function stddev(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let mean = 0;
    for (let j = 0; j < period; j++) mean += values[i - j];
    mean /= period;
    let sq = 0;
    for (let j = 0; j < period; j++) sq += (values[i - j] - mean) ** 2;
    out.push(Math.sqrt(sq / period));
  }
  return out;
}

function toPoints(candles: Candle[], values: (number | null)[]): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) out.push({ time: candles[i].time, value: v });
  }
  return out;
}

export function parseIndicatorConfig(raw: string | null | undefined, fallbackCode?: string): IndicatorConfig | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj.type && fallbackCode) {
      const code = fallbackCode.toUpperCase();
      if (["SMA", "EMA", "WMA", "TMA"].includes(code)) {
        return { type: "MA", subtype: code as any, ...obj };
      }
      if (code === "RSI") return { type: "RSI", ...obj };
      if (code === "MACD") return { type: "MACD", ...obj };
      if (code === "ADX") return { type: "ADX", ...obj };
      if (code === "ICH") return { type: "ICH", ...obj };
      if (code === "SUPERT") return { type: "SUPERT", ...obj };
      if (code === "PSAR") return { type: "PSAR", ...obj };
      if (code === "DONCH") return { type: "DONCH", ...obj };
      if (code === "KELT") return { type: "KELT", ...obj };
      if (code === "OBV") return { type: "OBV", ...obj };
      if (code === "CMF") return { type: "CMF", ...obj };
      if (code === "VWAP") return { type: "VWAP", ...obj };
    }
    return obj as IndicatorConfig;
  } catch {
    return null;
  }
}

export function computeIndicator(id: string, name: string, cfg: IndicatorConfig, candles: Candle[]): IndicatorSeries | null {
  if (candles.length === 0) return null;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const color = cfg.color || "#00ff88";
  const thickness = cfg.thickness || 1;
  const volumes = candles.map(c => c.volume || 0);

  if (cfg.type === "MA") {
    const period = cfg.period || 14;
    const sub = cfg.subtype || "EMA";
    const fn = sub === "SMA" ? sma : sub === "WMA" ? wma : sub === "TMA" ? tma : ema;
    return {
      id, name, pane: "overlay", color, thickness,
      data: toPoints(candles, fn(closes, period)),
    };
  }

  if (cfg.type === "BB") {
    const period = cfg.period || 20;
    const dev = cfg.deviations || 2;
    const mid = sma(closes, period);
    const sd = stddev(closes, period);
    const upper = mid.map((m, i) => (m == null || sd[i] == null ? null : m + dev * (sd[i] as number)));
    const lower = mid.map((m, i) => (m == null || sd[i] == null ? null : m - dev * (sd[i] as number)));
    return {
      id, name, pane: "overlay", color, thickness,
      data: toPoints(candles, mid),
      additionalSeries: [
        { name: `${name} Upper`, color, thickness: 1, data: toPoints(candles, upper) },
        { name: `${name} Lower`, color, thickness: 1, data: toPoints(candles, lower) },
      ],
    };
  }

  if (cfg.type === "RSI") {
    const period = cfg.period || 14;
    const gains: number[] = [0];
    const losses: number[] = [0];
    for (let i = 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      gains.push(Math.max(0, d));
      losses.push(Math.max(0, -d));
    }
    const avgGain: (number | null)[] = [];
    const avgLoss: (number | null)[] = [];
    let g = 0, l = 0;
    for (let i = 0; i < closes.length; i++) {
      if (i < period) {
        g += gains[i]; l += losses[i];
        if (i === period - 1) { avgGain.push(g / period); avgLoss.push(l / period); }
        else { avgGain.push(null); avgLoss.push(null); }
      } else {
        const pg = avgGain[i - 1] as number;
        const pl = avgLoss[i - 1] as number;
        avgGain.push((pg * (period - 1) + gains[i]) / period);
        avgLoss.push((pl * (period - 1) + losses[i]) / period);
      }
    }
    const rsi = avgGain.map((a, i) => {
      const b = avgLoss[i];
      if (a == null || b == null) return null;
      if (b === 0) return 100;
      const rs = a / b;
      return 100 - 100 / (1 + rs);
    });
    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "RSI",
      data: toPoints(candles, rsi),
      yMin: 0, yMax: 100,
      guides: [
        { value: cfg.overbought ?? 70, color: "#ff0055" },
        { value: cfg.oversold ?? 30, color: "#00ff88" },
      ],
    };
  }

  if (cfg.type === "MACD") {
    const fast = cfg.fast || 12;
    const slow = cfg.slow || 26;
    const sig = cfg.signal || 9;
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);
    const macd = emaFast.map((f, i) => (f == null || emaSlow[i] == null ? null : f - (emaSlow[i] as number)));
    // Build signal EMA only over the valid (non-null) MACD region, then map back
    const firstValid = macd.findIndex(v => v != null);
    const signal: (number | null)[] = new Array(macd.length).fill(null);
    if (firstValid >= 0) {
      const validVals = macd.slice(firstValid).map(v => v as number);
      const sigVals = ema(validVals, sig);
      for (let i = 0; i < sigVals.length; i++) signal[firstValid + i] = sigVals[i];
    }
    const histogram: (number | null)[] = macd.map((m, i) => (m == null || signal[i] == null ? null : m - (signal[i] as number)));
    const histData = toPoints(candles, histogram).map(p => ({
      ...p,
      color: p.value >= 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)"
    }));
    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "MACD",
      data: toPoints(candles, macd),
      guides: [{ value: 0, color: "#555" }],
      additionalSeries: [
        { name: `${name} Hist`, color: "", data: histData, type: "histogram" },
        { name: `${name} Signal`, color: "#ffaa00", thickness: 1, data: toPoints(candles, signal), type: "line" },
      ],
    };
  }

  if (cfg.type === "STOCH") {
    const kP = cfg.kPeriod || 14;
    const dP = cfg.dPeriod || 3;
    const k: (number | null)[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < kP - 1) { k.push(null); continue; }
      let hh = -Infinity, ll = Infinity;
      for (let j = 0; j < kP; j++) {
        hh = Math.max(hh, highs[i - j]);
        ll = Math.min(ll, lows[i - j]);
      }
      k.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
    }
    // Compute %D only over the valid %K region
    const firstValidK = k.findIndex(v => v != null);
    const d: (number | null)[] = new Array(k.length).fill(null);
    if (firstValidK >= 0) {
      const valid = k.slice(firstValidK).map(v => v as number);
      const dVals = sma(valid, dP);
      for (let i = 0; i < dVals.length; i++) d[firstValidK + i] = dVals[i];
    }
    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "STOCH",
      data: toPoints(candles, k),
      yMin: 0, yMax: 100,
      guides: [
        { value: cfg.overbought ?? 80, color: "#ff0055" },
        { value: cfg.oversold ?? 20, color: "#00ff88" },
      ],
      additionalSeries: [
        { name: `${name} %D`, color: "#ffaa00", thickness: 1, data: toPoints(candles, d) },
      ],
    };
  }

  if (cfg.type === "CCI") {
    const period = cfg.period || 20;
    const tp = candles.map(c => (c.high + c.low + c.close) / 3);
    const maTp = sma(tp, period);
    const cci: (number | null)[] = [];
    for (let i = 0; i < tp.length; i++) {
      if (maTp[i] == null) { cci.push(null); continue; }
      let mean = 0;
      for (let j = 0; j < period; j++) mean += Math.abs(tp[i - j] - (maTp[i] as number));
      const md = mean / period;
      cci.push(md === 0 ? 0 : (tp[i] - (maTp[i] as number)) / (0.015 * md));
    }
    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "CCI",
      data: toPoints(candles, cci),
      guides: [
        { value: 100, color: "#ff0055" },
        { value: -100, color: "#00ff88" },
        { value: 0, color: "#555" },
      ],
    };
  }

  if (cfg.type === "ATR") {
    const period = cfg.period || 14;
    const tr: number[] = [0];
    for (let i = 1; i < candles.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i - 1];
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atr = ema(tr, period);
    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "ATR",
      data: toPoints(candles, atr),
    };
  }

  if (cfg.type === "ADX") {
    const period = cfg.period || 14;
    const outAdx: (number | null)[] = new Array(candles.length).fill(null);
    const tr: number[] = new Array(candles.length).fill(0);
    const plusDM: number[] = new Array(candles.length).fill(0);
    const minusDM: number[] = new Array(candles.length).fill(0);

    for (let i = 1; i < candles.length; i++) {
      const h = highs[i], l = lows[i];
      const ph = highs[i-1], pl = lows[i-1], pc = closes[i-1];
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      const upMove = h - ph;
      const downMove = pl - l;
      if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
      if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
    }

    const smooth = (prev: number, current: number) => prev - (prev / period) + current;
    let trSmoothed = 0, plusDmSmoothed = 0, minusDmSmoothed = 0;
    for (let i = 1; i <= period; i++) {
      trSmoothed += tr[i]; plusDmSmoothed += plusDM[i]; minusDmSmoothed += minusDM[i];
    }

    const dx: number[] = new Array(candles.length).fill(0);
    for (let i = period; i < candles.length; i++) {
      if (i > period) {
        trSmoothed = smooth(trSmoothed, tr[i]);
        plusDmSmoothed = smooth(plusDmSmoothed, plusDM[i]);
        minusDmSmoothed = smooth(minusDmSmoothed, minusDM[i]);
      }
      const pDI = trSmoothed === 0 ? 0 : (plusDmSmoothed / trSmoothed) * 100;
      const mDI = trSmoothed === 0 ? 0 : (minusDmSmoothed / trSmoothed) * 100;
      const diff = Math.abs(pDI - mDI);
      const sum = pDI + mDI;
      dx[i] = sum === 0 ? 0 : (diff / sum) * 100;
    }

    let adxSum = 0;
    for (let i = period; i < period * 2; i++) adxSum += dx[i];
    let prevAdx = adxSum / period;
    if (period * 2 - 1 < candles.length) outAdx[period * 2 - 1] = prevAdx;
    for (let i = period * 2; i < candles.length; i++) {
      prevAdx = ((prevAdx * (period - 1)) + dx[i]) / period;
      outAdx[i] = prevAdx;
    }

    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "ADX",
      data: toPoints(candles, outAdx),
      yMin: 0, yMax: 100,
      guides: [{ value: 25, color: "#ffaa00" }],
    };
  }

  if (cfg.type === "DONCH") {
    const period = cfg.period || 20;
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];
    const mid: (number | null)[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        upper.push(null); lower.push(null); mid.push(null);
        continue;
      }
      let h = -Infinity; let l = Infinity;
      for (let j = 0; j < period; j++) {
        h = Math.max(h, highs[i - j]);
        l = Math.min(l, lows[i - j]);
      }
      upper.push(h); lower.push(l); mid.push((h + l) / 2);
    }
    return {
      id, name, pane: "overlay", color, thickness,
      data: toPoints(candles, mid),
      additionalSeries: [
        { name: `${name} Upper`, color: "#3b82f6", data: toPoints(candles, upper) },
        { name: `${name} Lower`, color: "#3b82f6", data: toPoints(candles, lower) }
      ]
    };
  }

  if (cfg.type === "KELT") {
    const period = cfg.period || 20;
    const mult = cfg.multiplier || 2;
    const mid = ema(closes, period);
    const tr: number[] = [0];
    for (let i = 1; i < candles.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i - 1];
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atr = ema(tr, period);
    const upper = mid.map((m, i) => m == null || atr[i] == null ? null : m + mult * (atr[i] as number));
    const lower = mid.map((m, i) => m == null || atr[i] == null ? null : m - mult * (atr[i] as number));
    return {
      id, name, pane: "overlay", color, thickness,
      data: toPoints(candles, mid),
      additionalSeries: [
        { name: `${name} Upper`, color: "#a855f7", data: toPoints(candles, upper) },
        { name: `${name} Lower`, color: "#a855f7", data: toPoints(candles, lower) }
      ]
    };
  }

  if (cfg.type === "OBV") {
    const obv: (number | null)[] = [0];
    let sum = 0;
    for (let i = 1; i < candles.length; i++) {
      if (closes[i] > closes[i - 1]) sum += volumes[i];
      else if (closes[i] < closes[i - 1]) sum -= volumes[i];
      obv.push(sum);
    }
    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "OBV",
      data: toPoints(candles, obv),
    };
  }

  if (cfg.type === "CMF") {
    const period = cfg.period || 20;
    const cmf: (number | null)[] = [];
    const mfvs: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      const h = highs[i], l = lows[i], c = closes[i], v = volumes[i];
      const mfm = h !== l ? ((c - l) - (h - c)) / (h - l) : 0;
      mfvs.push(mfm * v);
    }
    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        cmf.push(null);
        continue;
      }
      let sumMfv = 0; let sumV = 0;
      for (let j = 0; j < period; j++) {
        sumMfv += mfvs[i - j];
        sumV += volumes[i - j];
      }
      cmf.push(sumV === 0 ? 0 : sumMfv / sumV);
    }
    return {
      id, name, pane: "oscillator", color, thickness,
      oscillatorKey: "CMF",
      data: toPoints(candles, cmf),
      guides: [{ value: 0, color: "#555" }],
    };
  }

  if (cfg.type === "VWAP") {
    const vwap: (number | null)[] = [];
    let sumPv = 0; let sumV = 0;
    let lastDate = "";
    for (let i = 0; i < candles.length; i++) {
      const d = new Date(candles[i].time * 1000).toISOString().split('T')[0];
      if (d !== lastDate) {
        sumPv = 0; sumV = 0; lastDate = d;
      }
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      sumPv += tp * volumes[i];
      sumV += volumes[i];
      vwap.push(sumV === 0 ? tp : sumPv / sumV);
    }
    return {
      id, name, pane: "overlay", color, thickness,
      data: toPoints(candles, vwap),
    };
  }

  if (cfg.type === "SUPERT") {
    const period = cfg.period || 10;
    const mult = cfg.multiplier || 3;
    const hl2 = candles.map(c => (c.high + c.low) / 2);
    
    const tr: number[] = [0];
    for (let i = 1; i < candles.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i - 1];
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atr = sma(tr, period);
    
    const basicUp = hl2.map((m, i) => atr[i] == null ? null : m + mult * (atr[i] as number));
    const basicDn = hl2.map((m, i) => atr[i] == null ? null : m - mult * (atr[i] as number));
    
    const finalUp: (number | null)[] = new Array(candles.length).fill(null);
    const finalDn: (number | null)[] = new Array(candles.length).fill(null);
    const supert: (number | null)[] = new Array(candles.length).fill(null);
    let dir = 1; // 1 = up trend (price > dn), -1 = down trend (price < up)
    
    for (let i = period; i < candles.length; i++) {
      if (basicUp[i] == null || basicDn[i] == null) continue;
      
      const bUp = basicUp[i] as number;
      const bDn = basicDn[i] as number;
      const pUp = finalUp[i - 1] ?? bUp;
      const pDn = finalDn[i - 1] ?? bDn;
      
      finalUp[i] = (bUp < pUp || closes[i - 1] > pUp) ? bUp : pUp;
      finalDn[i] = (bDn > pDn || closes[i - 1] < pDn) ? bDn : pDn;
      
      if (dir === 1 && closes[i] <= finalDn[i]!) dir = -1;
      else if (dir === -1 && closes[i] >= finalUp[i]!) dir = 1;
      
      supert[i] = dir === 1 ? finalDn[i] : finalUp[i];
    }
    
    const supertData = toPoints(candles, supert).map(p => {
      // Find direction for color
      const idx = candles.findIndex(c => c.time === p.time);
      let isUp = true;
      if (idx > 0 && closes[idx] < (supert[idx] as number)) isUp = false;
      return { ...p, color: isUp ? "#10b981" : "#ef4444" };
    });

    return {
      id, name, pane: "overlay", color, thickness,
      data: supertData,
    };
  }

  if (cfg.type === "PSAR") {
    const start = cfg.start || 0.02;
    const inc = cfg.increment || 0.02;
    const max = cfg.maximum || 0.2;
    
    const psar: (number | null)[] = new Array(candles.length).fill(null);
    let af = start;
    let ep = highs[0];
    let sar = lows[0];
    let isLong = true;

    for (let i = 1; i < candles.length; i++) {
      psar[i] = sar;
      if (isLong) {
        if (lows[i] < sar) {
          isLong = false;
          sar = Math.max(ep, highs[i]);
          ep = lows[i];
          af = start;
          psar[i] = sar;
        } else {
          if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + inc, max); }
          sar = sar + af * (ep - sar);
          sar = Math.min(sar, lows[i - 1] ?? sar, lows[i - 2] ?? sar);
        }
      } else {
        if (highs[i] > sar) {
          isLong = true;
          sar = Math.min(ep, lows[i]);
          ep = highs[i];
          af = start;
          psar[i] = sar;
        } else {
          if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + inc, max); }
          sar = sar + af * (ep - sar);
          sar = Math.max(sar, highs[i - 1] ?? sar, highs[i - 2] ?? sar);
        }
      }
    }
    
    return {
      id, name, pane: "overlay", color, thickness,
      data: toPoints(candles, psar), // Line series will be customized to dotted in the chart renderer
    };
  }

  if (cfg.type === "ICH") {
    const convP = cfg.conversionPeriod || 9;
    const baseP = cfg.basePeriod || 26;
    const lagP = cfg.laggingSpan2Period || 52;
    const disp = cfg.displacement || 26;

    const donchian = (p: number) => {
      const res: (number | null)[] = [];
      for (let i = 0; i < candles.length; i++) {
        if (i < p - 1) { res.push(null); continue; }
        let h = -Infinity, l = Infinity;
        for (let j = 0; j < p; j++) { h = Math.max(h, highs[i - j]); l = Math.min(l, lows[i - j]); }
        res.push((h + l) / 2);
      }
      return res;
    };

    const tenkan = donchian(convP);
    const kijun = donchian(baseP);
    const senkouA = tenkan.map((t, i) => t == null || kijun[i] == null ? null : (t + (kijun[i] as number)) / 2);
    const senkouB = donchian(lagP);

    // Shift Senkou A and B forward by displacement
    const shiftedA: (number | null)[] = new Array(disp - 1).fill(null).concat(senkouA);
    const shiftedB: (number | null)[] = new Array(disp - 1).fill(null).concat(senkouB);
    
    // We must extend the candles array logically to map the shifted values in the future
    // For simplicity of LinePoint, we can only plot up to the last candle if we don't extrapolate time
    // But we CAN extrapolate time by adding displacement * interval to the last candle.
    const extCandles = [...candles];
    if (candles.length >= 2) {
      const interval = candles[1].time - candles[0].time;
      let lastTime = candles[candles.length - 1].time;
      for (let i = 0; i < disp; i++) {
        lastTime += interval;
        extCandles.push({ ...candles[candles.length - 1], time: lastTime });
      }
    }

    return {
      id, name, pane: "overlay", color, thickness,
      data: toPoints(extCandles, tenkan),
      additionalSeries: [
        { name: "Base Line", color: "#ef4444", data: toPoints(extCandles, kijun) },
        { name: "Leading Span A", color: "#10b981", data: toPoints(extCandles, shiftedA) },
        { name: "Leading Span B", color: "#ef4444", data: toPoints(extCandles, shiftedB) },
      ]
    };
  }

  return null;
}
