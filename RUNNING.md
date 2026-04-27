# Run the dashboard locally — 5-minute setup

The Postgres schema is **already applied** and the **historical backfill is already done** against your Neon DB by the work that built this. So all you need to do locally is install npm packages and start Next.js.

## Prerequisites

- Node.js **20 or newer** (`node -v` to check)
- A terminal

That's it. (No Docker, no Postgres install — Neon is hosted.)

## 1. Open a terminal in this folder

```bash
cd "<wherever-this-folder-lives>/solar-dashboard"
```

## 2. Throw away the partial node_modules (if any), then install fresh

```bash
rm -rf node_modules package-lock.json
npm install
```

This pulls Next 15, React 19, CopilotKit, Recharts, pg, etc. Takes 30–90 seconds.

## 3. Confirm `.env` is filled in

A `.env` file is already in this folder with your Neon URL, the meter URL, and Qalqiliya coordinates. Open it and verify it looks right. The only optional value is `OPENROUTER_API_KEY` — fill that in if you want the chat to work; otherwise leave it blank and the rest of the dashboard still works.

## 4. Start the dashboard

```bash
npm run dev
```

You should see something like:

```
   ▲ Next.js 15.5.4
   - Local:        http://localhost:3000
   - Environments: .env

 ✓ Ready in 1.4s
```

Open **http://localhost:3000** in your browser.

## 5. (optional) start the live poller in a second terminal

The dashboard's live tile already polls the meter directly, so this isn't required just to see things move. The poller exists to **build sub-daily history in your DB** so future analyses ("did cleaning the panels help?") have minute-level data to work with.

```bash
# in a new terminal, same folder
npm run poller
```

You'll see log lines like `[2026-04-27T07:14:32.000Z] EXP 0.812 kW  today=10.20 kWh` ticking by every 30 seconds. Leave it running. On a real VPS, you'd manage it with pm2 or systemd (instructions in `README.md`).

---

## What you should see on the page

1. **Top hero card** — green "exporting X kW" or orange "importing X kW" with a little 10-minute trail chart, plus per-phase mini bars (L1 highlighted because that's where your inverter sits).
2. **Period totals** — 4 big tiles: imported, exported, net, NIS bill estimate. Tabs at the top: 1 day / 7 days / 30 days / 1 year / All.
3. **The bill story** — 25-month bar chart, exports green and imports orange. The "flip" from net-positive years (2023-24) to net-negative (2025-26) is visible at a glance.
4. **Daily history** — last 30 days bar chart (toggle 7 / 14 / 30 / 60 / 90 days).
5. **Per-phase right now** — table of L1/L2/L3 voltage, current, power, power factor.
6. **Alerts** — "all clear" until the poller logs an anomaly.
7. **Mark an event** — click "🧽 Cleaned the panels" *right after* you actually clean them. The system stores the timestamp and starts computing a before/after comparison in the days that follow.
8. **Chat bubble (bottom-right)** — CopilotKit. Tap and ask things like:
   - *"How was production last week vs the same week last year?"*
   - *"Did cleaning the panels help?"*
   - *"Why is my bill so high?"*
   - *"What can I do to increase production?"*
   - *"Mark that I just added a new freezer"*

## If you don't have an OpenRouter key yet

Get one free at <https://openrouter.ai/keys>. They have several free models — set `OPENROUTER_MODEL=meta-llama/llama-3.1-70b-instruct:free` in `.env` and the chat will work without spending credit.

## Troubleshooting

- **`Cannot find module 'next'`** → you skipped `npm install`. Go back to step 2.
- **Page loads but the live tile says "Cannot reach meter"** → your machine can't reach `http://82.213.14.12:83`. Try opening that URL in a browser tab. If it loads, restart `npm run dev`. If it doesn't, you might be on a network that blocks outbound HTTP to that IP.
- **Charts are empty** → the backfill didn't apply. Run `npm run apply-schema && npm run backfill` from this folder.
- **Chat says "AI key not configured"** → set `OPENROUTER_API_KEY` in `.env` and restart `npm run dev`.

## What's deployed where

- Your Neon DB at `ep-ancient-boat-alt4fq1y-pooler.c-3.eu-central-1.aws.neon.tech` already has 221 days, 25 months, 5 years of your real data loaded.
- The Next.js dashboard runs on **your machine** at `localhost:3000` (or your VPS later — same `npm run dev` / `npm run start` command).
- The Siemens PAC2200 at `82.213.14.12:83` is queried directly by both the dashboard and (optionally) the poller.

> ⚠ Friendly reminder: the Neon password you pasted in chat earlier should be **rotated** in the Neon console. I'll wait for the new one before doing anything else with the DB if you want — or it's fine to leave it since the dashboard already has it via `.env` on your machine only.
