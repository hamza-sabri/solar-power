// One-time historical backfill from the meter into Postgres.
//
//   node scripts/backfill.mjs                 # default: 221 daily, 25 monthly, 5 yearly
//   node scripts/backfill.mjs --daily 60      # just last 60 days of dailies
//
// Idempotent: re-running upserts everything. Safe to run any time.

import 'dotenv/config';
import { getDailyProfile, getMonthlyProfile, getYearlyProfile, getProductInfo } from '../lib/meter.mjs';
import { pool, close } from '../lib/db.mjs';

const args = process.argv.slice(2);
function arg(name, dflt) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : dflt;
}
const dailyCount = Number(arg('daily', 221));
const monthlyCount = Number(arg('monthly', 25));
const yearlyCount = Number(arg('yearly', 5));

function dayOnly(isoTs) {
    // "2026-04-26T00:00:00+01:00" → "2026-04-26"
    return isoTs.slice(0, 10);
}
function firstOfMonth(isoTs) { return isoTs.slice(0, 8) + '01'; }
function yearOf(isoTs) { return Number(isoTs.slice(0, 4)); }

async function main() {
    const product = await getProductInfo().catch(() => ({}));
    console.log(`[backfill] connected to meter: ${product.name || 'unknown'} (serial ${product.serial || '?'})`);

    // ── DAILY ────────────────────────────────────────────────────────────
    const daily = await getDailyProfile(dailyCount);
    console.log(`[backfill] daily: ${daily.rows.length} rows (range ${daily.rows.at(-1)?.ts.slice(0,10)} → ${daily.rows[0]?.ts.slice(0,10)})`);

    const dailyText = `
        INSERT INTO daily_energy
            (day, imported_kwh, exported_kwh, flags, duration_seconds,
             imp_t1_counter_end, exp_t1_counter_end, source, refreshed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'meter', NOW())
        ON CONFLICT (day) DO UPDATE SET
            imported_kwh         = EXCLUDED.imported_kwh,
            exported_kwh         = EXCLUDED.exported_kwh,
            flags                = EXCLUDED.flags,
            duration_seconds     = EXCLUDED.duration_seconds,
            imp_t1_counter_end   = EXCLUDED.imp_t1_counter_end,
            exp_t1_counter_end   = EXCLUDED.exp_t1_counter_end,
            source               = 'meter',
            refreshed_at         = NOW()`;
    let n = 0;
    for (const r of daily.rows) {
        await pool.query(dailyText, [
            dayOnly(r.ts), r.imported_kwh, r.exported_kwh,
            r.flags, r.duration_seconds, r.imp_t1_counter, r.exp_t1_counter,
        ]);
        n++;
    }
    console.log(`[backfill] daily: upserted ${n} rows`);

    // ── MONTHLY ──────────────────────────────────────────────────────────
    const monthly = await getMonthlyProfile(monthlyCount);
    console.log(`[backfill] monthly: ${monthly.rows.length} rows`);
    const monthlyText = `
        INSERT INTO monthly_energy (month, imported_kwh, exported_kwh, duration_seconds, refreshed_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (month) DO UPDATE SET
            imported_kwh = EXCLUDED.imported_kwh,
            exported_kwh = EXCLUDED.exported_kwh,
            duration_seconds = EXCLUDED.duration_seconds,
            refreshed_at = NOW()`;
    let m = 0;
    for (const r of monthly.rows) {
        await pool.query(monthlyText, [
            firstOfMonth(r.ts), r.imported_kwh, r.exported_kwh, r.duration_seconds,
        ]);
        m++;
    }
    console.log(`[backfill] monthly: upserted ${m} rows`);

    // ── YEARLY ───────────────────────────────────────────────────────────
    const yearly = await getYearlyProfile(yearlyCount);
    console.log(`[backfill] yearly: ${yearly.rows.length} rows`);
    const yearlyText = `
        INSERT INTO yearly_energy (year, imported_kwh, exported_kwh, refreshed_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (year) DO UPDATE SET
            imported_kwh = EXCLUDED.imported_kwh,
            exported_kwh = EXCLUDED.exported_kwh,
            refreshed_at = NOW()`;
    let y = 0;
    for (const r of yearly.rows) {
        await pool.query(yearlyText, [yearOf(r.ts), r.imported_kwh, r.exported_kwh]);
        y++;
    }
    console.log(`[backfill] yearly: upserted ${y} rows`);

    // ── Sanity print ─────────────────────────────────────────────────────
    const { rows: tot } = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM daily_energy)   AS days,
            (SELECT COUNT(*) FROM monthly_energy) AS months,
            (SELECT COUNT(*) FROM yearly_energy)  AS years,
            (SELECT MAX(day)  FROM daily_energy)  AS latest_day,
            (SELECT MIN(day)  FROM daily_energy)  AS oldest_day`);
    console.log(`[backfill] DB now has: ${tot[0].days} days (${tot[0].oldest_day} → ${tot[0].latest_day}), ${tot[0].months} months, ${tot[0].years} years`);
    console.log('[backfill] done.');
}

main()
    .then(() => close())
    .catch(async (e) => {
        console.error('[backfill] FAILED:', e);
        await close();
        process.exit(1);
    });
