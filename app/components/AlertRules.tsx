'use client';
import { useEffect, useRef, useState } from 'react';

type Rule = {
    id: number;
    name: string;
    metric: string;
    comparator: '<' | '<=' | '>' | '>=';
    threshold: number;
    enabled: boolean;
    cooldown_minutes: number;
    last_triggered_at: string | null;
    notes: string | null;
};

const METRICS = [
    { value: 'export_kw',              label: 'Grid export', unit: 'kW',  hint: 'How much you\'re sending to grid right now' },
    { value: 'import_kw',              label: 'Grid import', unit: 'kW',  hint: 'How much you\'re drawing from grid right now' },
    { value: 'solar_kw',               label: 'Solar production', unit: 'kW', hint: 'Estimated solar production right now' },
    { value: 'home_kw',                label: 'Home consumption', unit: 'kW', hint: 'Estimated total home load right now' },
    { value: 'no_solar_minutes',       label: 'No solar for', unit: 'min',     hint: 'How long solar has been at zero (during daylight hours)' },
    { value: 'solar_below_for_minutes', label: 'Solar stayed under threshold for', unit: 'min', hint: 'Sustained low production — useful for "underperforming today"' },
];

export function AlertRules({
    onTrigger,
}: {
    onTrigger: (rule: Rule, value: number) => void;
}) {
    const [rules, setRules] = useState<Rule[]>([]);
    const [showAdd, setShowAdd] = useState(false);

    const reload = () =>
        fetch('/api/alert-rules').then(r => r.json()).then(setRules);

    useEffect(() => { reload(); }, []);

    async function toggle(r: Rule) {
        await fetch(`/api/alert-rules/${r.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !r.enabled }),
        });
        reload();
    }

    async function del(id: number) {
        await fetch(`/api/alert-rules/${id}`, { method: 'DELETE' });
        reload();
    }

    return (
        <div>
            <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                    <div className="eyebrow">Custom alert rules</div>
                    <div className="helper">
                        Tell the dashboard what to watch for. When a rule triggers, you get a browser
                        notification (and the alert is logged). Cooldown prevents spam.
                    </div>
                </div>
                <button onClick={() => setShowAdd(s => !s)}
                    className="kpi-number text-[10px] px-2.5 py-1.5 rounded border border-amber2/40 text-amber2 hover:bg-amber2/10 shrink-0">
                    + RULE
                </button>
            </div>

            {showAdd && <AddRuleForm onDone={() => { setShowAdd(false); reload(); }} />}

            {rules.length === 0 ? (
                <div className="kpi-number text-xs text-fgDim py-3">
                    No rules yet. Click <b className="text-amber2">+ RULE</b> to add one — e.g. notify me when export drops below 1 kW.
                </div>
            ) : (
                <ul className="space-y-1.5">
                    {rules.map(r => (
                        <RuleRow key={r.id} r={r} onToggle={toggle} onDelete={del} onTrigger={onTrigger} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function RuleRow({
    r, onToggle, onDelete,
}: {
    r: Rule;
    onToggle: (r: Rule) => void;
    onDelete: (id: number) => void;
    onTrigger: (rule: Rule, value: number) => void;
}) {
    const m = METRICS.find(m => m.value === r.metric);
    return (
        <li className={`rounded border px-3 py-2 flex items-start gap-3 flex-wrap ${
            r.enabled ? 'border-hairline' : 'border-hairline opacity-50'
        }`}>
            <div className="flex-1 min-w-0">
                <div className="text-sm">{r.name}</div>
                <div className="kpi-number text-[10px] text-fgDim mt-0.5">
                    {m?.label || r.metric} <span className="text-fg">{r.comparator} {r.threshold}{m?.unit ? ` ${m.unit}` : ''}</span>
                    <span className="text-fgDim"> · cooldown {r.cooldown_minutes}m</span>
                    {r.last_triggered_at && (
                        <> · last fired {new Date(r.last_triggered_at).toLocaleString()}</>
                    )}
                </div>
            </div>
            <div className="flex gap-1 shrink-0">
                <button onClick={() => onToggle(r)}
                    title={r.enabled ? 'Disable' : 'Enable'}
                    className="kpi-number text-[10px] px-2 py-1 rounded border border-hairline text-fgMuted hover:text-fg hover:bg-white/5">
                    {r.enabled ? '⏸' : '▶'}
                </button>
                <button onClick={() => { if (confirm(`Delete rule "${r.name}"?`)) onDelete(r.id); }}
                    className="kpi-number text-[10px] px-2 py-1 rounded border border-hairline text-fgDim hover:text-bad hover:border-bad/40 hover:bg-bad/5">
                    ✕
                </button>
            </div>
        </li>
    );
}

function AddRuleForm({ onDone }: { onDone: () => void }) {
    const [name, setName] = useState('Export below 1 kW');
    const [metric, setMetric] = useState('export_kw');
    const [comparator, setComparator] = useState<'<' | '<=' | '>' | '>='>('<');
    const [threshold, setThreshold] = useState(1);
    const [cooldown, setCooldown] = useState(30);
    const [busy, setBusy] = useState(false);

    const m = METRICS.find(mm => mm.value === metric)!;

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        await fetch('/api/alert-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, metric, comparator, threshold, cooldown_minutes: cooldown }),
        });
        setBusy(false);
        onDone();
    }

    return (
        <form onSubmit={submit} className="mb-3 p-3 rounded border border-hairline bg-white/[0.03] space-y-2">
            <input
                placeholder="Rule name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-black/30 rounded border border-hairline text-fg placeholder:text-fgDim focus:border-amber2 outline-none" />
            <div className="flex items-center gap-2 flex-wrap">
                <span className="kpi-number text-[10px] text-fgDim shrink-0">WHEN</span>
                <select value={metric} onChange={e => setMetric(e.target.value)}
                    className="px-2 py-2 text-sm bg-black/30 rounded border border-hairline text-fg flex-1 min-w-[140px]">
                    {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={comparator} onChange={e => setComparator(e.target.value as any)}
                    className="px-2 py-2 text-sm bg-black/30 rounded border border-hairline text-fg">
                    <option value="<">&lt;</option>
                    <option value="<=">&le;</option>
                    <option value=">">&gt;</option>
                    <option value=">=">&ge;</option>
                </select>
                <input type="number" step="0.1" value={threshold}
                    onChange={e => setThreshold(Number(e.target.value))}
                    className="w-20 px-2 py-2 text-sm bg-black/30 rounded border border-hairline text-fg" />
                <span className="kpi-number text-[10px] text-fgDim">{m.unit}</span>
            </div>
            <div className="kpi-number text-[10px] text-fgDim">{m.hint}</div>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="kpi-number text-[10px] text-fgDim">COOLDOWN</span>
                <input type="number" min={1} value={cooldown}
                    onChange={e => setCooldown(Number(e.target.value))}
                    className="w-20 px-2 py-1.5 text-sm bg-black/30 rounded border border-hairline text-fg" />
                <span className="kpi-number text-[10px] text-fgDim">MIN</span>
            </div>
            <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onDone}
                    className="kpi-number text-xs px-3 py-2 rounded border border-hairline text-fgMuted">CANCEL</button>
                <button type="submit" disabled={busy}
                    className="kpi-number text-xs px-3 py-2 rounded bg-amber2 text-black disabled:opacity-50">
                    {busy ? 'SAVING…' : 'SAVE RULE'}
                </button>
            </div>
        </form>
    );
}
