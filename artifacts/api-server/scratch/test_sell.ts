import fs from 'fs';
import { buildSeries, evalLeg } from '../src/lib/backtestEngine.js';

const strat = JSON.parse('{"version":2,"buy":{"enabled":true,"logic":"AND","exit":"opposite","conditions":[{"indicatorA":"EMA(3)","operator":"crosses above","indicatorB":"EMA(7)"},{"indicatorA":"CCI","operator":">","indicatorB":"25"},{"indicatorA":"STOCH_K","operator":">=","indicatorB":"20"},{"indicatorA":"STOCH_D","operator":">=","indicatorB":"20"}]},"sell":{"enabled":true,"logic":"AND","exit":"opposite","conditions":[{"indicatorA":"EMA(3)","operator":"crosses below","indicatorB":"EMA(7)"},{"indicatorA":"CCI","operator":"<=","indicatorB":"0"},{"indicatorA":"STOCH_K","operator":">=","indicatorB":"80"},{"indicatorA":"STOCH_D","operator":">=","indicatorB":"80"}]}}');
const candles = JSON.parse(fs.readFileSync('C:/www/Deriv-AI-Trader/Deriv-AI-Trader/datasets/backtest_cache/bt_30_candles.json', 'utf8'));
console.log('Candles:', candles.length);
const map = buildSeries(candles, { buy: strat.buy, sell: strat.sell });
const closes = candles.map((c: any) => c.close);
let buyCount = 0;
let sellCount = 0;
for (let i = 1; i < candles.length - 1; i++) {
  const isBuy = evalLeg(strat.buy, i, map, closes);
  const isSell = evalLeg(strat.sell, i, map, closes);
  if (isBuy) buyCount++;
  if (isSell) sellCount++;
}
console.log(`Buy conditions met: ${buyCount} times`);
console.log(`Sell conditions met: ${sellCount} times`);
