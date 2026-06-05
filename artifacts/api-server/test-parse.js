const rawCode = JSON.stringify({
  version: 2,
  buy: {
    enabled: true,
    conditions: [],
    marketFilters: [],
    triggers: [
      { indicatorA: "MACD", operator: "CROSS_UP", indicatorB: "MACD_SIGNAL" }
    ],
    confirmations: []
  },
  sell: {
    enabled: true,
    conditions: [],
    marketFilters: [],
    triggers: [
      { indicatorA: "MACD", operator: "CROSS_DOWN", indicatorB: "MACD_SIGNAL" }
    ],
    confirmations: []
  }
});

function parseStrategyDirections(rawCode) {
  if (!rawCode) return [];
  let parsed;
  try { parsed = JSON.parse(rawCode); } catch { return []; }
  const out = [];
  if (parsed?.buy && parsed.buy.enabled !== false) {
    const hasRules = (parsed.buy.conditions?.length || 0) + (parsed.buy.marketFilters?.length || 0) + (parsed.buy.triggers?.length || 0) > 0;
    if (hasRules) out.push("buy");
  }
  if (parsed?.sell && parsed.sell.enabled !== false) {
    const hasRules = (parsed.sell.conditions?.length || 0) + (parsed.sell.marketFilters?.length || 0) + (parsed.sell.triggers?.length || 0) > 0;
    if (hasRules) out.push("sell");
  }
  return out;
}

console.log("Directions:", parseStrategyDirections(rawCode));
