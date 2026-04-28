'use client';
import { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

type Row = { day: string; imported_kwh: number; exported_kwh: number };

export function DailyChart() {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [days, setDays] = useState(30);
    useEffect(() => {
        fetch(`/api/history/daily?days=${days}`)
            .then(r => r.json())
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(() => setRows([]));
    }, [days]);

    return (
        <section className="panel">
            <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                    <div className="eyebrow">Daily history</div>
                    <div className="helper hidden sm:block">
                        Recent days. A short green line + tall orange line means high consumption with low solar
                        production — a costly day. Both close together = balanced.
                    </div>
                </div>
                <div className="flex gap-1 shrink-0">
                    {[7, 14, 30, 60, 90].map(d => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={`kpi-number text-[10px] px-2 py-0.5 rounded transition border ${
                                days === d ? 'bg-white/10 text-fg border-white/20' : 'border-transparent text-fgMuted hover:text-fg hover:bg-white/5'
                            }`}>
                            {d}D
                        </button>
                    ))}
                </div>
            </div>
            {!rows ? (
                <div className="h-72 rounded bg-white/5 animate-pulse" />
            ) : (
                <div className="h-72">
                    <ResponsiveContainer>
                        <AreaChart data={rows.map(r => ({ d: r.day.slice(5), imp: r.imported_kwh, exp: r.exported_kwh }))}
                                   margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="impGradD" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.55} />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                                </linearGradient>
                                <linearGradient id="expGradD" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor="#10b981" stopOpacity={0.55} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="d" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                                   interval={Math.max(0, Math.floor(rows.length / 10))} />
                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
                            <Tooltip
                                cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                                formatter={(v: number, n: string) =>
                                    [`${v.toFixed(2)} kWh`, n === 'imp' ? 'Imported' : 'Exported']}
                                contentStyle={{ background: 'rgba(8,12,20,0.95)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, fontSize: 11 }}
                            />
                            <Area type="monotone" dataKey="imp" stroke="#f59e0b" strokeWidth={2} fill="url(#impGradD)"
                                  activeDot={{ r: 4, stroke: '#f59e0b', strokeWidth: 2, fill: '#0b1018' }} />
                            <Area type="monotone" dataKey="exp" stroke="#10b981" strokeWidth={2} fill="url(#expGradD)"
                                  activeDot={{ r: 4, stroke: '#10b981', strokeWidth: 2, fill: '#0b1018' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </section>
    );
}
