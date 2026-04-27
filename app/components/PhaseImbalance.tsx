'use client';
import { useEffect, useState } from 'react';

type LiveInst = {
    v_l1?: number; v_l2?: number; v_l3?: number;
    i_l1?: number; i_l2?: number; i_l3?: number;
    pf_l1?: number; pf_l2?: number; pf_l3?: number;
    p_l1_kw?: number; p_l2_kw?: number; p_l3_kw?: number;
    freq_hz?: number;
};

export function PhaseImbalance() {
    const [d, setD] = useState<LiveInst | null>(null);
    useEffect(() => {
        const tick = () => fetch('/api/live').then(r => r.json()).then(setD).catch(() => {});
        tick();
        const id = setInterval(tick, 10_000);
        return () => clearInterval(id);
    }, []);

    if (!d) return <section className="panel h-64 animate-pulse" />;

    const phases = [
        { label: 'L1', v: d.v_l1, i: d.i_l1, kw: d.p_l1_kw, pf: d.pf_l1, solar: true },
        { label: 'L2', v: d.v_l2, i: d.i_l2, kw: d.p_l2_kw, pf: d.pf_l2 },
        { label: 'L3', v: d.v_l3, i: d.i_l3, kw: d.p_l3_kw, pf: d.pf_l3 },
    ];

    return (
        <section className="panel">
            <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                    <div className="eyebrow">Per-phase live</div>
                    <div className="helper hidden sm:block">
                        Live readings on each phase. Your inverter is tied to L1 — its number tells the solar story.
                    </div>
                </div>
                <div className="kpi-number text-[10px] text-fgDim shrink-0">
                    {d.freq_hz != null ? `${d.freq_hz.toFixed(2)} Hz` : ''}
                </div>
            </div>
            <div className="space-y-2">
                {phases.map(p => <PhaseRow key={p.label} {...p} />)}
            </div>
        </section>
    );
}

function PhaseRow({ label, v, i, kw, pf, solar }: any) {
    const exporting = (kw ?? 0) < 0;
    const color = exporting ? '#10b981' : 'rgba(255,255,255,0.6)';
    return (
        <div className="border-t border-hairline first:border-t-0 pt-2 first:pt-0">
            <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                    <span className="kpi-number text-base">{label}</span>
                    {solar && <span className="text-[9px] uppercase tracking-widest text-emerald2">solar</span>}
                </div>
                <span className="kpi-number text-base" style={{ color }}>
                    {kw != null ? `${kw >= 0 ? '+' : ''}${kw.toFixed(2)} kW` : '—'}
                </span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-3 text-[10px] kpi-number">
                <Mini label="V" value={v != null ? v.toFixed(0) : '—'} unit="V" />
                <Mini label="A" value={i != null ? i.toFixed(2) : '—'} unit="A" />
                <Mini label="PF" value={pf != null ? pf.toFixed(2) : '—'} />
            </div>
        </div>
    );
}

function Mini({ label, value, unit }: { label: string; value: string; unit?: string }) {
    return (
        <div className="flex items-baseline gap-1">
            <span className="text-fgDim uppercase tracking-widest">{label}</span>
            <span className="text-fg">{value}</span>
            {unit && <span className="text-fgDim">{unit}</span>}
        </div>
    );
}
