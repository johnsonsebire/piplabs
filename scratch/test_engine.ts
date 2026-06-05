import fs from "fs/promises";

async function run() {
  const candlesJson = await fs.readFile("../datasets/backtest_cache/bt_29_candles.json", "utf-8");
  const candles = JSON.parse(candlesJson);

  let buyConditionsMet = 0;
  let sellConditionsMet = 0;
  
  for (let i = 1; i < candles.length - 1; i++) {
    const c0 = candles[i - 1];
    const c1 = candles[i];
    
    // EMA(3) crosses above EMA(7)
    const emaCrossUp = c0.indicators.EMA_3 <= c0.indicators.EMA_7 && c1.indicators.EMA_3 > c1.indicators.EMA_7;
    // CCI > 25
    const cciUp = c1.indicators.CCI > 25;
    // STOCH_K >= 20
    const stochKUp = c1.indicators.STOCH_K >= 20;
    // STOCH_D >= 20
    const stochDUp = c1.indicators.STOCH_D >= 20;

    if (emaCrossUp && cciUp && stochKUp && stochDUp) {
      buyConditionsMet++;
    }

    // EMA(3) crosses below EMA(7)
    const emaCrossDown = c0.indicators.EMA_3 >= c0.indicators.EMA_7 && c1.indicators.EMA_3 < c1.indicators.EMA_7;
    // CCI <= 0
    const cciDown = c1.indicators.CCI <= 0;
    // STOCH_K >= 80
    const stochKDown = c1.indicators.STOCH_K >= 80;
    // STOCH_D >= 80
    const stochDDown = c1.indicators.STOCH_D >= 80;

    if (emaCrossDown && cciDown && stochKDown && stochDDown) {
      sellConditionsMet++;
    }
  }

  console.log({ buyConditionsMet, sellConditionsMet });
}

run().catch(console.error);
