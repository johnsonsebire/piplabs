import fs from 'fs';
import { buildSeries, evalLeg } from '../src/lib/backtestEngine.js';
import { resolve } from 'path';

const strat = JSON.parse('{"version":2,"buy":{"enabled":true,"logic":"AND","exit":"opposite","conditions":[{"indicatorA":"EMA(3)","operator":"crosses above","indicatorB":"EMA(7)"},{"indicatorA":"CCI","operator":">","indicatorB":"25"},{"indicatorA":"STOCH_K","operator":">=","indicatorB":"20"},{"indicatorA":"STOCH_D","operator":">=","indicatorB":"20"}]},"sell":{"enabled":true,"logic":"AND","exit":"opposite","conditions":[{"indicatorA":"EMA(3)","operator":"crosses below","indicatorB":"EMA(7)"},{"indicatorA":"CCI","operator":"<=","indicatorB":"0"},{"indicatorA":"STOCH_K","operator":">=","indicatorB":"80"},{"indicatorA":"STOCH_D","operator":">=","indicatorB":"80"}]}}');
const candles = JSON.parse(fs.readFileSync('C:/www/Deriv-AI-Trader/Deriv-AI-Trader/datasets/backtest_cache/bt_30_candles.json', 'utf8'));
console.log('Candles:', candles.length);
const map = buildSeries(candles, { buy: strat.buy, sell: strat.sell });
const closes = candles.map((c: any) => c.close);

// We need to write a simplified evalCondition to test individual conditions
function seriesValue(ref: string, i: number, map: any, closes: number[]): number | null {
  const r = ref.trim();
  const numeric = Number(r);
  if (r !== "" && Number.isFinite(numeric) && !map.has(r)) return numeric;
  const fromMap = map.get(r) ?? map.get(r.toUpperCase());
  if (fromMap) {
    const v = fromMap[i];
    return v == null || !Number.isFinite(v) ? null : v;
  }
  const resolved = { key: r.toUpperCase() === 'EMA(3)' ? 'EMA_3' : r.toUpperCase() === 'EMA(7)' ? 'EMA_7' : r.toUpperCase() === 'CCI' ? 'CCI' : r.toUpperCase() === 'STOCH_K' ? 'STOCH_K' : r.toUpperCase() === 'STOCH_D' ? 'STOCH_D' : r };
  if (resolved) {
    const v = map.get(resolved.key)?.[i];
    return v == null || !Number.isFinite(v) ? null : v;
  }
  if (r.toUpperCase() === "CLOSE" || r.toUpperCase() === "PRICE") return closes[i];
  return null;
}

let failCounts = [0, 0, 0, 0];

for (let i = 1; i < candles.length - 1; i++) {
  strat.sell.conditions.forEach((cond: any, cIdx: number) => {
    const a0 = seriesValue(cond.indicatorA, i - 1, map, closes);
    const b0 = seriesValue(cond.indicatorB, i - 1, map, closes);
    const a1 = seriesValue(cond.indicatorA, i, map, closes);
    const b1 = seriesValue(cond.indicatorB, i, map, closes);
    if (a1 == null || b1 == null) {
      failCounts[cIdx]++;
      return;
    }

    const op = cond.operator.trim().toLowerCase();
    let res = false;
    if (op === "crosses below") {
      res = (a0 != null && b0 != null && a0 >= b0 && a1 < b1);
    } else if (op === "<=") {
      res = a1 <= b1;
    } else if (op === ">=") {
      res = a1 >= b1;
    }
    
    if (!res) {
      failCounts[cIdx]++;
    }
  });
}

console.log('Condition Failures for SELL:');
strat.sell.conditions.forEach((c: any, i: number) => {
  console.log(`[${i}] ${c.indicatorA} ${c.operator} ${c.indicatorB}: Failed ${failCounts[i]} times`);
});
