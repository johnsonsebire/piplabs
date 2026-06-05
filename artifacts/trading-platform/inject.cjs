const fs = require('fs');
let trade = fs.readFileSync('src/pages/trade-chart.tsx', 'utf8');
const renderer = fs.readFileSync('scratch_renderer.txt', 'utf8');
const start = trade.indexOf('function TradeChartRenderer');
const end = trade.indexOf('export default function TradeChartPage');
trade = trade.slice(0, start) + renderer + '\n\n' + trade.slice(end);

if (!trade.includes('computeIndicator')) {
  trade = trade.replace('import { useLocation } from "wouter";', 'import { useLocation } from "wouter";\nimport { parseIndicatorConfig, computeIndicator } from "@/lib/indicators";');
}
if (!trade.includes('useListStrategies')) {
  trade = trade.replace('import { useQuery } from "@tanstack/react-query";', 'import { useQuery } from "@tanstack/react-query";\nimport { useListStrategies, useListIndicators } from "@/lib/api-client-react";');
}
if (!trade.includes('const { data: strategies }')) {
  trade = trade.replace(
    'const backtest = Array.isArray(backtests) ? backtests.find(b => b.id === backtestId) : undefined;',
    'const { data: strategies } = useListStrategies({});\n  const { data: userIndicators } = useListIndicators({});\n\n  const backtest = Array.isArray(backtests) ? backtests.find(b => b.id === backtestId) : undefined;\n  const strategy = strategies?.find(s => s.id === backtest?.strategyId);'
  );
}
trade = trade.replace('<TradeChartRenderer trade={trade} candles={candles} />', '<TradeChartRenderer trade={trade} candles={candles} strategy={strategy} userIndicators={userIndicators} />');

fs.writeFileSync('src/pages/trade-chart.tsx', trade);
