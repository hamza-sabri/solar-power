'use client';
import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, ReferenceLine } from 'recharts';
import { AnimatedNumber } from './AnimatedNumber';

type Live = {
    p_sum_kw: number;
    p_l1_kw: number;
    p_l2_kw: number;
    p_l3_kw: number;
    today_imp_kwh: number;
    thismonth_imp_kwh: number;
    pf_sum: number;
    actualTariff: string;
    localTime: string;
};

export function HeroLive() {
    const [live, setLive] = useState<Live | null>(null);
    const [trail, setTrail] = useState<{ kw: number }[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [flipKey, setFlipKey] = useState(0);
    const prevSign = useRef<number>(0);

    useEffect(() => {
        const tick = async () => {
            try {
                const r = await fetch('/api/live').then(r => r.json());
                if (r?.error) { setErr(r.error); return; }
                setLive(r);
                setErr(null);
                setTrail((prev) => [...prev, { kw: r.p_sum_kw }].slice(-120));
                const sign = Math.sign(r.p_sum_kw ?? 0);
                if (sign !== prevSign.current) {
                    prevSign.current = sign;
                    setFlipKey(k => k + 1);
                }
            } catch (e: any) {
                setErr(e?.message || 'failed');
            }
        };
        tick();
        const id = setInterval(tick, 5000);
        return () => clearInterval(id);
    }, []);

    if (err) {
        return (
            <section className="panel-hi">
                <div className="eyebrow text-rose2">Meter unreachable</div>
                <div className="mt-2 text-sm text-fgMuted">{err}</div>
            </section>
        );
    }
    if (!live) {
        return <section className="panel-hi h-72 animate-pulse" />;
    }

    const exporting = (live.p_sum_kw ?? 0) < 0;
    const kw = Math.abs(live.p_sum_kw ?? 0);
    const accent = exporting ? '#10b981' : '#f59e0b';
    const accentSoft = exporting ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)';
    const verb = exporting ? 'EXPORTING' : 'IMPORTING';
    const dirText = exporting ? 'home → grid' : 'grid → home';

    return (
        <section className="panel-hi grain relative">
            {/* glow blob anchored to the hot side */}
            <div
                className="absolute -top-32 w-[520px] h-[520px] rounded-full opacity-40 blur-[120px] pointer-events-none transition-all duration-700"
                style={{
                    background: accent,
                    [exporting ? 'left' : 'right' as any]: '-120px',
                }}
            />

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                {/* Left: Big live metric */}
                <div className="lg:col-span-5">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inset-0 rounded-full breath" style={{ background: accent }} />
                            <span className="rounded-full h-2 w-2" style={{ background: accent }} />
                        </span>
                        <span className="eyebrow" style={{ color: accent }}>{verb}</span>
                        <span className="eyebrow text-fgDim">· LIVE · {dirText}</span>
                    </div>
                    <div className="helper max-w-md">
                        Net grid power right now. Negative (green) = solar surplus going to the grid.
                        Positive (orange) = your home is pulling from the grid.
                    </div>

                    <div key={flipKey} className="hero-flip mt-2 sm:mt-3 flex items-baseline gap-2 sm:gap-3 flex-wrap">
                        <div className="kpi-number text-5xl sm:text-7xl lg:text-8xl leading-none" style={{ color: accent }}>
                            <AnimatedNumber value={kw} decimals={2} duration={500} />
                        </div>
                        <div className="kpi-number text-xl sm:text-2xl text-fgMuted">kW</div>
                    </div>

                    {/* Per-phase strip */}
                    <div className="mt-4 sm:mt-6 grid grid-cols-3 gap-1.5 sm:gap-2">
                        <PhaseCell label="L1" tag="solar" kw={live.p_l1_kw} />
                        <PhaseCell label="L2" kw={live.p_l2_kw} />
                        <PhaseCell label="L3" kw={live.p_l3_kw} />
                    </div>
                </div>

                {/* Center: Animated energy flow visualization */}
                <div className="lg:col-span-4 flex items-center">
                    <EnergyFlow exporting={exporting} kw={kw} accent={accent} accentSoft={accentSoft} />
                </div>

                {/* Right: rolling sparkline */}
                <div className="lg:col-span-3">
                    <div className="eyebrow">last 10 minutes</div>
                    <div className="h-20 sm:h-24 mt-2">
                        <ResponsiveContainer>
                            <LineChart data={trail.map((p, i) => ({ i, kw: p.kw }))}>
                                <YAxis hide domain={['auto', 'auto']} />
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="2 4" />
                                <Line type="monotone" dataKey="kw" dot={false}
                                    stroke={accent} strokeWidth={2}
                                    isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-2 sm:mt-3">
                        <MiniStat label="TODAY"      value={(live.today_imp_kwh ?? 0).toFixed(1)} unit="kWh" />
                        <MiniStat label="THIS MONTH" value={(live.thismonth_imp_kwh ?? 0).toFixed(0)} unit="kWh" />
                        <MiniStat label="TARIFF"     value={live.actualTariff || '—'} />
                        <MiniStat label="POWER FACTOR" value={(live.pf_sum ?? 0).toFixed(2)} dim />
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ─── Animated SVG energy flow between solar panel and grid ─────────────── */
function EnergyFlow({
    exporting, kw, accent, accentSoft,
}: { exporting: boolean; kw: number; accent: string; accentSoft: string }) {
    // particle speed scales with kW (more power = denser/faster flow)
    const speed = Math.max(0.6, Math.min(2.4, 1.8 - Math.min(2.5, kw) * 0.4)); // sec
    return (
        <div className="w-full">
            <svg viewBox="0 0 480 120" className="w-full h-28">
                <defs>
                    <linearGradient id="flowGradient" x1="0" x2="1">
                        <stop offset="0%" stopColor={accent} stopOpacity={exporting ? 0.95 : 0.3} />
                        <stop offset="100%" stopColor={accent} stopOpacity={exporting ? 0.3 : 0.95} />
                    </linearGradient>
                    <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor={accent} stopOpacity="0.6" />
                        <stop offset="60%" stopColor={accent} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={accent} stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* solar node (left) */}
                <circle cx="40" cy="60" r="32" fill="url(#nodeGlow)" />
                <g transform="translate(40,60)">
                    <rect x="-18" y="-12" width="36" height="24" rx="3" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" />
                    <line x1="-18" y1="-4"  x2="18" y2="-4"  stroke="rgba(255,255,255,0.35)" />
                    <line x1="-18" y1="4"   x2="18" y2="4"   stroke="rgba(255,255,255,0.35)" />
                    <line x1="-6"  y1="-12" x2="-6" y2="12"  stroke="rgba(255,255,255,0.35)" />
                    <line x1="6"   y1="-12" x2="6"  y2="12"  stroke="rgba(255,255,255,0.35)" />
                </g>
                <text x="40" y="105" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10"
                      fontFamily="var(--font-mono), monospace" letterSpacing="0.1em">SOLAR</text>

                {/* grid node (right) */}
                <circle cx="440" cy="60" r="32" fill="url(#nodeGlow)" />
                <g transform="translate(440,60)" stroke="rgba(255,255,255,0.35)" fill="none">
                    <path d="M-14 8 L0 -14 L14 8 Z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" />
                    <line x1="-10" y1="14" x2="10" y2="14" />
                    <line x1="-6"  y1="20" x2="6"  y2="20" />
                </g>
                <text x="440" y="105" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10"
                      fontFamily="var(--font-mono), monospace" letterSpacing="0.1em">GRID</text>

                {/* connection line */}
                <line x1="76" y1="60" x2="404" y2="60" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                <line x1="76" y1="60" x2="404" y2="60"
                      stroke="url(#flowGradient)" strokeWidth="2"
                      strokeDasharray="6 6"
                      className={exporting ? 'flow-fwd' : 'flow-rev'} />

                {/* particles (3 staggered) */}
                {[0, 0.6, 1.2].map((d, i) => (
                    <circle key={i} cy="60" r="3.5" fill={accent}
                        style={{
                            animation: `${exporting ? 'part-fwd' : 'part-rev'} ${speed}s linear ${d}s infinite`,
                            // travel between x=80 and x=400; we animate via translateX of whole svg group instead
                        }}>
                        <animate
                            attributeName="cx"
                            from={exporting ? 80 : 400}
                            to={exporting ? 400 : 80}
                            dur={`${speed}s`}
                            begin={`${d}s`}
                            repeatCount="indefinite"
                        />
                        <animate
                            attributeName="opacity"
                            values="0;1;1;0"
                            keyTimes="0;0.1;0.9;1"
                            dur={`${speed}s`}
                            begin={`${d}s`}
                            repeatCount="indefinite"
                        />
                    </circle>
                ))}
            </svg>
        </div>
    );
}

function PhaseCell({ label, kw, tag }: { label: string; kw: number | null | undefined; tag?: string }) {
    const v = kw ?? 0;
    const exporting = v < 0;
    const color = exporting ? '#10b981' : 'rgba(255,255,255,0.7)';
    const widthPct = Math.min(100, Math.abs(v) * 30);
    return (
        <div className="rounded-md border border-hairline bg-surface px-3 py-2">
            <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                    <span className="kpi-number text-xs text-fgMuted">{label}</span>
                    {tag && <span className="text-[9px] uppercase tracking-widest text-emerald2/80">{tag}</span>}
                </div>
                <span className="kpi-number text-sm" style={{ color }}>
                    {v >= 0 ? '+' : ''}{v.toFixed(2)}
                </span>
            </div>
            <div className="h-1 rounded-full bg-white/5 mt-2 overflow-hidden">
                <div className="bar-fill h-full" style={{ width: `${widthPct}%`, background: color }} />
            </div>
        </div>
    );
}

function MiniStat({ label, value, unit, dim }: { label: string; value: string; unit?: string; dim?: boolean }) {
    return (
        <div>
            <div className="eyebrow">{label}</div>
            <div className={`kpi-number text-xl mt-0.5 ${dim ? 'text-fgMuted' : 'text-fg'}`}>
                {value}{unit && <span className="text-xs ml-1 text-fgDim">{unit}</span>}
            </div>
        </div>
    );
}
