// Shared server-side helpers for Next.js API routes.
// Re-exports the meter client (.mjs) and provides a typed Postgres pool.

import 'dotenv/config';
import { Pool } from 'pg';

declare global {
    // eslint-disable-next-line no-var
    var __pgPool: Pool | undefined;
}

function makePool(): Pool {
    const url = process.env.DATABASE_URL;
    if (!url) {
        // Don't crash the module — let API routes return informative errors instead.
        console.error('[server] DATABASE_URL is not set; DB-backed routes will fail');
    }
    return new Pool({
        connectionString: url,
        ssl: url?.includes('sslmode') ? { rejectUnauthorized: false } : false,
        max: 4,
        // fail-fast on first bad credentials instead of waiting forever
        connectionTimeoutMillis: 8_000,
    });
}

export const pool: Pool = global.__pgPool || makePool();

if (process.env.NODE_ENV !== 'production') global.__pgPool = pool;

export async function q<T = any>(text: string, values: any[] = []): Promise<T[]> {
    const res = await pool.query(text, values);
    return res.rows as T[];
}

// Re-export meter helpers (the .mjs file imports cleanly into Next/TS)
// @ts-ignore – .mjs has no types yet, but Next handles it.
export {
    getOverview, getInstantaneous, getCounters,
    getDailyProfile, getMonthlyProfile, getYearlyProfile,
    getProductInfo,
} from './meter.mjs';

export const tariffs = {
    import: Number(process.env.TARIFF_IMPORT_PER_KWH ?? 0.78),
    export: Number(process.env.TARIFF_EXPORT_PER_KWH ?? 0.40),
};
