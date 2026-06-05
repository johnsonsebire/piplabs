import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const session = await client.query('SELECT id, total_pnl FROM auto_trading_sessions ORDER BY id DESC LIMIT 1');
if (session.rowCount > 0) {
  const s = session.rows[0];
  const newPnl = Number(s.total_pnl) + 12.5;
  await client.query('UPDATE auto_trading_sessions SET total_pnl = ' + newPnl + ' WHERE id = ' + s.id);
  console.log('Session updated', s.id, newPnl);
}
await client.end();
console.log('Done');
