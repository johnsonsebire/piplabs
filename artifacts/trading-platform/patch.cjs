const fs = require('fs');

let tradeContent = fs.readFileSync('src/pages/trade-chart.tsx', 'utf8');
const autoContent = fs.readFileSync('src/pages/autotrade-chart.tsx', 'utf8');

// Get autotrade renderer
const autoStart = autoContent.indexOf('function TradeChartRenderer');
const autoEnd = autoContent.indexOf('export default function AutoTradeChartPage');
let renderer = autoContent.slice(autoStart, autoEnd).trim();

// Transform renderer for SimTrade
renderer = renderer.replace('trade: AutoTrade', 'trade: SimTrade');
renderer = renderer.replace(/trade\.entryPrice/g, 'trade.entry');
renderer = renderer.replace(/trade\.exitPrice/g, 'trade.exit');
renderer = renderer.replace(/trade\.currentProfit/g, 'trade.pnl');
renderer = renderer.replace(/trade\.openedAt/g, 'trade.entryAt');
renderer = renderer.replace(/trade\.closedAt/g, 'trade.exitAt');

// In trade-chart.tsx, replace the old renderer
const tradeStart = tradeContent.indexOf('function TradeChartRenderer');
const tradeEnd = tradeContent.indexOf('export default function TradeChartPage');
tradeContent = tradeContent.slice(0, tradeStart) + renderer + '\n\n' + tradeContent.slice(tradeEnd);

// Add missing imports
if (!tradeContent.includes('parseIndicatorConfig')) {
  tradeContent = tradeContent.replace(
    'import { useLocation, Link } from "wouter";',
    'import { useLocation, Link } from "wouter";\nimport { parseIndicatorConfig, computeIndicator } from "@/lib/indicators";'
  );
}

if (!tradeContent.includes('useListStrategies')) {
  tradeContent = tradeContent.replace(
    'getListBacktestsQueryKey,\n} from "@workspace/api-client-react";',
    'getListBacktestsQueryKey,\n  useListStrategies,\n  useListIndicators,\n} from "@workspace/api-client-react";'
  );
}

// Inject queries inside TradeChartPage
if (!tradeContent.includes('const { data: strategies }')) {
  tradeContent = tradeContent.replace(
    '  const backtest = Array.isArray(backtests) ? backtests.find(b => b.id === backtestId) : undefined;',
    `  const { data: strategies } = useListStrategies({});
  const { data: userIndicators } = useListIndicators({});

  const backtest = Array.isArray(backtests) ? backtests.find(b => b.id === backtestId) : undefined;
  const strategy = strategies?.find(s => s.id === backtest?.strategyId);`
  );
}

// Pass new props
tradeContent = tradeContent.replace(
  '<TradeChartRenderer trade={trade} candles={candles} />',
  '<TradeChartRenderer trade={trade} candles={candles} strategy={strategy} userIndicators={userIndicators} />'
);

fs.writeFileSync('src/pages/trade-chart.tsx', tradeContent);
console.log('Successfully patched trade-chart.tsx');
