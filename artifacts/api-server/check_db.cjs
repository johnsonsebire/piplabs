const { Client } = require('pg');
const client = new Client('postgresql://deriv_user:deriv_pass@localhost:5432/deriv_db');
client.connect().then(() => client.query("SELECT id, status, alternate_direction FROM auto_trading_sessions WHERE status='running'")).then(res => { console.log(res.rows); client.end(); }).catch(e => console.error(e));
