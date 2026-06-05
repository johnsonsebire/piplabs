import { config } from 'dotenv';
import pg from 'pg';

config({ path: '../../.env' });

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  
  const backtestRes = await client.query('SELECT * FROM "backtests" WHERE id = $1', [25]);
  if (backtestRes.rows.length === 0) {
    console.log('No backtest found');
    process.exit(0);
  }
  
  const backtest = backtestRes.rows[0];
  console.log('Backtest:', JSON.stringify(backtest, null, 2));

  const strategyRes = await client.query('SELECT * FROM "strategies" WHERE id = $1', [backtest.strategy_id]);
  const strategy = strategyRes.rows[0];
  console.log('Strategy:', JSON.stringify(strategy, null, 2));

  process.exit(0);
}

main().catch(console.error);
