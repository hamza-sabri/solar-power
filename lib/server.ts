// Shared server-side helpers for Next.js API routes.
// Re-exports the meter client (.mjs) and provides a typed Postgres pool.

import 'dotenv/config';
import { Pool } from 'pg';

declare global {
    // eslint-disable-next-line no-var
    var __pgPool: Pool | undefined;
}

export const pool: Pool =
    global.__pgPool ||
    new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('sslmode')
            ? { rejectUnauthorized: false }
            : false,
        max: 4,
    });

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
