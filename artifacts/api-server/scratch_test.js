import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const backtest = await prisma.backtest.findFirst({
    orderBy: { id: 'desc' }
  });
  if (!backtest) {
    console.log("No backtests found.");
    return;
  }
  console.log(`Latest Backtest ID: ${backtest.id}`);
  
  const strat = await prisma.strategy.findUnique({
    where: { id: backtest.strategyId }
  });
  console.log(`Strategy: ${strat?.name}`);
  console.log(`Code: ${strat?.code}`);
  
  const results = JSON.parse(backtest.results);
  const trades = results.trades || [];
  console.log(`\nTotal trades: ${trades.length}`);
  if (trades.length > 0) {
    console.log("Sample trades:");
    for (let i=0; i<Math.min(3, trades.length); i++) {
      console.log(trades[i]);
    }
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
