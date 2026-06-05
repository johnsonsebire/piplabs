const fs = require('fs');
let tradeContent = fs.readFileSync('src/pages/trade-chart.tsx', 'utf8');

const missingFunc = `
function normaliseDirection(dir: string): "CALL" | "PUT" {
  const d = dir.toUpperCase();
  if (d === "CALL" || d === "BUY") return "CALL";
  return "PUT";
}
`;

if (!tradeContent.includes('function normaliseDirection')) {
  tradeContent = tradeContent.replace(
    'function TradeChartRenderer',
    missingFunc + '\nfunction TradeChartRenderer'
  );
}

// Add granularitySec to BacktestResults
if (!tradeContent.includes('granularitySec?: number')) {
  tradeContent = tradeContent.replace(
    'type BacktestResults = {',
    'type BacktestResults = {\n  granularitySec?: number;'
  );
}

// Ensure useListStrategies is imported
if (tradeContent.includes('useListStrategies') && !tradeContent.includes('import { useListStrategies')) {
  tradeContent = tradeContent.replace(
    'import {\n  useListBacktests,\n  getListBacktestsQueryKey,\n} from "@workspace/api-client-react";',
    'import {\n  useListBacktests,\n  getListBacktestsQueryKey,\n  useListStrategies,\n  useListIndicators,\n} from "@workspace/api-client-react";'
  );
}

fs.writeFileSync('src/pages/trade-chart.tsx', tradeContent);
console.log('Fixed types in trade-chart.tsx');
