'use client';
import { useEffect, useState } from 'react';

type Alert = {
    id: number; ts: string; severity: 'info' | 'warn' | 'critical';
    category: string; title: string; body: string | null; acknowledged_at: string | null;
};

export function AlertsPanel() {
    const [alerts, setAlerts] = useState<Alert[] | null>(null);
    const reload = () => fetch('/api/alerts').then(r => r.json()).then(setAlerts);
    useEffect(() => {
        reload();
        const id = setInterval(reload, 30_000);
        return () => clearInterval(id);
    }, []);

    const open = alerts?.filter(a => !a.acknowledged_at) ?? [];

    return (
        <section className="panel">
            <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                    <div className="eyebrow">Alerts</div>
                    <div className="helper hidden sm:block">
                        Anomalies the system spots — meter offline, odd production, consumption spikes.
                    </div>
                </div>
                <span className={`kpi-number text-[10px] shrink-0 ${open.length ? 'text-amber2' : 'text-emerald2'}`}>
                    {open.length} OPEN
                </span>
            </div>
            {!alerts ? (
                <div className="h-32 bg-white/5 rounded animate-pulse" />
            ) : open.length === 0 ? (
                <div className="kpi-number text-sm text-fgMuted flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald2 breath" />
                    All clear
                </div>
            ) : (
                <ul className="divide-y divide-hairline">
                    {open.map(a => (
                        <li key={a.id} className="py-2 flex items-start gap-3">
                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${a.severity === 'critical' ? 'bg-rose2' : a.severity === 'warn' ? 'bg-amber2' : 'bg-cyan2'}`} />
                            <div className="flex-1">
                                <div className="text-sm">{a.title}</div>
                                <div className="kpi-number text-[10px] text-fgDim">
                                    {new Date(a.ts).toLocaleString()} · {a.category}
                                </div>
                                {a.body && <div className="text-xs text-fgMuted mt-0.5">{a.body}</div>}
                            </div>
                            <button
                                onClick={async () => { await fetch(`/api/alerts/${a.id}`, { method: 'POST' }); reload(); }}
                                className="kpi-number text-[10px] px-2 py-1 rounded border border-hairline text-fgMuted hover:bg-white/5">
                                DISMISS
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
