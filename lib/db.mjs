// Tiny shared Postgres pool. `import { sql } from './db.mjs'` and you're done.
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    console.error('[db] DATABASE_URL not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon needs SSL; their connection string already includes ?sslmode=require, but
    // we set it here too so it works against self-hosted Postgres without SSL.
    ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    max: 4,
});

/** Tagged template for parameterised SQL. Returns rows. */
export async function sql(strings, ...values) {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
    const res = await pool.query(text, values);
    return res.rows;
}

export async function close() {
    await pool.end();
}
