'use client';
import { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

type Row = { month: string; imported_kwh: number; exported_kwh: number; net_kwh: number };

export function BillStory() {
    const [rows, setRows] = useState<Row[] | null>(null);
    useEffect(() => {
        fetch('/api/history/monthly')
            .then(r => r.json())
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(() => setRows([]));
    }, []);

    return (
        <section className="panel">
            <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                    <div className="eyebrow">Bill story · monthly</div>
                    <div className="helper hidden sm:block">
                        Each month&apos;s grid imports vs solar exports. When the green line sits above the orange,
                        the grid paid you that month.
                    </div>
                </div>
                <div className="flex gap-3 text-[10px] kpi-number text-fgMuted shrink-0">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber2/80" /> IMPORT</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald2/80" /> EXPORT</span>
                </div>
            </div>
            {!rows ? (
                <div className="h-72 rounded bg-white/5 animate-pulse" />
            ) : (
                <div className="h-72">
                    <ResponsiveContainer>
                        <AreaChart data={rows.map(r => ({
                            month: r.month.slice(2, 7),
                            imp: r.imported_kwh,
                            exp: r.exported_kwh,
                        }))} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="impGradMo" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.55} />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                                </linearGradient>
                                <linearGradient id="expGradMo" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor="#10b981" stopOpacity={0.55} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
                            <Tooltip
                                cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                                formatter={(v: number, n: string) =>
                                    [`${v.toFixed(0)} kWh`, n === 'imp' ? 'Imported' : 'Exported']}
                                contentStyle={{ background: 'rgba(8,12,20,0.95)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, fontSize: 11 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="imp"
                                stroke="#f59e0b" strokeWidth={2}
                                fill="url(#impGradMo)"
                                activeDot={{ r: 4, stroke: '#f59e0b', strokeWidth: 2, fill: '#0b1018' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="exp"
                                stroke="#10b981" strokeWidth={2}
                                fill="url(#expGradMo)"
                                activeDot={{ r: 4, stroke: '#10b981', strokeWidth: 2, fill: '#0b1018' }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </section>
    );
}
