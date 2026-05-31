import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const res = await client.query('SELECT name, code FROM strategies');
  console.log(JSON.stringify(res.rows, null, 2));
  client.end();
}).catch(e => {
  console.error(e);
  process.exit(1);
});
