# Solar Dashboard — Qalqiliya

A friendly, one-stop dashboard for your home solar + grid meter, replacing the Siemens
PAC web UI with something you can actually understand at a glance, plus alerts,
weather-aware production prediction, and an AI chat (CopilotKit) you can ask
questions like *"did cleaning the panels help, and by how much?"*.

This document is both the **getting-started guide** and the **field notes** from the
analysis I did of your data. Read the analysis section first — it tells the story
of why your bill went from ~20 NIS/month to ~500 NIS/month.

---

## 0. Run it locally — quick start

→ See **[RUNNING.md](./RUNNING.md)** for copy-paste commands. tl;dr:

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev          # opens http://localhost:3000
```

Schema is already applied to your Neon DB; 221 days of history are already loaded. The dashboard polls the meter directly so it's live as soon as the page loads.

---

## 1. What I found in your meter

### Device
- **Siemens SENTRON PAC2200**, order ID `7KM2200-2EA40-1EA1`
- Firmware `V3.2.2.0-1.1.0.6`, serial `LQN/221201700211`
- Web UI version `pacwebui_4.0.2`
- API: `GET http://82.213.14.12:83/data.json?type=<TYPE>` (no auth)

> ⚠ **Security note**: your meter is on the public internet with **no authentication**.
> Anyone with the IP can read your live production and consumption. Once the dashboard
> is up I'll suggest putting the meter behind a firewall / WireGuard so only your
> VPS can reach it.

### Data available from the meter

| Endpoint | What it returns | Update rate I'll use |
|---|---|---|
| `?type=OVERVIEW` | live P_SUM, per-phase power, energy counters, today/this-month, tariff | every **30 s** |
| `?type=INSTANTANEOUS` | per-phase voltage, current, power, frequency, power factor | every **60 s** |
| `?type=COUNTERS` | total energy counters per tariff | every 5 min |
| `?type=DAILYPROFILE` (count up to 221) | daily import/export kWh | hourly (and one-time backfill of 221 days) |
| `?type=MONTHLYPROFILE` (count up to 25) | monthly totals | daily |
| `?type=YEARLYPROFILE` (count up to 5) | yearly totals | daily |
| `?type=PRODUCT_INFO` | serial / firmware | once on startup |

> The meter does **not** persist sub-daily history itself. To get a per-minute
> production curve we have to record it ourselves — that's what the poller does.

### The bill story (your real data)

I pulled all 25 months of your monthly history. Here's what's actually happening:

| Year | Imported (drew from grid) | Exported (solar surplus) | Net |
|---|---|---|---|
| 2023 | 2,892 kWh | 2,963 kWh | **+71 kWh** (you sold a tiny bit) |
| 2024 | 5,573 kWh | 6,282 kWh | **+709 kWh** (great year) |
| 2025 | 7,427 kWh | 5,545 kWh | **−1,882 kWh** |
| 2026 (Jan–Apr 26) | 3,066 kWh | 1,338 kWh | **−1,728 kWh in 4 months** |

Two things compounded to flip you from net-producer to heavy net-consumer:

1. **Solar export dropped ~12% in 2025 vs 2024**, and 2026 is on pace for another
   ~28% drop vs 2025. That points at one of: dust/dirt build-up, partial shading
   from new construction nearby, an inverter starting to derate, or one solar
   string that's failed.
2. **Grid consumption climbed +33% in 2025**, on pace for similar in 2026. New
   appliance, AC/heating running more, water-heater thermostat wrong, or a
   refrigerator/HVAC compressor failing.

Recent months are brutal:

```
2026-01: imported 927 kWh, exported  252 kWh  (winter heating + low solar)
2026-02: imported 1075 kWh, exported 222 kWh  (worst month on record)
2026-03: imported  660 kWh, exported 330 kWh
2026-04: imported  493 kWh (so far), exported 372 kWh
```

### Phase-imbalance finding (from your Energy screenshot)

Your lifetime per-phase counters told me something subtle but important:

| Phase | Lifetime Import | % of import | Lifetime Export | % of export |
|---|---|---|---|---|
| L1 | 14,830 kWh | 78 % | 17,816 kWh | **99.5 %** |
| L2 | 5,058 kWh | 27 % | 0.13 kWh | 0 % |
| L3 | 760 kWh | 4 % | 0.03 kWh | 0 % |

Implication: your **inverter is single-phase, wired only to L1**, and your home
loads are also concentrated on L1. L3 is essentially unused.

That matters because:

- A drop in solar production shows up almost entirely on L1's net flow — the
  dashboard can use L1 net as a clean signal for "is solar working today?"
- The poor L1 power factor we saw at 17:20 (PF_L1 = 0.126) is actually expected
  when solar export roughly cancels the L1 load — but it also means a meaningful
  reactive component, worth checking if the utility ever charges for it.
- Rebalancing some heavy loads off L1 onto L2 or L3 would reduce strain and very
  slightly reduce line losses. Not urgent.

### What we can and can't measure

Your PAC2200 sits on the **grid connection**, so it measures bidirectional grid
flow:

- `import` = energy drawn from the grid (when home > solar, or at night)
- `export` = energy pushed to grid (solar surplus)

This means we cannot **directly** read "current solar production" or "current
home consumption" — those are derived. Best we can do without an inverter API:

- **Net grid flow** = direct, exact (`P_SUM`)
- **Solar production lower bound** = `|P_SUM|` whenever P_SUM < 0 (exporting)
- **Daily consumption estimate** = nighttime baseline + daytime apparent load
- **Daily production estimate** = day's exported_kwh + (load on L1 during daylight)

If you tell me the inverter brand/model (SolarEdge, Fronius, Huawei, Goodwe,
SMA, Growatt, etc.), I can plug in its API and the dashboard will know the
exact production directly. Many inverters expose a local HTTP/Modbus interface
on your LAN — same pattern as the meter.

---

## 2. Architecture

```
┌──────────────────────────┐
│  Siemens PAC2200         │   on your network (currently public — bad!)
│  http://82.213.14.12:83  │
└─────────────┬────────────┘
              │  GET /data.json?type=...
              ▼
┌──────────────────────────┐
│  Poller (Node)           │   runs on your VPS, polls every 30–60 s
│  scripts/poller.mjs      │
└─────────────┬────────────┘
              │ INSERT samples / daily_energy / alerts
              ▼
┌──────────────────────────┐
│  Neon Postgres           │   single source of truth
│  free tier is fine       │
└─────────────┬────────────┘
              │
              ▼
┌──────────────────────────┐         ┌─────────────────────┐
│  Next.js dashboard       │ ◄────── │  Open-Meteo (free)  │  weather forecast
│  app/ (coming next turn) │         │  forecast.api/...   │
│  + CopilotKit chat       │         └─────────────────────┘
└─────────────┬────────────┘
              │  Copilot tool calls
              ▼
┌──────────────────────────┐
│  OpenRouter LLM          │   for chat + plain-language summaries
└──────────────────────────┘
```

### Stack

- **Database**: Neon Postgres (free tier covers this comfortably)
- **Backend**: plain Node.js (ESM). No TypeScript build step — faster to deploy.
- **Frontend (next turn)**: Next.js 15 + Tailwind + Recharts + CopilotKit
- **AI**: OpenRouter (you said you have access) — used by CopilotKit + nightly
  summary worker
- **Weather**: Open-Meteo. Free, no key, has Qalqiliya covered (~32.19°N, 34.97°E)
- **Hosting**: your VPS, behind nginx + Let's Encrypt. Docker-compose later.

---

## 3. What's in this delivery (Phase 1: backend foundation)

This first drop gets data flowing into your DB. With this running, the dashboard
in the next delivery has something to draw from day one.

```
solar-dashboard/
├── README.md                 ← you are here
├── package.json              ← dependencies (pg, dotenv)
├── .env.example              ← copy to .env and fill in
├── db/
│   └── schema.sql            ← run once against your Neon DB
├── lib/
│   └── meter.mjs             ← typed-ish PAC2200 client
└── scripts/
    ├── backfill.mjs          ← one-shot: pulls 221 days + 25 months + 5 years from meter
    └── poller.mjs            ← long-running: live samples + hourly daily-roll
```

### Setup (5 minutes)

```bash
# 1. create a Neon DB
#    https://console.neon.tech → new project → copy the connection string

# 2. create the schema
psql "postgresql://...neon.tech/neondb?sslmode=require" < db/schema.sql

# 3. install deps
cd solar-dashboard
npm install

# 4. configure
cp .env.example .env
# edit .env, set:
#   DATABASE_URL=postgresql://user:pass@xxx.neon.tech/neondb?sslmode=require
#   METER_BASE_URL=http://82.213.14.12:83

# 5. backfill historical data once
node scripts/backfill.mjs

# 6. start the poller (foreground, to test)
node scripts/poller.mjs
# you should see logs like: "[OVERVIEW] P=0.146kW imp=18960.77 exp=16128.10 — saved sample"
```

### Production: keep the poller running on the VPS

Easiest option — `pm2`:

```bash
npm i -g pm2
pm2 start scripts/poller.mjs --name solar-poller
pm2 startup    # one-time: makes pm2 restart on reboot
pm2 save
pm2 logs solar-poller
```

Or systemd, or a Docker container — pick what your VPS already has.

---

## 4. Coming next

In the **next turn**, on top of this foundation:

1. **Next.js dashboard** with the hero "right now" chart, period totals
   (default 1 month), the bill-story year view, and per-day comparison
2. **Event markers** — a button "I cleaned the panels" / "added new appliance",
   so the dashboard can show a before/after diff and the AI can refer to it
   ("after you cleaned the panels on April 26, exports rose +X% on comparable
   sunny days")
3. **CopilotKit chat** with tools for: "production for last N days",
   "what changed this month vs same month last year", "what should I check first?"
4. **Anomaly alerts** — production unusually low for the weather, consumption
   spike, meter went offline, phase imbalance went weird
5. **Weather + production prediction** — Open-Meteo forecast → expected
   production for tomorrow → "you'll likely break even tomorrow but Friday
   is cloudy, expect to import ~20 kWh"
6. **Alerts via email/Telegram** — pick whichever you prefer

---

## 5. Appendix: every PAC2200 endpoint I confirmed works

```
GET /data.json?type=OVERVIEW
GET /data.json?type=INSTANTANEOUS    (live per-phase V/I/P/Q/PF + freq)
GET /data.json?type=COUNTERS         (energy counters per tariff)
GET /data.json?type=PRODUCT_INFO     (serial, FW)
GET /data.json?type=DEVICE_INFO      (plant/location, currently unset)
GET /data.json?type=DAILYPROFILE&count=221
GET /data.json?type=MONTHLYPROFILE&count=25
GET /data.json?type=YEARLYPROFILE&count=5
```

The following types are advertised in the JS bundle but currently empty/error
on your unit (likely require enabling on the device):
`WAVEFORM`, `LOAD_PROFILE`, `LOGBOOK`, `EXTREME_VALUES`, `HARMONICS`.
# solar-power
