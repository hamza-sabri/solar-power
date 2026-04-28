'use client';
import { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AnimatedNumber } from './AnimatedNumber';

type Yearly = { year: number; imported_kwh: number; exported_kwh: number; net_kwh: number };
type Monthly = { month: string; imported_kwh: number; exported_kwh: number; net_kwh: number };

/**
 * Visual scorecard. NO long paragraphs — just a row of KPI cards
 * with eyebrow labels, big numbers, deltas, and tiny sparkline-style bars.
 */
export function Insights() {
    const [yearly, setYearly] = useState<Yearly[] | null>(null);
    const [monthly, setMonthly] = useState<Monthly[] | null>(null);

    useEffect(() => {
        Promise.all([
            fetch('/api/history/yearly').then(r => r.json()).catch(() => []),
            fetch('/api/history/monthly').then(r => r.json()).catch(() => []),
        ]).then(([y, m]) => {
            setYearly(Array.isArray(y) ? y : []);
            setMonthly(Array.isArray(m) ? m : []);
        });
    }, []);

    if (!yearly || !monthly) {
        return <section className="panel h-32 animate-pulse" />;
    }

    const fullYears = yearly.filter(y => y && typeof y.imported_kwh === 'number' && y.imported_kwh > 50);
    const lastFull = fullYears[fullYears.length - 1];
    const prevFull = fullYears[fullYears.length - 2];
    const exportYoy = (prevFull && lastFull && prevFull.exported_kwh > 0)
        ? ((lastFull.exported_kwh - prevFull.exported_kwh) / prevFull.exported_kwh) * 100 : 0;
    const importYoy = (prevFull && lastFull && prevFull.imported_kwh > 0)
        ? ((lastFull.imported_kwh - prevFull.imported_kwh) / prevFull.imported_kwh) * 100 : 0;

    const thisYear = new Date().getFullYear();
    const thisYM = monthly.filter(m => Number(m.month.slice(0, 4)) === thisYear);
    const lastYM = monthly.filter(m => Number(m.month.slice(0, 4)) === thisYear - 1)
        .filter(lm => thisYM.find(tm => tm.month.slice(5) === lm.month.slice(5)));
    const ytdImpThis = thisYM.reduce((s, m) => s + m.imported_kwh, 0);
    const ytdImpLast = lastYM.reduce((s, m) => s + m.imported_kwh, 0);
    const ytdExpThis = thisYM.reduce((s, m) => s + m.exported_kwh, 0);
    const ytdExpLast = lastYM.reduce((s, m) => s + m.exported_kwh, 0);
    const ytdImpDelta = ytdImpLast > 0 ? ((ytdImpThis - ytdImpLast) / ytdImpLast) * 100 : null;
    const ytdExpDelta = ytdExpLast > 0 ? ((ytdExpThis - ytdExpLast) / ytdExpLast) * 100 : null;

    // Compact recent-12-months series for area chart
    const last12 = monthly.slice(-12);

    return (
        <section className="panel">
            <div className="flex items-start justify-between mb-5 gap-3">
                <div>
                    <div className="eyebrow">Year-on-year scorecard</div>
                    <div className="helper hidden sm:block">
                        How this year tracks vs the same months last year. Down arrows on imports = good (you used less).
                        Down arrows on exports = bad (panels producing less).
                    </div>
                </div>
                <div className="eyebrow text-fgDim shrink-0">{prevFull?.year} → {lastFull?.year}</div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Solar export YoY */}
                <ScoreCard
                    eyebrow="SOLAR EXPORT"
                    big={lastFull?.exported_kwh ?? 0}
                    bigUnit="kWh"
                    deltaPct={exportYoy}
                    deltaInverted
                    accent="#10b981"
                />
                {/* Grid import YoY */}
                <ScoreCard
                    eyebrow="GRID IMPORT"
                    big={lastFull?.imported_kwh ?? 0}
                    bigUnit="kWh"
                    deltaPct={importYoy}
                    deltaInverted={false}
                    accent="#f59e0b"
                />
                {/* YTD export vs same period */}
                <ScoreCard
                    eyebrow={`${thisYear} EXPORT YTD`}
                    big={ytdExpThis}
                    bigUnit="kWh"
                    deltaPct={ytdExpDelta}
                    deltaInverted
                    accent="#06b6d4"
                />
                {/* YTD import vs same period */}
                <ScoreCard
                    eyebrow={`${thisYear} IMPORT YTD`}
                    big={ytdImpThis}
                    bigUnit="kWh"
                    deltaPct={ytdImpDelta}
                    deltaInverted={false}
                    accent="#8b5cf6"
                />
            </div>

            {/* 12-month area chart (replaces the wall of text) */}
            <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <div className="eyebrow">last 12 months · trend</div>
                        <div className="helper">Smooth view of imports vs exports over the past year.</div>
                    </div>
                    <div className="flex gap-3 text-[10px] kpi-number text-fgMuted">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber2/80" /> IMP</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald2/80" /> EXP</span>
                    </div>
                </div>
                <div className="h-44">
                    <ResponsiveContainer>
                        <AreaChart data={last12.map(m => ({ m: m.month.slice(2, 7), imp: m.imported_kwh, exp: m.exported_kwh }))}
                                   margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="impGradY" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.55} />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                                </linearGradient>
                                <linearGradient id="expGradY" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="m" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
                            <Tooltip
                                cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                                formatter={(v: number, n: string) => [`${v.toFixed(0)} kWh`, n === 'imp' ? 'Imported' : 'Exported']}
                                contentStyle={{ background: 'rgba(8,12,20,0.95)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, fontSize: 11 }}
                            />
                            <Area type="monotone" dataKey="imp" stroke="#f59e0b" strokeWidth={2} fill="url(#impGradY)" />
                            <Area type="monotone" dataKey="exp" stroke="#10b981" strokeWidth={2} fill="url(#expGradY)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </section>
    );
}

function ScoreCard({
    eyebrow, big, bigUnit, deltaPct, deltaInverted, accent,
}: {
    eyebrow: string;
    big: number;
    bigUnit: string;
    deltaPct: number | null;
    deltaInverted: boolean;   // true means "up = good" (export); false means "up = bad" (import)
    accent: string;
}) {
    let deltaColor = '#a8a29e';
    let arrow = '·';
    if (deltaPct != null) {
        const isUp = deltaPct >= 0;
        const isGood = deltaInverted ? isUp : !isUp;
        deltaColor = isGood ? '#10b981' : '#ef4444';
        arrow = isUp ? '▲' : '▼';
    }
    return (
        <div className="relative overflow-hidden rounded-md border border-hairline bg-white/[0.025] p-4">
            <div
                className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-25 pointer-events-none"
                style={{ background: accent }}
            />
            <div className="eyebrow" style={{ color: accent }}>{eyebrow}</div>
            <div className="mt-2 flex items-baseline gap-1">
                <span className="kpi-number text-3xl text-fg">
                    <AnimatedNumber value={big} decimals={0} />
                </span>
                <span className="kpi-number text-xs text-fgDim">{bigUnit}</span>
            </div>
            {deltaPct != null && (
                <div className="mt-1 kpi-number text-xs" style={{ color: deltaColor }}>
                    {arrow} {Math.abs(deltaPct).toFixed(1)}% <span className="text-fgDim">vs last yr</span>
                </div>
            )}
        </div>
    );
}
