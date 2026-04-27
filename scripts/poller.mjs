// Long-running poller. Run as:
//
//   node scripts/poller.mjs              # foreground
//   pm2 start scripts/poller.mjs --name solar-poller
//   systemctl ... etc.
//
// Three independent loops, each with their own cadence:
//
//   1. fast loop        — OVERVIEW + INSTANTANEOUS merged into a `samples` row
//                         (default every 30 s)
//   2. daily-roll loop  — refresh DAILYPROFILE so today's totals stay current
//                         and any retroactive corrections from the meter are
//                         picked up (default every 60 min)
//   3. month/year loop  — refresh MONTHLYPROFILE/YEARLYPROFILE (default 6 h)
//
// All three share the same Postgres pool and the same retry-on-meter-error
// behaviour. If the meter is unreachable for >2 minutes we open an `alerts`
// row tagged 'meter_offline' and resolve it when the meter comes back.

import 'dotenv/config';
import {
    getOverview, getInstantaneous,
    getDailyProfile, getMonthlyProfile, getYearlyProfile,
    getProductInfo,
} from '../lib/meter.mjs';
import { pool, close } from '../lib/db.mjs';

const POLL_OVERVIEW_SEC      = Number(process.env.POLL_OVERVIEW_SEC      || 30);
const POLL_INSTANTANEOUS_SEC = Number(process.env.POLL_INSTANTANEOUS_SEC || 60);
const POLL_DAILY_PROFILE_MIN = Number(process.env.POLL_DAILY_PROFILE_MIN || 60);

let consecutiveMeterErrors = 0;
let meterOfflineAlertId = null;

async function openOfflineAlert(err) {
    if (meterOfflineAlertId) return;
    const { rows } = await pool.query(
        `INSERT INTO alerts (severity, category, title, body, metrics)
         VALUES ('warn','meter_offline','Meter is unreachable',$1,$2)
         RETURNING id`,
        [`Last error: ${String(err?.message || err)}`, JSON.stringify({ ts: new Date().toISOString() })]
    );
    meterOfflineAlertId = rows[0].id;
    console.error(`[poller] meter offline — opened alert #${meterOfflineAlertId}`);
}

async function closeOfflineAlert() {
    if (!meterOfflineAlertId) return;
    await pool.query(`UPDATE alerts SET acknowledged_at = NOW() WHERE id = $1`, [meterOfflineAlertId]);
    console.log(`[poller] meter back — closed alert #${meterOfflineAlertId}`);
    meterOfflineAlertId = null;
}

// ─── Sample writer ──────────────────────────────────────────────────────

let lastInst = null;            // cache the most recent INSTANTANEOUS so we can attach it to fast samples
let lastInstAt = 0;

async function writeSample() {
    let overview;
    try {
        overview = await getOverview();
    } catch (e) {
        consecutiveMeterErrors++;
        if (consecutiveMeterErrors >= 4) await openOfflineAlert(e);  // ~2 min of failure
        console.warn(`[poller] OVERVIEW failed (${consecutiveMeterErrors}): ${e.message}`);
        return;
    }
    consecutiveMeterErrors = 0;
    if (meterOfflineAlertId) await closeOfflineAlert();

    // Refresh INSTANTANEOUS on its slower cadence
    const now = Date.now();
    if (!lastInst || (now - lastInstAt) > POLL_INSTANTANEOUS_SEC * 1000) {
        try {
            lastInst = await getInstantaneous();
            lastInstAt = now;
        } catch (e) {
            console.warn(`[poller] INSTANTANEOUS failed (non-fatal): ${e.message}`);
        }
    }

    const ts = new Date(overview.localTime || Date.now());      // meter's local time, normalised
    const inst = lastInst || {};

    await pool.query(
        `INSERT INTO samples
            (ts, p_sum_kw, p_l1_kw, p_l2_kw, p_l3_kw,
             va_sum_kva, varq1_sum_kvar, pf_sum,
             v_l1, v_l2, v_l3,
             i_l1, i_l2, i_l3,
             pf_l1, pf_l2, pf_l3,
             freq_hz,
             imp_total_kwh, exp_total_kwh,
             today_imp_kwh, thismonth_imp_kwh,
             actual_tariff)
         VALUES ($1,$2,$3,$4,$5, $6,$7,$8,
                 $9,$10,$11, $12,$13,$14, $15,$16,$17, $18,
                 $19,$20, $21,$22, $23)
         ON CONFLICT (ts) DO NOTHING`,
        [
            ts,
            overview.p_sum_kw, overview.p_l1_kw, overview.p_l2_kw, overview.p_l3_kw,
            overview.va_sum_kva, overview.varq1_sum_kvar, overview.pf_sum,
            inst.v_l1 ?? null, inst.v_l2 ?? null, inst.v_l3 ?? null,
            inst.i_l1 ?? null, inst.i_l2 ?? null, inst.i_l3 ?? null,
            inst.pf_l1 ?? null, inst.pf_l2 ?? null, inst.pf_l3 ?? null,
            inst.freq_hz ?? null,
            (overview.imp_t1_kwh ?? 0) + (overview.imp_t2_kwh ?? 0),
            (overview.exp_t1_kwh ?? 0) + (overview.exp_t2_kwh ?? 0),
            overview.today_imp_kwh, overview.thismonth_imp_kwh,
            overview.actualTariff || null,
        ]
    );

    // tidy on-the-fly log so you can tail it and see things working
    const dir = (overview.p_sum_kw ?? 0) >= 0 ? 'IMP' : 'EXP';
    const kw = Math.abs(overview.p_sum_kw ?? 0).toFixed(3);
    process.stdout.write(`[${ts.toISOString()}] ${dir} ${kw} kW  today=${(overview.today_imp_kwh ?? 0).toFixed(2)} kWh\n`);
}

// ─── Daily / monthly / yearly refresh ───────────────────────────────────

async function refreshDailyProfile() {
    try {
        const daily = await getDailyProfile(45);   // last ~6 weeks; cheap, catches retroactive edits
        const text = `
            INSERT INTO daily_energy
                (day, imported_kwh, exported_kwh, flags, duration_seconds,
                 imp_t1_counter_end, exp_t1_counter_end, source, refreshed_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'meter',NOW())
            ON CONFLICT (day) DO UPDATE SET
                imported_kwh        = EXCLUDED.imported_kwh,
                exported_kwh        = EXCLUDED.exported_kwh,
                flags               = EXCLUDED.flags,
                duration_seconds    = EXCLUDED.duration_seconds,
                imp_t1_counter_end  = EXCLUDED.imp_t1_counter_end,
                exp_t1_counter_end  = EXCLUDED.exp_t1_counter_end,
                source              = 'meter',
                refreshed_at        = NOW()`;
        for (const r of daily.rows) {
            await pool.query(text, [
                r.ts.slice(0, 10), r.imported_kwh, r.exported_kwh,
                r.flags, r.duration_seconds, r.imp_t1_counter, r.exp_t1_counter,
            ]);
        }
        console.log(`[poller] daily refresh: ${daily.rows.length} rows upserted`);
    } catch (e) {
        console.warn(`[poller] daily refresh failed: ${e.message}`);
    }
}

async function refreshMonthAndYear() {
    try {
        const m = await getMonthlyProfile(13);
        for (const r of m.rows) {
            await pool.query(
                `INSERT INTO monthly_energy (month, imported_kwh, exported_kwh, duration_seconds, refreshed_at)
                 VALUES ($1,$2,$3,$4,NOW())
                 ON CONFLICT (month) DO UPDATE SET
                    imported_kwh = EXCLUDED.imported_kwh,
                    exported_kwh = EXCLUDED.exported_kwh,
                    duration_seconds = EXCLUDED.duration_seconds,
                    refreshed_at = NOW()`,
                [r.ts.slice(0, 8) + '01', r.imported_kwh, r.exported_kwh, r.duration_seconds]
            );
        }
        const y = await getYearlyProfile(5);
        for (const r of y.rows) {
            await pool.query(
                `INSERT INTO yearly_energy (year, imported_kwh, exported_kwh, refreshed_at)
                 VALUES ($1,$2,$3,NOW())
                 ON CONFLICT (year) DO UPDATE SET
                    imported_kwh = EXCLUDED.imported_kwh,
                    exported_kwh = EXCLUDED.exported_kwh,
                    refreshed_at = NOW()`,
                [Number(r.ts.slice(0, 4)), r.imported_kwh, r.exported_kwh]
            );
        }
        console.log(`[poller] month/year refresh: ${m.rows.length} months, ${y.rows.length} years`);
    } catch (e) {
        console.warn(`[poller] month/year refresh failed: ${e.message}`);
    }
}

// ─── Boot ───────────────────────────────────────────────────────────────

async function main() {
    const product = await getProductInfo().catch(() => ({}));
    console.log(`[poller] starting`);
    console.log(`[poller] meter: ${product.name || 'unknown'} (serial ${product.serial || '?'})`);
    console.log(`[poller] cadence: overview=${POLL_OVERVIEW_SEC}s, instantaneous=${POLL_INSTANTANEOUS_SEC}s, daily-refresh=${POLL_DAILY_PROFILE_MIN}min`);

    // run them once on boot, then on intervals
    await writeSample();
    await refreshDailyProfile();
    await refreshMonthAndYear();

    setInterval(writeSample, POLL_OVERVIEW_SEC * 1000);
    setInterval(refreshDailyProfile, POLL_DAILY_PROFILE_MIN * 60 * 1000);
    setInterval(refreshMonthAndYear, POLL_DAILY_PROFILE_MIN * 6 * 60 * 1000);
}

// graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
        console.log(`[poller] ${sig} received, shutting down`);
        await close();
        process.exit(0);
    });
}

main().catch(async (e) => {
    console.error('[poller] fatal:', e);
    await close();
    process.exit(1);
});
