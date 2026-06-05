import fs from 'fs';

function engineCci(candles, period) {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const out = new Array(candles.length).fill(null);
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

function sma(values, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function cciUI(candles, period) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3);
  const maTp = sma(tp, period);
  const cci = [];
  for (let i = 0; i < tp.length; i++) {
    if (maTp[i] == null) { cci.push(null); continue; }
    let mean = 0;
    for (let j = 0; j < period; j++) mean += Math.abs(tp[i - j] - maTp[i]);
    const md = mean / period;
    cci.push(md === 0 ? 0 : (tp[i] - maTp[i]) / (0.015 * md));
  }
  return cci;
}

const candles = JSON.parse(fs.readFileSync('C:/www/Deriv-AI-Trader/Deriv-AI-Trader/datasets/backtest_cache/bt_30_candles.json', 'utf8'));

const engCci = engineCci(candles, 20);
const uCci = cciUI(candles, 20);

let diffCount = 0;
for (let i = 0; i < candles.length; i++) {
  const e = engCci[i];
  const u = uCci[i];
  if (e !== u) {
    if (Math.abs((e || 0) - (u || 0)) > 0.0001) {
      diffCount++;
      if (diffCount < 5) console.log(`Diff at ${i}: engine=${e}, ui=${u}`);
    }
  }
}
console.log(`Total differences: ${diffCount} out of ${candles.length}`);
