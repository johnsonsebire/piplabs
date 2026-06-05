import pg from "pg";
const c = new pg.Client({connectionString:'postgresql://neondb_owner:npg_9uS4ZRtvfrTW@ep-dry-resonance-ap4y30zo.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require'});
c.connect().then(()=>c.query("SELECT id, name, code FROM strategies")).then(r=>console.log(JSON.stringify(r.rows, null, 2))).then(()=>c.end()).catch(console.error);
