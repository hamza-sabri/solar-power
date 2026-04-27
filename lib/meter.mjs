// Typed-ish client for the Siemens SENTRON PAC2200 web API.
//
// All endpoints we use are GET /data.json?type=<TYPE> and return JSON.
// No authentication needed (yet — we'll lock that down later).
//
// Each helper here normalises the raw payload into a flatter, friendlier shape
// so the rest of the codebase doesn't have to know about the meter's quirks
// (e.g. exports come back as negative numbers — we flip them to positive).

import 'dotenv/config';

const BASE_URL = (process.env.METER_BASE_URL || 'http://82.213.14.12:83').replace(/\/+$/, '');

/** Generic fetch with a small retry. Throws on non-2xx or non-JSON. */
async function fetchType(type, params = {}, { retries = 2, timeoutMs = 8000 } = {}) {
    const qs = new URLSearchParams({ type, ...params });
    const url = `${BASE_URL}/data.json?${qs.toString()}`;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                signal: ac.signal,
                headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
            return await res.json();
        } catch (e) {
            clearTimeout(timer);
            lastErr = e;
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
        }
    }
    throw lastErr;
}

/** Pull a {value, unit} subobject as a plain number. */
const num = (x) => (x && typeof x.value === 'number' ? x.value : null);

/** Live overview — the hot path, every 30 s. */
export async function getOverview() {
    const raw = await fetchType('OVERVIEW');
    const o = raw.OVERVIEW;
    if (!o) throw new Error('OVERVIEW response empty');
    return {
        localTime: o.LOCAL_TIME,
        actualTariff: (o.ACTUAL_TARIFF || '').trim(),
        // energy counters (kWh)
        imp_t1_kwh: num(o.Import_T1),
        imp_t2_kwh: num(o.Import_T2),
        exp_t1_kwh: num(o.Export_T1),
        exp_t2_kwh: num(o.Export_T2),
        today_imp_kwh: (num(o.TODAY_T1) ?? 0) + (num(o.TODAY_T2) ?? 0),
        thismonth_imp_kwh: (num(o.THISMONTH_T1) ?? 0) + (num(o.THISMONTH_T2) ?? 0),
        // power (kW)
        p_l1_kw: num(o.P_L1),
        p_l2_kw: num(o.P_L2),
        p_l3_kw: num(o.P_L3),
        p_sum_kw: num(o.P_SUM),
        va_sum_kva: num(o.VA_SUM),
        varq1_sum_kvar: num(o.VARQ1_SUM),
        pf_sum: num(o.PF_SUM),
        device_state: o.DEVICE_STATE,
    };
}

/** Per-phase voltages, currents, power factor, frequency. */
export async function getInstantaneous() {
    const raw = await fetchType('INSTANTANEOUS');
    const i = raw.INST_VALUES;
    if (!i) throw new Error('INST_VALUES response empty');
    return {
        localTime: i.LOCAL_TIME,
        v_l1: num(i.V_L1), v_l2: num(i.V_L2), v_l3: num(i.V_L3),
        v_l12: num(i.V_L12), v_l23: num(i.V_L23), v_l31: num(i.V_L31),
        i_l1: num(i.I_L1), i_l2: num(i.I_L2), i_l3: num(i.I_L3), i_n: num(i.I_N_SEL),
        p_l1_kw: num(i.P_L1), p_l2_kw: num(i.P_L2), p_l3_kw: num(i.P_L3),
        p_sum_kw: num(i.P_SUM),
        va_l1_kva: num(i.VA_L1), va_l2_kva: num(i.VA_L2), va_l3_kva: num(i.VA_L3),
        va_sum_kva: num(i.VA_SUM),
        varq1_l1: num(i.VARQ1_L1), varq1_l2: num(i.VARQ1_L2), varq1_l3: num(i.VARQ1_L3),
        varq1_sum: num(i.VARQ1_SUM),
        pf_l1: num(i.PF_L1), pf_l2: num(i.PF_L2), pf_l3: num(i.PF_L3), pf_sum: num(i.PF_SUM),
        freq_hz: num(i.FREQ),
        v_ln_avg: num(i.V_LN_AVG), v_ll_avg: num(i.V_LL_AVG),
        i_avg: num(i.I_AVG),
    };
}

/** Cumulative energy counters per tariff — a slow-moving cross-check. */
export async function getCounters() {
    const raw = await fetchType('COUNTERS');
    return raw.COUNTER || {};
}

/** Device identification — model, serial, firmware. */
export async function getProductInfo() {
    const raw = await fetchType('PRODUCT_INFO');
    return raw.PRODUCT_INFO || {};
}

/**
 * Daily / Monthly / Yearly profile rows are returned identically. They include:
 *   { OID, TS, import, export, FLAGS, DURATION, CNT: { IMP_T1, IMP_T2, EXP_T1, EXP_T2, IMP_SUM, EXP_SUM } }
 * Note: `import` is positive kWh consumed from grid that day,
 *       `export` is NEGATIVE kWh fed to grid (we flip the sign in the normaliser below).
 */
function normaliseProfileRow(r) {
    return {
        oid: r.OID,
        ts: r.TS,                                          // ISO with offset, e.g. "2026-04-26T00:00:00+01:00"
        imported_kwh: r.import ?? 0,
        exported_kwh: -1 * (r.export ?? 0),                // flip sign so it's a positive number
        flags: r.FLAGS,
        duration_seconds: Math.round((r.DURATION ?? 0) / 1000), // DURATION is in ms in the meter's protocol
        imp_t1_counter: r.CNT?.IMP_T1 ?? null,
        exp_t1_counter: -1 * (r.CNT?.EXP_T1 ?? 0),
    };
}

export async function getDailyProfile(count = 221) {
    const raw = await fetchType('DAILYPROFILE', { count });
    const root = raw.DAILYPROFILE || {};
    return {
        actualOID: root.actualOID,
        oldestOID: root.oldestOID,
        unit: root.unit,
        currentDayInst: root.INST ? normaliseProfileRow(root.INST) : null,
        rows: (root.data || []).map(normaliseProfileRow),
    };
}

export async function getMonthlyProfile(count = 25) {
    const raw = await fetchType('MONTHLYPROFILE', { count });
    const root = raw.MONTHLYPROFILE || {};
    return {
        currentMonthInst: root.INST ? normaliseProfileRow(root.INST) : null,
        rows: (root.data || []).map(normaliseProfileRow),
    };
}

export async function getYearlyProfile(count = 5) {
    const raw = await fetchType('YEARLYPROFILE', { count });
    const root = raw.YEARLYPROFILE || {};
    return {
        currentYearInst: root.INST ? normaliseProfileRow(root.INST) : null,
        rows: (root.data || []).map(normaliseProfileRow),
    };
}

/** One-shot fetch of everything useful — handy for `npm run test:meter`. */
export async function fetchAll() {
    const [overview, inst, counters, product, daily, monthly, yearly] = await Promise.all([
        getOverview(),
        getInstantaneous(),
        getCounters(),
        getProductInfo(),
        getDailyProfile(7),
        getMonthlyProfile(3),
        getYearlyProfile(3),
    ]);
    return { overview, inst, counters, product, daily, monthly, yearly };
}
