'use client';
import { useEffect, useRef, useState } from 'react';

type Event = {
    id: number;
    ts: string;
    category: string;
    title: string;
    notes: string | null;
    impact?: { before_avg: number; after_avg: number; delta_pct: number; window_days: number; n_days_after: number } | null;
};

type Schedule = {
    id: number;
    title: string;
    category: string;
    frequency_days: number;
    last_done_at: string | null;
    next_due_at: string;
    enabled: boolean;
    notes: string | null;
};

const CAT_ICONS: Record<string, string> = {
    cleaning: '🧽', maintenance: '🔧', inspection: '🔎', reading: '📖',
    appliance_added: '🔌', appliance_removed: '➖', inverter_change: '⚙️',
    fault: '⚠️', note: '📝', other: '•',
};

const FREQ_PRESETS = [
    { label: 'WEEKLY',    days: 7   },
    { label: 'BIWEEKLY',  days: 14  },
    { label: 'MONTHLY',   days: 30  },
    { label: 'BIMONTHLY', days: 60  },
    { label: 'QUARTERLY', days: 90  },
];

export function EventsAndReminders() {
    const [events, setEvents]       = useState<Event[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [tab, setTab]             = useState<'reminders' | 'log'>('reminders');
    const [showAdd, setShowAdd]     = useState(false);
    const [busy, setBusy]           = useState(false);
    const seenNotifs = useRef<Set<number>>(new Set());

    const reload = async () => {
        try {
            const [ev, sc] = await Promise.all([
                fetch('/api/events?withImpact=1').then(r => r.json()).catch(() => []),
                fetch('/api/schedules').then(r => r.json()).catch(() => []),
            ]);
            setEvents(Array.isArray(ev) ? ev : []);
            setSchedules(Array.isArray(sc) ? sc : []);
        } catch {
            setEvents([]); setSchedules([]);
        }
    };

    useEffect(() => {
        reload();
        const id = setInterval(reload, 60_000);
        return () => clearInterval(id);
    }, []);

    // In-tab notifications for due-now schedules
    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        const now = Date.now();
        for (const s of schedules) {
            if (!s.enabled) continue;
            const due = new Date(s.next_due_at).getTime();
            if (due <= now && !seenNotifs.current.has(s.id)) {
                seenNotifs.current.add(s.id);
                try {
                    new Notification(`${CAT_ICONS[s.category] || '⏰'}  ${s.title}`, {
                        body: `Reminder due — every ${s.frequency_days} days`,
                        tag: `schedule-${s.id}`,
                    });
                } catch {/* ignore */}
            }
        }
    }, [schedules]);

    async function quickAddEvent(category: string, title: string) {
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

    async function markDone(id: number) {
        await fetch(`/api/schedules/${id}/done`, { method: 'POST' });
        seenNotifs.current.delete(id);
        await reload();
    }
    async function snooze(id: number, days: number) {
        await fetch(`/api/schedules/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snooze_days: days }),
        });
        seenNotifs.current.delete(id);
        await reload();
    }
    async function toggleEnabled(s: Schedule) {
        await fetch(`/api/schedules/${s.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !s.enabled }),
        });
        await reload();
    }
    async function deleteSchedule(id: number) {
        await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
        await reload();
    }

    const overdue = schedules.filter(s => s.enabled && new Date(s.next_due_at) <= new Date());
    const upcoming = schedules.filter(s => s.enabled && new Date(s.next_due_at) > new Date());
    const paused = schedules.filter(s => !s.enabled);

    return (
        <div>
            {/* Quick action row */}
            <div className="flex flex-wrap gap-2 mb-3">
                <ActionBtn onClick={() => quickAddEvent('cleaning',         'Cleaned the panels')} disabled={busy} icon="🧽" label="Cleaned panels"  accent="#10b981" />
                <ActionBtn onClick={() => quickAddEvent('appliance_added',  'New appliance')}      disabled={busy} icon="🔌" label="New appliance"   accent="#8b5cf6" />
                <ActionBtn onClick={() => quickAddEvent('maintenance',      'Maintenance done')}    disabled={busy} icon="🔧" label="Maintenance"     accent="#06b6d4" />
                <ActionBtn onClick={() => setShowAdd(s => !s)} icon="+" label="Schedule recurring" accent="#fbbf24" outline />
            </div>

            {showAdd && <AddScheduleForm onDone={() => { setShowAdd(false); reload(); }} />}

            {/* Sub-tab switcher */}
            <div className="flex gap-1 mb-3">
                <button
                    onClick={() => setTab('reminders')}
                    className={`kpi-number text-[10px] px-2.5 py-1.5 rounded border ${
                        tab === 'reminders' ? 'bg-white/10 text-fg border-white/20' : 'border-transparent text-fgMuted hover:text-fg hover:bg-white/5'
                    }`}>
                    REMINDERS
                    {overdue.length > 0 && (
                        <span className="ml-1.5 px-1 rounded bg-amber2/20 text-amber2">{overdue.length}</span>
                    )}
                </button>
                <button
                    onClick={() => setTab('log')}
                    className={`kpi-number text-[10px] px-2.5 py-1.5 rounded border ${
                        tab === 'log' ? 'bg-white/10 text-fg border-white/20' : 'border-transparent text-fgMuted hover:text-fg hover:bg-white/5'
                    }`}>
                    LOG
                    {events.length > 0 && (
                        <span className="ml-1.5 px-1 rounded bg-white/10 text-fg">{events.length}</span>
                    )}
                </button>
            </div>

            {tab === 'reminders' && (
                <ReminderList
                    overdue={overdue}
                    upcoming={upcoming}
                    paused={paused}
                    onDone={markDone}
                    onSnooze={snooze}
                    onToggle={toggleEnabled}
                    onDelete={deleteSchedule}
                />
            )}
            {tab === 'log' && <EventLog events={events} />}
        </div>
    );
}

/* ─── Reminders ─────────────────────────────────────────────────────── */

function ReminderList({
    overdue, upcoming, paused, onDone, onSnooze, onToggle, onDelete,
}: {
    overdue: Schedule[]; upcoming: Schedule[]; paused: Schedule[];
    onDone: (id: number) => void;
    onSnooze: (id: number, days: number) => void;
    onToggle: (s: Schedule) => void;
    onDelete: (id: number) => void;
}) {
    if (overdue.length + upcoming.length + paused.length === 0) {
        return (
            <div className="kpi-number text-xs text-fgDim py-3">
                No reminders set. Click <b className="text-amber2">Schedule recurring</b> above to add one.
            </div>
        );
    }
    return (
        <div className="space-y-3">
            {overdue.length > 0 && (
                <ReminderGroup label="DUE NOW" tone="amber" items={overdue}
                    onDone={onDone} onSnooze={onSnooze} onToggle={onToggle} onDelete={onDelete} />
            )}
            {upcoming.length > 0 && (
                <ReminderGroup label="UPCOMING" tone="muted" items={upcoming}
                    onDone={onDone} onSnooze={onSnooze} onToggle={onToggle} onDelete={onDelete} />
            )}
            {paused.length > 0 && (
                <ReminderGroup label="PAUSED" tone="dim" items={paused}
                    onDone={onDone} onSnooze={onSnooze} onToggle={onToggle} onDelete={onDelete} />
            )}
        </div>
    );
}

function ReminderGroup({
    label, tone, items, onDone, onSnooze, onToggle, onDelete,
}: {
    label: string;
    tone: 'amber' | 'muted' | 'dim';
    items: Schedule[];
    onDone: (id: number) => void;
    onSnooze: (id: number, days: number) => void;
    onToggle: (s: Schedule) => void;
    onDelete: (id: number) => void;
}) {
    const headColor = tone === 'amber' ? 'text-amber2' : tone === 'muted' ? 'text-fgMuted' : 'text-fgDim';
    return (
        <div>
            <div className={`eyebrow ${headColor} mb-1.5`}>{label}</div>
            <ul className="space-y-1.5">
                {items.map(s => (
                    <ReminderRow key={s.id} s={s}
                        onDone={onDone} onSnooze={onSnooze} onToggle={onToggle} onDelete={onDelete} />
                ))}
            </ul>
        </div>
    );
}

function ReminderRow({
    s, onDone, onSnooze, onToggle, onDelete,
}: {
    s: Schedule;
    onDone: (id: number) => void;
    onSnooze: (id: number, days: number) => void;
    onToggle: (s: Schedule) => void;
    onDelete: (id: number) => void;
}) {
    const due = new Date(s.next_due_at);
    const now = new Date();
    const ms = due.getTime() - now.getTime();
    const days = Math.round(ms / 86_400_000);
    const isOverdue = ms <= 0;
    const isDueSoon = !isOverdue && days <= 1;
    const lastDone = s.last_done_at ? new Date(s.last_done_at).toLocaleDateString() : '—';

    const dueText = isOverdue
        ? (days === 0 ? 'due today' : `${-days}d overdue`)
        : (days === 0 ? 'due today' : days === 1 ? 'tomorrow' : `in ${days} days`);

    const due_color = isOverdue ? '#f59e0b' : isDueSoon ? '#fbbf24' : 'rgba(255,255,255,0.55)';

    return (
        <li className={`rounded border px-3 py-2 flex items-center gap-3 flex-wrap ${
            !s.enabled ? 'border-hairline opacity-50' :
            isOverdue ? 'border-amber2/40 bg-amber2/[0.06]' :
            'border-hairline'
        }`}>
            <div className="text-2xl leading-none shrink-0">{CAT_ICONS[s.category] || '•'}</div>
            <div className="flex-1 min-w-0">
                <div className="text-sm">{s.title}</div>
                <div className="kpi-number text-[10px] text-fgDim">
                    every {s.frequency_days}d · last done {lastDone}
                </div>
            </div>
            <div className="kpi-number text-[10px] text-right shrink-0" style={{ color: due_color }}>
                {dueText}
            </div>
            <div className="flex gap-1 shrink-0 w-full sm:w-auto">
                {s.enabled && (
                    <button onClick={() => onDone(s.id)}
                        className="flex-1 sm:flex-initial kpi-number text-[10px] px-2.5 py-1.5 rounded border border-emerald2/40 text-emerald2 hover:bg-emerald2/10">
                        ✓ DONE
                    </button>
                )}
                {s.enabled && isOverdue && (
                    <button onClick={() => onSnooze(s.id, 1)}
                        title="Snooze 1 day"
                        className="kpi-number text-[10px] px-2.5 py-1.5 rounded border border-hairline text-fgMuted hover:text-fg hover:bg-white/5">
                        ZZZ
                    </button>
                )}
                <button onClick={() => onToggle(s)}
                    title={s.enabled ? 'Pause' : 'Resume'}
                    className="kpi-number text-[10px] px-2.5 py-1.5 rounded border border-hairline text-fgMuted hover:text-fg hover:bg-white/5">
                    {s.enabled ? '⏸' : '▶'}
                </button>
                <button onClick={() => { if (confirm(`Delete reminder "${s.title}"?`)) onDelete(s.id); }}
                    title="Delete"
                    className="kpi-number text-[10px] px-2.5 py-1.5 rounded border border-hairline text-fgDim hover:text-bad hover:border-bad/40 hover:bg-bad/5">
                    ✕
                </button>
            </div>
        </li>
    );
}

function AddScheduleForm({ onDone }: { onDone: () => void }) {
    const [title, setTitle]     = useState('Clean the panels');
    const [category, setCat]    = useState('cleaning');
    const [frequency, setFreq]  = useState(30);
    const [busy, setBusy]       = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !frequency) return;
        setBusy(true);
        await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, frequency_days: frequency }),
        });
        setBusy(false);
        onDone();
    };

    return (
        <form onSubmit={submit}
              className="mb-3 p-3 rounded border border-hairline bg-white/[0.03] space-y-2">
            <div className="flex flex-wrap gap-2">
                <input
                    placeholder="What to remind you about?"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="flex-1 min-w-[160px] px-3 py-2 text-sm bg-black/30 rounded border border-hairline text-fg placeholder:text-fgDim focus:border-cyan2 outline-none" />
                <select value={category} onChange={e => setCat(e.target.value)}
                    className="px-2 py-2 text-sm bg-black/30 rounded border border-hairline text-fg">
                    <option value="cleaning">🧽 Cleaning</option>
                    <option value="maintenance">🔧 Maintenance</option>
                    <option value="inspection">🔎 Inspection</option>
                    <option value="reading">📖 Reading</option>
                    <option value="note">📝 Note</option>
                    <option value="other">• Other</option>
                </select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="kpi-number text-[10px] text-fgDim">EVERY</span>
                {FREQ_PRESETS.map(p => (
                    <button type="button" key={p.days}
                        onClick={() => setFreq(p.days)}
                        className={`kpi-number text-[10px] px-2 py-1 rounded border ${
                            frequency === p.days ? 'bg-white/10 text-fg border-white/20'
                                                 : 'border-transparent text-fgMuted hover:text-fg hover:bg-white/5'
                        }`}>
                        {p.label} ({p.days}D)
                    </button>
                ))}
                <input type="number" min={1} max={365}
                       value={frequency}
                       onChange={e => setFreq(Number(e.target.value))}
                       className="w-16 px-2 py-1 text-sm bg-black/30 rounded border border-hairline text-fg" />
                <span className="kpi-number text-[10px] text-fgDim">DAYS</span>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onDone}
                    className="kpi-number text-xs px-3 py-2 rounded border border-hairline text-fgMuted">CANCEL</button>
                <button type="submit" disabled={busy}
                    className="kpi-number text-xs px-3 py-2 rounded bg-white text-black disabled:opacity-50">
                    {busy ? 'SAVING…' : 'SCHEDULE IT'}
                </button>
            </div>
        </form>
    );
}

function EventLog({ events }: { events: Event[] }) {
    if (events.length === 0) {
        return <div className="kpi-number text-xs text-fgDim py-3">No events logged yet.</div>;
    }
    return (
        <ul className="divide-y divide-hairline">
            {events.map(e => {
                const i = e.impact;
                const arrow = i ? (i.delta_pct >= 0 ? '▲' : '▼') : null;
                const impColor = i ? (i.delta_pct >= 0 ? '#10b981' : '#ef4444') : '';
                return (
                    <li key={e.id} className="py-2.5 flex items-start gap-3">
                        <div className="text-xl leading-none mt-0.5 shrink-0">{CAT_ICONS[e.category] || '•'}</div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm">{e.title}</div>
                            <div className="kpi-number text-[10px] text-fgDim">
                                {new Date(e.ts).toLocaleString()} · {e.category}
                            </div>
                            {e.notes && <div className="text-xs text-fgMuted mt-0.5">{e.notes}</div>}
                        </div>
                        {i && i.n_days_after >= 1 && (
                            <div className="text-right shrink-0">
                                <div className="kpi-number text-base" style={{ color: impColor }}>
                                    {arrow} {Math.abs(i.delta_pct).toFixed(1)}%
                                </div>
                                <div className="kpi-number text-[10px] text-fgDim">{i.n_days_after}d export</div>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function ActionBtn({
    onClick, disabled, icon, label, accent, outline,
}: { onClick: () => void; disabled?: boolean; icon: string; label: string; accent: string; outline?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`text-xs kpi-number flex items-center gap-1.5 px-2.5 py-1.5 rounded border transition disabled:opacity-50 ${
                outline ? 'border-hairline text-fg hover:bg-white/5' : 'text-fg hover:opacity-90'
            }`}
            style={outline ? { borderColor: `${accent}55`, color: accent }
                           : { background: `${accent}1a`, borderColor: `${accent}55` }}
        >
            <span className="text-sm">{icon}</span> <span className="whitespace-nowrap">{label.toUpperCase()}</span>
        </button>
    );
}
