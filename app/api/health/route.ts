import { NextResponse } from 'next/server';
import { pool } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Health/diagnostic endpoint. Hit https://YOUR-DOMAIN/api/health from any
 * browser — it'll tell you exactly what's reachable and what isn't.
 *
 * NEVER returns the raw DATABASE_URL (would leak credentials); only the
 * shape (host, masked password length, etc).
 */
export async function GET() {
    const out: Record<string, any> = {
        ts: new Date().toISOString(),
        node: process.version,
        env: {
            DATABASE_URL_present: !!process.env.DATABASE_URL,
            METER_BASE_URL: process.env.METER_BASE_URL || null,
            NODE_ENV: process.env.NODE_ENV || null,
        },
    };

    // Inspect (but never reveal) the DATABASE_URL shape
    if (process.env.DATABASE_URL) {
        try {
            const u = new URL(process.env.DATABASE_URL);
            out.env.db_url_shape = {
                protocol: u.protocol,
                host: u.host,
                user: u.username || null,
                password_length: u.password ? u.password.length : 0,
                database: u.pathname.replace(/^\//, '') || null,
                sslmode: u.searchParams.get('sslmode'),
                channel_binding: u.searchParams.get('channel_binding'),
            };
        } catch (e: any) {
            out.env.db_url_parse_error = e.message;
        }
    }

    // Try a simple connection
    try {
        const start = Date.now();
        const r = await pool.query('SELECT 1 AS ok');
        out.db_connect = { ok: r.rows[0].ok === 1, ms: Date.now() - start };
    } catch (e: any) {
        out.db_connect = { ok: false, error: e.message, code: e.code };
        return NextResponse.json(out, { status: 503 });
    }

    // Count rows in each table — confirms schema is applied + has data
    try {
        const tables = ['daily_energy', 'monthly_energy', 'yearly_energy',
                        'samples', 'events', 'alerts', 'schedules', 'alert_rules'];
        const counts: Record<string, number | string> = {};
        for (const t of tables) {
            try {
                const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
                counts[t] = r.rows[0].n;
            } catch (e: any) {
                counts[t] = `ERROR: ${e.message}`;
            }
        }
        out.tables = counts;
    } catch (e: any) {
        out.tables_error = e.message;
    }

    // Try the meter
    try {
        const start = Date.now();
        const meterUrl = (process.env.METER_BASE_URL || '').replace(/\/+$/, '');
        const res = await fetch(`${meterUrl}/data.json?type=PRODUCT_INFO`, {
            signal: AbortSignal.timeout(5000),
        });
        out.meter = {
            ok: res.ok,
            status: res.status,
            ms: Date.now() - start,
        };
    } catch (e: any) {
        out.meter = { ok: false, error: e.message };
    }

    return NextResponse.json(out);
}
