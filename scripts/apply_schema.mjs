import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log('[schema] connected');
await client.query(sql);
console.log('[schema] applied');
const { rows } = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
`);
console.log('[schema] tables:', rows.map(r => r.tablename).join(', '));
await client.end();
