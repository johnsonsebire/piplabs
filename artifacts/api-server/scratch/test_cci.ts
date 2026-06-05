import fs from 'fs';
import { buildSeries } from '../src/lib/backtestEngine.js';

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

function cciUI(candles: any[], period: number) {
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
  return cci;
}

const strat = JSON.parse('{"version":2,"buy":{"enabled":true,"logic":"AND","exit":"opposite","conditions":[{"indicatorA":"EMA(3)","operator":"crosses above","indicatorB":"EMA(7)"},{"indicatorA":"CCI","operator":">","indicatorB":"25"}]},"sell":{"enabled":true,"logic":"AND","exit":"opposite","conditions":[{"indicatorA":"EMA(3)","operator":"crosses below","indicatorB":"EMA(7)"},{"indicatorA":"CCI","operator":"<=","indicatorB":"0"}]}}');
const candles = JSON.parse(fs.readFileSync('C:/www/Deriv-AI-Trader/Deriv-AI-Trader/datasets/backtest_cache/bt_30_candles.json', 'utf8'));

const map = buildSeries(candles, { buy: strat.buy, sell: strat.sell });
const engineCci = map.get("CCI")!;
const uiCci = cciUI(candles, 20);

let diffCount = 0;
for (let i = 0; i < candles.length; i++) {
  const e = engineCci[i];
  const u = uiCci[i];
  if (e !== u) {
    if (Math.abs((e || 0) - (u || 0)) > 0.0001) {
      diffCount++;
      if (diffCount < 5) console.log(`Diff at ${i}: engine=${e}, ui=${u}`);
    }
  }
}
console.log(`Total differences: ${diffCount} out of ${candles.length}`);
