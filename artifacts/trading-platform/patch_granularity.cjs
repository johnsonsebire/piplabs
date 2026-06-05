const fs = require('fs');

let tradeContent = fs.readFileSync('src/pages/trade-chart.tsx', 'utf8');

tradeContent = tradeContent.replace(
  'const granularity = pickGranularity(tradeDuration);',
  'const granularity = results?.granularitySec || pickGranularity(tradeDuration);'
);

fs.writeFileSync('src/pages/trade-chart.tsx', tradeContent);
console.log('Successfully patched granularity in trade-chart.tsx');
