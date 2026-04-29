'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatedNumber } from './AnimatedNumber';

type Live = {
    p_sum_kw: number;
    p_l1_kw: number;
    p_l2_kw: number;
    p_l3_kw: number;
};

/**
 * Solar / home estimation strategy
 * --------------------------------
 * The grid meter sees on L1:  P_L1 = L1_home_load − solar_production
 *
 * Two unknowns, one equation. To break the ambiguity we use the fact that
 *   * SOLAR changes gradually (sun, clouds — minutes-scale)
 *   * LOAD changes suddenly (heater, kettle — seconds-scale)
 *
 * On every new sample (every 5 s) we look at the change since the
 * previous sample. If |Δ P_L1| > 0.5 kW it's almost certainly a load
 * event — the user just plugged something in or unplugged it. Solar is
 * left alone and home load gets ±Δ added to it. If the change is small,
 * we attribute it to solar drift instead and home load stays put.
 *
 * The resulting numbers always satisfy P_L1 = home_L1 − solar exactly
 * (no drift over time).
 */

const BASELINE_L1_HOME_KW    = 0.3;
const LOAD_DELTA_THRESHOLD   = 0.5;     // kW change in one sample → "load event"

type FlowState = { pL1: number; solar: number; homeL1: number };

function initState(pL1: number): FlowState {
    if (pL1 < 0) {
        return { pL1, solar: -pL1 + BASELINE_L1_HOME_KW, homeL1: BASELINE_L1_HOME_KW };
    } else {
        // Night / no production
        return { pL1, solar: 0, homeL1: pL1 };
    }
}

function stepState(prev: FlowState, pL1: number): FlowState {
    const delta = pL1 - prev.pL1;
    let solar = prev.solar;
    let homeL1 = prev.homeL1;

    if (Math.abs(delta) > LOAD_DELTA_THRESHOLD) {
        // LOAD EVENT — sudden change. Attribute fully to home load.
        homeL1 = Math.max(0, prev.homeL1 + delta);
        // solar unchanged
    } else {
        // GRADUAL — small drift, treat as solar change. Home load stays.
        solar = Math.max(0, prev.solar - delta);
        // homeL1 unchanged
    }

    // Re-anchor when our state has drifted into something physically wrong
    // (e.g. solar=0 but L1 is still strongly exporting → must mean fresh sun).
    if (pL1 < 0 && solar < -pL1 + BASELINE_L1_HOME_KW * 0.5) {
        solar = -pL1 + BASELINE_L1_HOME_KW;
        homeL1 = BASELINE_L1_HOME_KW;
    }

    return { pL1, solar, homeL1 };
}

const W = 960;
const H = 280;
// Topology matches the user's actual wiring:
//   inverter routes solar to the HOME first, surplus overflows to the GRID,
//   and at deficit/night the GRID feeds the HOME.
const SOLAR = { x: 140, y: 140 };
const HOME  = { x: 480, y: 140 };
const GRID  = { x: 820, y: 140 };

const PATH = {
    solarToHome: `M ${SOLAR.x + 50} ${SOLAR.y} L ${HOME.x - 50} ${HOME.y}`,
    homeToGrid:  `M ${HOME.x + 50}  ${HOME.y}  L ${GRID.x - 50} ${GRID.y}`,    // export
    gridToHome:  `M ${GRID.x - 50}  ${GRID.y}  L ${HOME.x + 50} ${HOME.y}`,    // import (reversed)
};

const COLOR = {
    solar:  '#fbbf24',
    grid:   '#94a3b8',
    home:   '#06b6d4',
    export: '#10b981',
    import: '#f59e0b',
};

export function RealtimeFlow() {
    const [live, setLive] = useState<Live | null>(null);
    const [, setRev]      = useState(0);                    // forces re-render on state update
    const stateRef        = useRef<FlowState | null>(null);
    const lastEventRef    = useRef<{ ts: number; deltaKw: number; kind: 'load+' | 'load-' | 'solar' } | null>(null);

    useEffect(() => {
        const fetchTick = async () => {
            try {
                const r = await fetch('/api/live').then(r => r.json());
                if (r?.error) return;
                const pL1 = r.p_l1_kw ?? 0;
                const prev = stateRef.current;
                if (prev === null) {
                    stateRef.current = initState(pL1);
                } else {
                    const next = stepState(prev, pL1);
                    const delta = pL1 - prev.pL1;
                    if (Math.abs(delta) > LOAD_DELTA_THRESHOLD) {
                        lastEventRef.current = {
                            ts: Date.now(),
                            deltaKw: delta,
                            kind: delta > 0 ? 'load+' : 'load-',
                        };
                    }
                    stateRef.current = next;
                }
                setLive(r);
                setRev(x => x + 1);
            } catch {/* swallow */}
        };
        fetchTick();
        const id = setInterval(fetchTick, 5000);
        return () => clearInterval(id);
    }, []);

    if (!live || !stateRef.current) return <section className="panel h-72 animate-pulse" />;

    const st = stateRef.current;
    const pL2  = Math.max(0, live.p_l2_kw ?? 0);
    const pL3  = Math.max(0, live.p_l3_kw ?? 0);
    const home = st.homeL1 + pL2 + pL3;
    const solar = st.solar;
    const gridNet = live.p_sum_kw ?? 0;
    const importing = gridNet >= 0;

    const solarActive = solar > 0.05;
    const homeActive  = home  > 0.05;

    const solarSpeed = Math.max(1.0, Math.min(2.6, 2.6 - solar * 0.3));
    const homeSpeed  = Math.max(1.0, Math.min(2.6, 2.6 - home  * 0.3));

    const netLabel = importing
        ? `IMPORT  ${Math.abs(gridNet).toFixed(2)} kW`
        : `EXPORT  ${Math.abs(gridNet).toFixed(2)} kW`;
    const netColor = importing ? COLOR.import : COLOR.export;

    // Conservation breakdown shown under the GRID node so the user can see
    // why grid net ≠ solar production: solar = home + export (or solar + import = home)
    const breakdown = importing
        ? `${home.toFixed(2)} home  −  ${solar.toFixed(2)} solar  =  ${Math.abs(gridNet).toFixed(2)} from grid`
        : `${solar.toFixed(2)} solar  −  ${home.toFixed(2)} home  =  ${Math.abs(gridNet).toFixed(2)} to grid`;

    // Show recent load event banner for ~10s after detection
    const recent = lastEventRef.current;
    const showRecentBanner = recent && (Date.now() - recent.ts) < 10_000;

    return (
        <section className="panel">
            <header className="mb-3">
                <div className="eyebrow">Real-time energy flow</div>
                <div className="helper">
                    {/* Short version on mobile, full version on tablet+ */}
                    <span className="sm:hidden">
                        <span className="text-emerald2">solar = home + export</span>. Solar &amp; home
                        are <span className="text-amber2">estimated</span>; grid net is exact.
                    </span>
                    <span className="hidden sm:inline">
                        The meter only sees the <b>net</b> at the utility connection — your home grabs
                        whatever it needs from the same bus before the surplus reaches the grid, so{' '}
                        <span className="text-emerald2">solar = home + export</span> at every moment. Solar
                        &amp; home are <span className="text-amber2">estimated</span> by tracking sudden vs
                        gradual changes per phase — a heater click registers as a load event, a passing
                        cloud as a solar drift.
                    </span>
                </div>
                {showRecentBanner && recent && (
                    <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full border kpi-number text-[10px]"
                         style={{
                             borderColor: recent.kind === 'load+' ? '#f59e0b66' : '#10b98166',
                             background:  recent.kind === 'load+' ? '#f59e0b15' : '#10b98115',
                             color:       recent.kind === 'load+' ? '#f59e0b'   : '#10b981',
                         }}>
                        {recent.kind === 'load+' ? '⚡ LOAD ON' : '⚡ LOAD OFF'}
                        &nbsp;{recent.deltaKw > 0 ? '+' : ''}{recent.deltaKw.toFixed(2)} kW DETECTED ON L1
                    </div>
                )}
            </header>

            {/* MOBILE LAYOUT — vertical stack */}
            <div className="lg:hidden">
                <MobileFlow
                    solar={solar} home={home} gridNet={gridNet}
                    solarActive={solarActive} homeActive={homeActive}
                    importing={importing} netColor={netColor}
                />
                <div className="mt-3 text-center kpi-number text-[10px] text-fgMuted px-2">
                    {breakdown}
                </div>
            </div>

            {/* DESKTOP LAYOUT — horizontal SVG flow */}
            <div className="hidden lg:block relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
                <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        <radialGradient id="rfSolarGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%"   stopColor={COLOR.solar} stopOpacity="0.55" />
                            <stop offset="60%"  stopColor={COLOR.solar} stopOpacity="0.13" />
                            <stop offset="100%" stopColor={COLOR.solar} stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="rfGridGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%"   stopColor={netColor} stopOpacity="0.45" />
                            <stop offset="60%"  stopColor={netColor} stopOpacity="0.12" />
                            <stop offset="100%" stopColor="#000"     stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="rfHomeGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%"   stopColor={COLOR.home} stopOpacity="0.45" />
                            <stop offset="60%"  stopColor={COLOR.home} stopOpacity="0.12" />
                            <stop offset="100%" stopColor={COLOR.home} stopOpacity="0" />
                        </radialGradient>
                        <marker id="arrowSolar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill={solarActive ? COLOR.solar : 'rgba(255,255,255,0.15)'} />
                        </marker>
                        <marker id="arrowExport" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill={!importing && Math.abs(gridNet) > 0.05 ? COLOR.export : 'rgba(255,255,255,0.15)'} />
                        </marker>
                        <marker id="arrowImport" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill={importing && Math.abs(gridNet) > 0.05 ? COLOR.import : 'rgba(255,255,255,0.15)'} />
                        </marker>
                    </defs>

                    {/* SOLAR → HOME (always shown, brightens when solar producing) */}
                    <path d={PATH.solarToHome}
                          stroke={solarActive ? COLOR.solar : 'rgba(255,255,255,0.12)'}
                          strokeOpacity={solarActive ? 0.55 : 1}
                          strokeWidth="2.5" fill="none"
                          markerEnd="url(#arrowSolar)" />

                    {/* HOME ↔ GRID — direction depends on net flow */}
                    {!importing && (
                        <path d={PATH.homeToGrid}
                              stroke={Math.abs(gridNet) > 0.05 ? COLOR.export : 'rgba(255,255,255,0.12)'}
                              strokeOpacity={Math.abs(gridNet) > 0.05 ? 0.55 : 1}
                              strokeWidth="2.5" fill="none"
                              markerEnd="url(#arrowExport)" />
                    )}
                    {importing && (
                        <path d={PATH.gridToHome}
                              stroke={Math.abs(gridNet) > 0.05 ? COLOR.import : 'rgba(255,255,255,0.12)'}
                              strokeOpacity={Math.abs(gridNet) > 0.05 ? 0.55 : 1}
                              strokeWidth="2.5" fill="none"
                              markerEnd="url(#arrowImport)" />
                    )}

                    {/* particles SOLAR → HOME */}
                    {solarActive && [0, 1, 2].map(i => (
                        <Particle key={`s${i}`} path={PATH.solarToHome} color={COLOR.solar}
                                  dur={solarSpeed} delay={(i * solarSpeed) / 3} />
                    ))}
                    {/* particles HOME → GRID (export) */}
                    {!importing && Math.abs(gridNet) > 0.05 && [0, 1, 2].map(i => (
                        <Particle key={`e${i}`} path={PATH.homeToGrid} color={COLOR.export}
                                  dur={homeSpeed} delay={(i * homeSpeed) / 3} />
                    ))}
                    {/* particles GRID → HOME (import) */}
                    {importing && Math.abs(gridNet) > 0.05 && [0, 1, 2].map(i => (
                        <Particle key={`i${i}`} path={PATH.gridToHome} color={COLOR.import}
                                  dur={homeSpeed} delay={(i * homeSpeed) / 3} />
                    ))}

                    {/* SOLAR node */}
                    <circle cx={SOLAR.x} cy={SOLAR.y} r="60" fill="url(#rfSolarGlow)" />
                    <circle cx={SOLAR.x} cy={SOLAR.y} r="36"
                            fill="rgba(251,191,36,0.08)"
                            stroke={solarActive ? COLOR.solar : 'rgba(255,255,255,0.18)'}
                            strokeWidth="1.5" />
                    <text x={SOLAR.x} y={SOLAR.y + 12} textAnchor="middle" fontSize="38">☀️</text>

                    {/* HOME node (now in middle) */}
                    <circle cx={HOME.x} cy={HOME.y} r="60" fill="url(#rfHomeGlow)" />
                    <circle cx={HOME.x} cy={HOME.y} r="36"
                            fill="rgba(6,182,212,0.08)"
                            stroke={homeActive ? COLOR.home : 'rgba(255,255,255,0.18)'}
                            strokeWidth="1.5" />
                    <text x={HOME.x} y={HOME.y + 12} textAnchor="middle" fontSize="38">🏠</text>

                    {/* GRID node (now on right) */}
                    <circle cx={GRID.x} cy={GRID.y} r="60" fill="url(#rfGridGlow)" />
                    <circle cx={GRID.x} cy={GRID.y} r="36"
                            fill="rgba(148,163,184,0.08)"
                            stroke={netColor}
                            strokeWidth="1.5" />
                    <text x={GRID.x} y={GRID.y + 11} textAnchor="middle" fontSize="36">⚡</text>
                </svg>

                <NodeLabel
                    x="14.5%" y="14%"
                    eyebrow="SOLAR PRODUCTION"
                    value={solar}
                    accent={COLOR.solar}
                    sub={solarActive ? 'estimated' : 'no production'}
                />
                <NodeLabel
                    x="50%" y="14%"
                    eyebrow="HOME LOAD"
                    value={home}
                    accent={COLOR.home}
                    sub="estimated"
                />
                <NodeLabel
                    x="85.5%" y="14%"
                    eyebrow="GRID (NET)"
                    value={Math.abs(gridNet)}
                    accent={netColor}
                    sub={netLabel}
                />

                {/* Rate badges between the three nodes */}
                <RateBadge x="32.3%" y="36%"
                    label="→ TO HOME"
                    value={Math.min(solar, home)}
                    color={COLOR.solar}
                    active={solarActive && homeActive} />
                <RateBadge x="67.7%" y="36%"
                    label={importing ? "← FROM GRID" : "→ EXCESS TO GRID"}
                    value={Math.abs(gridNet)}
                    color={netColor}
                    active={Math.abs(gridNet) > 0.05} />

                {/* Conservation breakdown below the grid node */}
                <div className="absolute pointer-events-none kpi-number text-[10px] text-fgMuted text-center"
                     style={{ left: '50%', top: '88%', transform: 'translate(-50%, -50%)' }}>
                    {breakdown}
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 kpi-number text-[10px]">
                <SummaryRow
                    label="GRID BALANCE"
                    value={importing
                        ? `−${Math.abs(gridNet).toFixed(2)} kW`
                        : `+${Math.abs(gridNet).toFixed(2)} kW`}
                    sub={importing ? 'pulling in (you pay)' : 'pushing out (you earn)'}
                    color={netColor}
                />
                <SummaryRow
                    label="SOLAR COVERAGE"
                    value={homeActive && solarActive
                        ? `${Math.min(100, (solar / home) * 100).toFixed(0)}%`
                        : '—'}
                    sub={solarActive ? `${solar.toFixed(2)} kW solar / ${home.toFixed(2)} kW home` : 'no solar production'}
                    color={COLOR.solar}
                />
                <SummaryRow
                    label="ENERGY MIX"
                    value={home > 0 && solarActive && solar >= home
                        ? '100% solar (+excess)'
                        : home > 0 && solarActive
                            ? `${Math.round((solar / home) * 100)}% solar`
                            : '100% grid'}
                    sub="of your current home load"
                    color={COLOR.home}
                />
            </div>
        </section>
    );
}

/* ─── Mobile vertical layout ────────────────────────────────────────── */

function MobileFlow({
    solar, home, gridNet, solarActive, homeActive, importing, netColor,
}: {
    solar: number; home: number; gridNet: number;
    solarActive: boolean; homeActive: boolean; importing: boolean; netColor: string;
}) {
    const gridAbs = Math.abs(gridNet);
    const gridArrowActive = gridAbs > 0.05;
    // direction-aware label: when importing, energy flows GRID → HOME (up the stack)
    return (
        <div className="space-y-1.5">
            <NodeRow
                icon="☀️"
                eyebrow="SOLAR PRODUCTION"
                value={solar}
                accent="#fbbf24"
                sub={solarActive ? 'estimated · live' : 'no production'}
                active={solarActive}
            />
            <ArrowRow
                color="#fbbf24"
                active={solarActive}
                label="↓ TO HOME"
                value={Math.min(solar, home)}
            />
            <NodeRow
                icon="🏠"
                eyebrow="HOME LOAD"
                value={home}
                accent="#06b6d4"
                sub="estimated"
                active={homeActive}
            />
            <ArrowRow
                color={netColor}
                active={gridArrowActive}
                label={importing ? '↑ FROM GRID' : '↓ EXCESS TO GRID'}
                value={gridAbs}
                reverse={importing}
            />
            <NodeRow
                icon="⚡"
                eyebrow="GRID (NET TO UTILITY)"
                value={gridAbs}
                accent={netColor}
                sub={importing ? `IMPORT  ${gridAbs.toFixed(2)} kW` : `EXPORT  ${gridAbs.toFixed(2)} kW`}
                active={gridArrowActive}
            />
        </div>
    );
}

function NodeRow({
    icon, eyebrow, value, accent, sub, active,
}: {
    icon: string; eyebrow: string; value: number; accent: string; sub: string; active: boolean;
}) {
    return (
        <div
            className="rounded-lg border px-3 py-2.5 flex items-center gap-3 transition-colors"
            style={{
                borderColor: active ? `${accent}55` : 'rgba(255,255,255,0.10)',
                background:  active ? `${accent}10` : 'rgba(255,255,255,0.02)',
            }}
        >
            <div className="text-2xl leading-none shrink-0" style={{ filter: active ? 'none' : 'grayscale(0.5) opacity(0.6)' }}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="eyebrow truncate" style={{ color: active ? accent : 'rgba(255,255,255,0.40)' }}>
                    {eyebrow}
                </div>
                <div className="kpi-number text-[10px] text-fgDim mt-0.5 truncate uppercase tracking-widest">
                    {sub}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="kpi-number text-2xl leading-none" style={{ color: active ? accent : 'rgba(255,255,255,0.45)' }}>
                    <AnimatedNumber value={value} decimals={2} />
                </div>
                <div className="kpi-number text-[9px] text-fgDim mt-0.5">kW</div>
            </div>
        </div>
    );
}

function ArrowRow({
    color, active, label, value, reverse,
}: { color: string; active: boolean; label: string; value: number; reverse?: boolean }) {
    const dim = 'rgba(255,255,255,0.18)';
    return (
        <div className="flex items-center gap-2 pl-4 py-0.5">
            {/* vertical line + arrow (▲ when reverse, ▼ otherwise) */}
            <div className="flex flex-col items-center w-5">
                {reverse && (
                    <div className="text-xs leading-none" style={{ color: active ? color : dim }}>
                        ▲
                    </div>
                )}
                <div className="w-px h-3" style={{ background: active ? color : dim }} />
                {!reverse && (
                    <div className="text-xs leading-none" style={{ color: active ? color : dim }}>
                        ▼
                    </div>
                )}
            </div>
            <div className="kpi-number text-[10px] flex items-baseline gap-1.5"
                 style={{ color: active ? color : 'rgba(255,255,255,0.30)' }}>
                <span className="tracking-widest">{label}</span>
                <span className="text-fg" style={{ color: active ? color : 'rgba(255,255,255,0.30)' }}>
                    {active ? `${value.toFixed(2)} kW` : '0.00 kW'}
                </span>
            </div>
        </div>
    );
}

/* ─── Subcomponents ──────────────────────────────────────────────────── */

function Particle({
    path, color, dur, delay,
}: { path: string; color: string; dur: number; delay: number }) {
    return (
        <circle r="5" fill={color} cx="0" cy="0">
            <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" path={path} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.92;1"
                     dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
    );
}

function NodeLabel({
    x, y, eyebrow, value, accent, sub,
}: {
    x: string; y: string; eyebrow: string; value: number; accent: string; sub?: string;
}) {
    return (
        <div className="absolute pointer-events-none"
             style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}>
            <div className="text-center">
                <div className="eyebrow" style={{ color: accent }}>{eyebrow}</div>
                <div className="kpi-number text-2xl mt-0.5" style={{ color: accent }}>
                    <AnimatedNumber value={value} decimals={2} />
                    <span className="text-[10px] ml-1 text-fgDim">kW</span>
                </div>
                {sub && (
                    <div className="kpi-number text-[9px] text-fgDim uppercase tracking-widest mt-0.5">{sub}</div>
                )}
            </div>
        </div>
    );
}

function RateBadge({
    x, y, label, value, color, active,
}: { x: string; y: string; label: string; value: number; color: string; active: boolean }) {
    return (
        <div className="absolute pointer-events-none"
             style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}>
            <div className="rounded border kpi-number text-center px-2 py-1 backdrop-blur-sm"
                 style={{
                     borderColor: active ? `${color}66` : 'rgba(255,255,255,0.10)',
                     background: active ? `${color}15` : 'rgba(0,0,0,0.4)',
                     color: active ? color : 'rgba(255,255,255,0.30)',
                 }}>
                <div className="text-[9px] tracking-widest">{label}</div>
                <div className="text-sm">
                    {active
                        ? <><AnimatedNumber value={value} decimals={2} /><span className="text-[9px] ml-1 opacity-70">kW</span></>
                        : <span className="opacity-60">0.00 kW</span>}
                </div>
            </div>
        </div>
    );
}

function SummaryRow({
    label, value, sub, color,
}: { label: string; value: string; sub: string; color: string }) {
    return (
        <div className="rounded border border-hairline px-3 py-2">
            <div className="text-fgDim text-[9px] uppercase tracking-widest">{label}</div>
            <div className="mt-0.5" style={{ color }}>{value}</div>
            <div className="text-fgDim text-[10px] mt-0.5">{sub}</div>
        </div>
    );
}
