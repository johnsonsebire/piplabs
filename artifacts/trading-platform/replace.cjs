const fs = require('fs');
const autoTradeChart = fs.readFileSync('src/pages/autotrade-chart.tsx', 'utf8');
const tradeChart = fs.readFileSync('src/pages/trade-chart.tsx', 'utf8');

const match = autoTradeChart.match(/(function normaliseDirection[\s\S]+?)(?=export default function AutoTradeChartPage)/);
if (!match) throw new Error('Could not find TradeChartRenderer in autotrade-chart.tsx');
let rendererCode = match[1];

rendererCode = rendererCode.replace('trade: AutoTrade', 'trade: SimTrade');
rendererCode = rendererCode.replace('const entryPrice = trade.entryPrice ?? 0;', 'const entryPrice = trade.entry ?? 0;');
rendererCode = rendererCode.replace('const exitPrice = trade.exitPrice ?? 0;', 'const exitPrice = trade.exit ?? 0;');
rendererCode = rendererCode.replace('const pnl = trade.currentProfit ?? 0;', 'const pnl = trade.pnl ?? 0;');
rendererCode = rendererCode.replaceAll('trade.openedAt', 'trade.entryAt');
rendererCode = rendererCode.replaceAll('trade.closedAt', 'trade.exitAt');

const match2 = tradeChart.match(/function TradeChartRenderer[\s\S]+?(?=export default function TradeChartPage)/);
if (!match2) throw new Error('Could not find TradeChartRenderer in trade-chart.tsx');
let newTradeChart = tradeChart.replace(match2[0], rendererCode);

// Add missing imports
newTradeChart = newTradeChart.replace(
  /useListBacktests,\s+getListBacktestsQueryKey,\s+} from "@workspace\/api-client-react";/,
  `useListBacktests,
  getListBacktestsQueryKey,
  useListStrategies,
  useListIndicators,
} from "@workspace/api-client-react";`
);

newTradeChart = newTradeChart.replace(
  'import { AppLayout } from "@/components/layout/AppLayout";',
  'import { AppLayout } from "@/components/layout/AppLayout";\nimport { computeIndicator, parseIndicatorConfig } from "@/lib/indicators";'
);

// Add component logic
newTradeChart = newTradeChart.replace(
  'const { data: backtests, isLoading: isBacktestsLoading } = useListBacktests(',
  `const { data: strategies } = useListStrategies({});
  const { data: userIndicators } = useListIndicators({});
  const { data: backtests, isLoading: isBacktestsLoading } = useListBacktests(`
);

newTradeChart = newTradeChart.replace(
  'const symbol = backtest?.symbol ?? "";',
  `const symbol = backtest?.symbol ?? "";
  const strategy = strategies?.find(s => s.id === backtest?.strategyId);`
);

newTradeChart = newTradeChart.replace(
  '<TradeChartRenderer trade={trade} candles={candles} />',
  '<TradeChartRenderer trade={trade} candles={candles} strategy={strategy} userIndicators={userIndicators} />'
);

fs.writeFileSync('src/pages/trade-chart.tsx', newTradeChart);
console.log('done');
