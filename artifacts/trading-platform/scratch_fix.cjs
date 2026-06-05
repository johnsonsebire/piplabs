const fs = require('fs');

const autotradeContent = fs.readFileSync('C:/www/Deriv-AI-Trader/Deriv-AI-Trader/artifacts/trading-platform/src/pages/autotrade-chart.tsx', 'utf8');
let tradeContent = fs.readFileSync('C:/www/Deriv-AI-Trader/Deriv-AI-Trader/artifacts/trading-platform/src/pages/trade-chart.tsx', 'utf8');

// 1. Extract TradeChartRenderer from autotrade-chart
const matchRenderer = autotradeContent.match(/function TradeChartRenderer[\s\S]+?\n\}\n/);
if (!matchRenderer) throw new Error("Could not find TradeChartRenderer in autotrade-chart.tsx");

let newRenderer = matchRenderer[0];
// Replace AutoTrade with SimTrade
newRenderer = newRenderer.replace(/trade:\s*AutoTrade/g, 'trade: SimTrade');
// Replace property accesses
newRenderer = newRenderer.replace(/trade\.entryPrice/g, 'trade.entry');
newRenderer = newRenderer.replace(/trade\.exitPrice/g, 'trade.exit');
newRenderer = newRenderer.replace(/trade\.currentProfit/g, 'trade.pnl');
newRenderer = newRenderer.replace(/trade\.openedAt/g, 'trade.entryAt');
newRenderer = newRenderer.replace(/trade\.closedAt/g, 'trade.exitAt');

// 2. Replace TradeChartRenderer in trade-chart
tradeContent = tradeContent.replace(/function TradeChartRenderer[\s\S]+?\n\}\n/, newRenderer + "\n");

// 3. Ensure imports exist
if (!tradeContent.includes('parseIndicatorConfig')) {
  tradeContent = tradeContent.replace(
    /import \{ useLocation \} from "wouter";/,
    'import { useLocation } from "wouter";\nimport { parseIndicatorConfig, computeIndicator } from "@/lib/indicators";'
  );
}
if (!tradeContent.includes('useListStrategies')) {
  tradeContent = tradeContent.replace(
    /import \{ useQuery \} from "@tanstack\/react-query";/,
    'import { useQuery } from "@tanstack/react-query";\nimport { useListStrategies, useListIndicators } from "@/lib/api-client-react";'
  );
}

// 4. Update TradeChartPage to fetch strategies and pass them
// We need to inject useListStrategies and useListIndicators before the return statement of TradeChartPage
if (!tradeContent.includes('useListStrategies({}')) {
  const pageHookInjection = `
  const { data: strategies } = useListStrategies({});
  const { data: userIndicators } = useListIndicators({});
  const strategy = strategies?.find(s => s.id === backtest?.strategyId);
`;
  tradeContent = tradeContent.replace(
    /(const hasValidParams =[^;]+;)/,
    `$1\n${pageHookInjection}`
  );
}

// 5. Update the JSX where TradeChartRenderer is called
tradeContent = tradeContent.replace(
  /<TradeChartRenderer trade=\{trade\} candles=\{candles\} \/>/,
  '<TradeChartRenderer trade={trade} candles={candles} strategy={strategy} userIndicators={userIndicators} />'
);

fs.writeFileSync('C:/www/Deriv-AI-Trader/Deriv-AI-Trader/artifacts/trading-platform/src/pages/trade-chart.tsx', tradeContent);
console.log("Updated trade-chart.tsx successfully.");
