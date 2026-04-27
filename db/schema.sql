-- Solar dashboard schema for Neon Postgres.
-- Run once:  psql "$DATABASE_URL" < db/schema.sql
--
-- Design notes:
--   * `samples` is the high-frequency live log (one row every 30-60s).
--   * `daily_energy` mirrors the meter's DAILYPROFILE plus our derived metrics
--     (weather, estimated production / consumption). Single row per day.
--   * `monthly_energy` and `yearly_energy` mirror the meter's longer-period
--     profiles for fast aggregate queries.
--   * `events` are user-marked moments ("cleaned panels", "added freezer") so
--     the UI and the AI can do before/after comparisons.
--   * `alerts` records anomalies the system detected.
--   * `weather_*` caches Open-Meteo data so we're not API-bound.
--   * `insights` caches AI-written summaries.

BEGIN;

-- ─── Live samples (every 30-60 s) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS samples (
    ts                  TIMESTAMPTZ PRIMARY KEY,
    -- net grid power: positive = importing, negative = exporting
    p_sum_kw            NUMERIC(10,4) NOT NULL,
    p_l1_kw             NUMERIC(10,4),
    p_l2_kw             NUMERIC(10,4),
    p_l3_kw             NUMERIC(10,4),
    va_sum_kva          NUMERIC(10,4),
    varq1_sum_kvar      NUMERIC(10,4),
    pf_sum              NUMERIC(6,4),
    -- per-phase electrical (only filled when INSTANTANEOUS is polled)
    v_l1                NUMERIC(7,3),
    v_l2                NUMERIC(7,3),
    v_l3                NUMERIC(7,3),
    i_l1                NUMERIC(7,3),
    i_l2                NUMERIC(7,3),
    i_l3                NUMERIC(7,3),
    pf_l1               NUMERIC(6,4),
    pf_l2               NUMERIC(6,4),
    pf_l3               NUMERIC(6,4),
    freq_hz             NUMERIC(6,3),
    -- counters at this instant (used to derive instantaneous energy deltas)
    imp_total_kwh       NUMERIC(14,5),
    exp_total_kwh       NUMERIC(14,5),
    today_imp_kwh       NUMERIC(10,4),
    thismonth_imp_kwh   NUMERIC(12,4),
    actual_tariff       TEXT
);
CREATE INDEX IF NOT EXISTS samples_ts_desc_idx ON samples (ts DESC);

-- ─── Daily energy (mirrors meter DAILYPROFILE + our derived metrics) ────
CREATE TABLE IF NOT EXISTS daily_energy (
    day                          DATE PRIMARY KEY,
    imported_kwh                 NUMERIC(10,4) NOT NULL,
    exported_kwh                 NUMERIC(10,4) NOT NULL,           -- positive number (we flip the meter's negative sign)
    net_kwh                      NUMERIC(10,4) GENERATED ALWAYS AS (imported_kwh - exported_kwh) STORED,
    flags                        BIGINT,
    duration_seconds             INTEGER,
    imp_t1_counter_end           NUMERIC(14,5),
    exp_t1_counter_end           NUMERIC(14,5),
    -- weather observation (filled by weather worker once UTC day closes)
    weather_temp_avg_c           NUMERIC(5,2),
    weather_temp_max_c           NUMERIC(5,2),
    weather_radiation_mj_m2      NUMERIC(7,3),                      -- shortwave_radiation_sum
    weather_cloud_cover_avg_pct  NUMERIC(5,2),
    weather_summary              TEXT,
    -- derived (computed nightly)
    est_solar_production_kwh     NUMERIC(10,4),                     -- best-effort estimate from grid + load model
    est_home_consumption_kwh     NUMERIC(10,4),                     -- best-effort estimate
    -- baseline expectation given weather
    expected_export_kwh          NUMERIC(10,4),
    -- provenance
    source                       TEXT NOT NULL DEFAULT 'meter' CHECK (source IN ('meter','poller','manual')),
    refreshed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS daily_energy_day_desc_idx ON daily_energy (day DESC);

-- ─── Monthly mirror ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_energy (
    month                DATE PRIMARY KEY,                          -- always the first of the month
    imported_kwh         NUMERIC(12,4) NOT NULL,
    exported_kwh         NUMERIC(12,4) NOT NULL,
    net_kwh              NUMERIC(12,4) GENERATED ALWAYS AS (imported_kwh - exported_kwh) STORED,
    duration_seconds     BIGINT,
    refreshed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Yearly mirror ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yearly_energy (
    year                 INTEGER PRIMARY KEY,
    imported_kwh         NUMERIC(12,4) NOT NULL,
    exported_kwh         NUMERIC(12,4) NOT NULL,
    net_kwh              NUMERIC(12,4) GENERATED ALWAYS AS (imported_kwh - exported_kwh) STORED,
    refreshed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── User-marked events (panel cleaning, new appliance, etc.) ──────────
CREATE TABLE IF NOT EXISTS events (
    id              SERIAL PRIMARY KEY,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category        TEXT NOT NULL CHECK (category IN
                       ('cleaning','maintenance','appliance_added','appliance_removed',
                        'inverter_change','fault','note','other')),
    title           TEXT NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_ts_desc_idx ON events (ts DESC);

-- ─── Anomalies / alerts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL PRIMARY KEY,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    severity        TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
    category        TEXT NOT NULL,                                  -- 'production_drop','consumption_spike','meter_offline','phase_imbalance','export_anomaly',...
    title           TEXT NOT NULL,
    body            TEXT,
    metrics         JSONB,                                          -- arbitrary structured context
    acknowledged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS alerts_open_idx ON alerts (ts DESC) WHERE acknowledged_at IS NULL;

-- ─── Weather forecast cache (Open-Meteo) ────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_forecast (
    date                     DATE PRIMARY KEY,
    fetched_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    temp_min_c               NUMERIC(5,2),
    temp_max_c               NUMERIC(5,2),
    cloud_cover_avg_pct      NUMERIC(5,2),
    shortwave_radiation_mj_m2 NUMERIC(7,3),
    precipitation_mm         NUMERIC(6,2),
    weather_code             INTEGER,
    expected_export_kwh      NUMERIC(10,4)                          -- our model's prediction
);

-- ─── AI insights cache ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insights (
    id          SERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kind        TEXT NOT NULL,                                      -- 'daily_summary','anomaly_explainer','qa','tip'
    prompt      TEXT,
    content     TEXT NOT NULL,
    meta        JSONB
);
CREATE INDEX IF NOT EXISTS insights_kind_ts_idx ON insights (kind, ts DESC);

-- ─── Convenience views ──────────────────────────────────────────────────

-- Last 30 days of net energy
CREATE OR REPLACE VIEW v_recent_30d AS
SELECT day,
       imported_kwh,
       exported_kwh,
       net_kwh,
       weather_radiation_mj_m2,
       weather_cloud_cover_avg_pct
  FROM daily_energy
 WHERE day >= (CURRENT_DATE - INTERVAL '30 days')
 ORDER BY day DESC;

-- Year-on-year same-month comparison
CREATE OR REPLACE VIEW v_year_on_year AS
SELECT EXTRACT(MONTH FROM month)::INT  AS m,
       EXTRACT(YEAR  FROM month)::INT  AS y,
       imported_kwh,
       exported_kwh,
       net_kwh
  FROM monthly_energy
 ORDER BY m, y;

COMMIT;
