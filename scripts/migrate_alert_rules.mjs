import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
await c.connect();

await c.query(`
    CREATE TABLE IF NOT EXISTS alert_rules (
        id                 SERIAL PRIMARY KEY,
        name               TEXT NOT NULL,
        metric             TEXT NOT NULL CHECK (metric IN
                              ('export_kw','import_kw','solar_kw','home_kw',
                               'no_solar_minutes','solar_below_for_minutes')),
        comparator         TEXT NOT NULL CHECK (comparator IN ('<','<=','>','>=')),
        threshold          NUMERIC(8,3) NOT NULL,
        enabled            BOOLEAN NOT NULL DEFAULT TRUE,
        cooldown_minutes   INTEGER NOT NULL DEFAULT 30,
        last_triggered_at  TIMESTAMPTZ,
        notes              TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS alert_rules_enabled_idx ON alert_rules (enabled) WHERE enabled = TRUE;
`);
console.log('[migrate] alert_rules table ready');
await c.end();
