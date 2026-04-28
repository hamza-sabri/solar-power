'use client';
import { useEffect, useState } from 'react';
import { AnimatedNumber } from './AnimatedNumber';

const PERIODS = [
    { label: '1D',  days: 1   },
    { label: '7D',  days: 7   },
    { label: '30D', days: 30  },
    { label: '1Y',  days: 365 },
    { label: 'ALL', days: 9999 },
];

type Totals = {
    days: number;
    imported_kwh: number;
    exported_kwh: number;
    net_kwh: number;
    bill_estimate: number;
    tariff_import: number;
    tariff_export: number;
    range: { from: string; to: string };
};

export function PeriodTotals() {
    const [active, setActive] = useState(30);
    const [totals, setTotals] = useState<Totals | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/totals?days=${active}`)
            .then(r => r.json())
            .then(d => {
                if (cancelled) return;
                // defensive: ensure required shape
                if (d && typeof d.imported_kwh === 'number' && d.range) {
                    setTotals(d);
                } else {
                    setTotals(null);
                }
            })
            .catch(() => { if (!cancelled) setTotals(null); });
        return () => { cancelled = true; };
    }, [active]);

    return (
        <section className="panel">
            <div className="flex items-start justify-between mb-5 gap-3">
                <div>
                    <div className="eyebrow">Period totals</div>
                    <div className="helper hidden sm:block">
                        kWh totals + estimated bill in NIS for the selected window. Net positive = you owe; negative = grid owes you.
                    </div>
                    {totals && (
                        <div className="kpi-number text-[10px] text-fgDim mt-1 whitespace-nowrap">
                            {totals.range.from} → {totals.range.to}
                        </div>
                    )}
                </div>
                <div className="flex gap-1">
                    {PERIODS.map(p => (
                        <button
                            key={p.days}
                            onClick={() => setActive(p.days)}
                            className={`kpi-number text-[10px] px-2.5 py-1 rounded transition border ${
                                active === p.days
                                    ? 'bg-white/10 text-fg border-white/20'
                                    : 'border-transparent text-fgMuted hover:text-fg hover:bg-white/5'
                            }`}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {!totals ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[0,1,2,3].map(i => <div key={i} className="h-24 rounded bg-white/5 animate-pulse" />)}
                </div>
            ) : (
                <div key={active} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Tile eyebrow="IMPORTED"  value={totals.imported_kwh}  unit="kWh" decimals={1} accent="#f59e0b" delay="0s"   />
                    <Tile eyebrow="EXPORTED"  value={totals.exported_kwh}  unit="kWh" decimals={1} accent="#10b981" delay="0.05s" />
                    <Tile eyebrow="NET"       value={totals.net_kwh}       unit="kWh" decimals={1} accent={totals.net_kwh > 0 ? '#ef4444' : '#10b981'} signed delay="0.1s" />
                    <Tile eyebrow="BILL"      value={totals.bill_estimate} unit="₪"   decimals={0} accent={totals.bill_estimate > 0 ? '#ef4444' : '#10b981'} signed prefix="₪ " unitFirst delay="0.15s" />
                </div>
            )}
        </section>
    );
}

function Tile({
    eyebrow, value, unit, decimals, prefix, accent, signed, delay,
}: {
    eyebrow: string;
    value: number;
    unit: string;
    decimals: number;
    prefix?: string;
    accent: string;
    signed?: boolean;
    unitFirst?: boolean;
    delay?: string;
}) {
    const sign = signed && value > 0 ? '+' : '';
    return (
        <div
            className="tile-pop relative overflow-hidden rounded-md border border-hairline bg-white/[0.025] px-4 py-3"
            style={{ animationDelay: delay }}
        >
            <div
                className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none"
                style={{ background: accent }}
            />
            <div className="eyebrow" style={{ color: accent }}>{eyebrow}</div>
            <div className="mt-2 flex items-baseline gap-1">
                <span className="kpi-number text-3xl" style={{ color: accent }}>
                    {sign}<AnimatedNumber value={value} decimals={decimals} prefix={prefix} />
                </span>
                {unit && <span className="kpi-number text-xs text-fgDim">{unit}</span>}
            </div>
        </div>
    );
}
