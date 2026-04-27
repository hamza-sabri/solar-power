'use client';
import { useEffect, useState } from 'react';

type Event = {
    id: number;
    ts: string;
    category: string;
    title: string;
    notes: string | null;
    impact?: { before_avg: number; after_avg: number; delta_pct: number; window_days: number; n_days_after: number } | null;
};

export function EventMarkers() {
    const [events, setEvents] = useState<Event[]>([]);
    const [busy, setBusy] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const reload = () => fetch('/api/events?withImpact=1').then(r => r.json()).then(setEvents);
    useEffect(() => { reload(); }, []);

    async function quickMark(category: string, title: string) {
        setBusy(true);
        try {
            await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, title }),
            });
            await reload();
        } finally { setBusy(false); }
    }

    return (
        <section className="panel">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                <div>
                    <div className="eyebrow">Events &amp; impact</div>
                    <div className="helper">
                        Tag actions you take. The system measures the % change in daily exports for the days after.
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <ActionBtn onClick={() => quickMark('cleaning', 'Cleaned the panels')} disabled={busy} icon="🧽" label="Cleaned panels" accent="#10b981" />
                    <ActionBtn onClick={() => quickMark('appliance_added', 'New appliance')}    disabled={busy} icon="🔌" label="New appliance" accent="#8b5cf6" />
                    <ActionBtn onClick={() => setShowForm(s => !s)} icon="+" label="Custom" accent="#06b6d4" outline />
                </div>
            </div>

            {showForm && <CustomEventForm onDone={() => { setShowForm(false); reload(); }} />}

            <ul className="divide-y divide-hairline">
                {events.length === 0 && (
                    <li className="kpi-number text-xs text-fgDim py-3">no events yet</li>
                )}
                {events.map(e => <EventRow key={e.id} e={e} />)}
            </ul>
        </section>
    );
}

function ActionBtn({
    onClick, disabled, icon, label, accent, outline,
}: { onClick: () => void; disabled?: boolean; icon: string; label: string; accent: string; outline?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`text-xs kpi-number flex items-center gap-2 px-3 py-1.5 rounded border transition ${
                outline ? 'bg-white/5 border-hairline text-fg hover:bg-white/10' : 'border-hairline text-fg hover:bg-white/5'
            } disabled:opacity-50`}
            style={outline ? {} : { background: `${accent}1a`, borderColor: `${accent}55` }}
        >
            <span className="text-base">{icon}</span> {label.toUpperCase()}
        </button>
    );
}

function CustomEventForm({ onDone }: { onDone: () => void }) {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('note');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <form
            className="mb-4 space-y-2 p-3 rounded border border-hairline bg-white/[0.03]"
            onSubmit={async (e) => {
                e.preventDefault();
                if (!title.trim()) return;
                setBusy(true);
                await fetch('/api/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, category, notes }),
                });
                setBusy(false);
                onDone();
            }}>
            <div className="flex gap-2 flex-wrap">
                <input
                    placeholder="What happened?" value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm bg-black/40 rounded border border-hairline text-fg placeholder:text-fgDim focus:border-cyan2 outline-none" />
                <select value={category} onChange={e => setCategory(e.target.value)}
                    className="px-2 py-1.5 text-sm bg-black/40 rounded border border-hairline text-fg">
                    <option value="cleaning">Cleaning</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="appliance_added">Appliance added</option>
                    <option value="appliance_removed">Appliance removed</option>
                    <option value="inverter_change">Inverter change</option>
                    <option value="fault">Fault</option>
                    <option value="note">Note</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <textarea
                placeholder="Optional notes" value={notes}
                onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-1.5 text-sm bg-black/40 rounded border border-hairline text-fg placeholder:text-fgDim focus:border-cyan2 outline-none" />
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onDone}
                    className="kpi-number text-xs px-3 py-1 rounded border border-hairline text-fgMuted">CANCEL</button>
                <button type="submit" disabled={busy}
                    className="kpi-number text-xs px-3 py-1 rounded bg-white text-black">SAVE</button>
            </div>
        </form>
    );
}

function EventRow({ e }: { e: Event }) {
    const date = new Date(e.ts).toLocaleDateString();
    const i = e.impact;
    const arrow = i ? (i.delta_pct >= 0 ? '▲' : '▼') : null;
    const impColor = i ? (i.delta_pct >= 0 ? '#10b981' : '#ef4444') : '';
    return (
        <li className="py-2.5 flex items-start gap-3">
            <div className="text-xl leading-none mt-0.5">{categoryIcon(e.category)}</div>
            <div className="flex-1 min-w-0">
                <div className="text-sm">{e.title}</div>
                <div className="kpi-number text-[10px] text-fgDim">{date} · {e.category}</div>
                {e.notes && <div className="text-xs text-fgMuted mt-1">{e.notes}</div>}
            </div>
            {i && i.n_days_after >= 1 && (
                <div className="text-right">
                    <div className="kpi-number text-base" style={{ color: impColor }}>
                        {arrow} {Math.abs(i.delta_pct).toFixed(1)}%
                    </div>
                    <div className="kpi-number text-[10px] text-fgDim">{i.n_days_after}d export</div>
                </div>
            )}
        </li>
    );
}

function categoryIcon(c: string): string {
    return ({
        cleaning: '🧽', maintenance: '🔧', appliance_added: '🔌', appliance_removed: '➖',
        inverter_change: '⚙️', fault: '⚠️', note: '📝', other: '•',
    } as Record<string, string>)[c] || '•';
}
