import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
await c.connect();

await c.query(`
    CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN
          ('cleaning','maintenance','inspection','reading','note','other')),
        frequency_days INTEGER NOT NULL CHECK (frequency_days > 0),
        last_done_at TIMESTAMPTZ,
        next_due_at TIMESTAMPTZ NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS schedules_next_due_idx ON schedules (next_due_at) WHERE enabled = TRUE;
`);
console.log('[migrate] schedules table ready');

const { rows } = await c.query(`SELECT COUNT(*)::int AS n FROM schedules`);
console.log(`[migrate] schedules row count: ${rows[0].n}`);

await c.end();
