'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { EventsAndReminders } from './EventsAndReminders';
import { AlertRules } from './AlertRules';

/* ────────────────────────────────────────────────────────────────────────
   AppShell wraps the page with:
    - sticky compact top bar (responsive)
    - a bell shortcut that opens a slide-in drawer
    - the drawer hosts: Events & reminders + Custom alert rules
    - the rule evaluator: polls /api/live every 30s and fires browser
      notifications when any user-defined rule is violated
   ──────────────────────────────────────────────────────────────────────── */

type DrawerCtx = {
    open: () => void;
    close: () => void;
    setBadge: (n: number) => void;
};
const DrawerContext = createContext<DrawerCtx | null>(null);
export const useDrawer = () => useContext(DrawerContext);

type Live = {
    p_sum_kw: number;
    p_l1_kw: number; p_l2_kw: number; p_l3_kw: number;
};

type Rule = {
    id: number;
    name: string;
    metric: string;
    comparator: '<' | '<=' | '>' | '>=';
    threshold: number;
    enabled: boolean;
    cooldown_minutes: number;
    last_triggered_at: string | null;
};

const BASELINE_L1_HOME_KW = 0.3;

function estimateLive(live: Live): { solarKw: number; homeKw: number; exportKw: number; importKw: number } {
    const pL1 = live.p_l1_kw ?? 0;
    const pL2 = Math.max(0, live.p_l2_kw ?? 0);
    const pL3 = Math.max(0, live.p_l3_kw ?? 0);
    const pSum = live.p_sum_kw ?? 0;
    const solarKw = pL1 < 0 ? -pL1 + BASELINE_L1_HOME_KW : 0;
    const homeL1 = pL1 < 0 ? BASELINE_L1_HOME_KW : pL1;
    const homeKw = homeL1 + pL2 + pL3;
    const exportKw = pSum < 0 ? -pSum : 0;
    const importKw = pSum > 0 ?  pSum : 0;
    return { solarKw, homeKw, exportKw, importKw };
}

function compare(value: number, op: string, threshold: number): boolean {
    switch (op) {
        case '<':  return value <  threshold;
        case '<=': return value <= threshold;
        case '>':  return value >  threshold;
        case '>=': return value >= threshold;
        default:   return false;
    }
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<'reminders' | 'rules'>('reminders');
    const [badge, setBadge] = useState(0);
    const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');

    /* ─── Rule evaluator (runs continuously) ─────────────────── */
    const lowSolarSinceRef = useRef<number | null>(null);
    const noSolarSinceRef  = useRef<number | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotifPerm(Notification.permission);
        }

        const evaluate = async () => {
            try {
                const [liveRaw, rulesRaw, schedulesRaw] = await Promise.all([
                    fetch('/api/live').then(r => r.json()),
                    fetch('/api/alert-rules').then(r => r.json()),
                    fetch('/api/schedules').then(r => r.json()),
                ]);
                if (liveRaw?.error) return;
                const live = liveRaw as Live;
                const rules: Rule[] = rulesRaw || [];

                const e = estimateLive(live);
                const now = Date.now();

                // Track sustained-low solar timers
                if (e.solarKw < 0.05) {
                    if (noSolarSinceRef.current == null) noSolarSinceRef.current = now;
                } else {
                    noSolarSinceRef.current = null;
                }

                for (const r of rules) {
                    if (!r.enabled) continue;
                    // Cooldown
                    if (r.last_triggered_at) {
                        const last = new Date(r.last_triggered_at).getTime();
                        if (now - last < r.cooldown_minutes * 60_000) continue;
                    }

                    let value: number;
                    switch (r.metric) {
                        case 'export_kw':   value = e.exportKw; break;
                        case 'import_kw':   value = e.importKw; break;
                        case 'solar_kw':    value = e.solarKw;  break;
                        case 'home_kw':     value = e.homeKw;   break;
                        case 'no_solar_minutes':
                            value = noSolarSinceRef.current ? (now - noSolarSinceRef.current) / 60_000 : 0;
                            break;
                        case 'solar_below_for_minutes':
                            // Track duration solar has been below threshold (we approximate)
                            if (e.solarKw < r.threshold) {
                                if (lowSolarSinceRef.current == null) lowSolarSinceRef.current = now;
                                value = (now - lowSolarSinceRef.current) / 60_000;
                            } else {
                                lowSolarSinceRef.current = null;
                                value = 0;
                            }
                            break;
                        default: continue;
                    }

                    if (compare(value, r.comparator, r.threshold)) {
                        // Fire
                        if (typeof window !== 'undefined' && 'Notification' in window
                            && Notification.permission === 'granted') {
                            try {
                                new Notification(`⚠️  ${r.name}`, {
                                    body: `${r.metric.replace(/_/g, ' ')} ${r.comparator} ${r.threshold} (now ${value.toFixed(2)})`,
                                    tag: `rule-${r.id}`,
                                });
                            } catch {/* ignore */}
                        }
                        // Log to alerts table + mark triggered
                        try {
                            await fetch(`/api/alert-rules/${r.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ mark_triggered: true, value }),
                            });
                        } catch {/* ignore */}
                    }
                }

                // Compute drawer badge: open reminders + recently triggered rules
                const overdue = (schedulesRaw || []).filter((s: any) =>
                    s.enabled && new Date(s.next_due_at) <= new Date()
                ).length;
                setBadge(overdue);
            } catch {/* swallow */}
        };

        evaluate();
        const id = setInterval(evaluate, 30_000);
        return () => clearInterval(id);
    }, []);

    const drawerCtx: DrawerCtx = {
        open: () => setOpen(true),
        close: () => setOpen(false),
        setBadge,
    };

    async function ensureNotifPerm() {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission === 'default') {
            const r = await Notification.requestPermission();
            setNotifPerm(r);
        }
    }

    return (
        <DrawerContext.Provider value={drawerCtx}>
            <div className="min-h-screen flex flex-col">
                {/* Top bar */}
                <header className="sticky top-0 z-30 backdrop-blur-md bg-ink/70 border-b border-hairline">
                    <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="kpi-number text-xs sm:text-sm tracking-widest truncate">SOLAR · QALQILIYA</div>
                            <span className="hidden sm:inline kpi-number text-[10px] text-fgDim">SIEMENS PAC2200</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="hidden md:inline kpi-number text-[10px] text-fgDim">
                                AI · disabled
                            </span>
                            <button
                                onClick={() => { setOpen(true); ensureNotifPerm(); }}
                                aria-label="Open events and alerts"
                                className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-hairline hover:bg-white/5 transition kpi-number text-[10px]"
                            >
                                <span className="text-base leading-none">🔔</span>
                                <span className="hidden sm:inline">EVENTS &amp; ALERTS</span>
                                {badge > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber2 text-black text-[10px] font-bold flex items-center justify-center">
                                        {badge}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1">{children}</main>

                {/* Drawer overlay */}
                {open && (
                    <div
                        className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />
                )}

                {/* Drawer */}
                <aside
                    className={`fixed top-0 right-0 z-50 h-full w-full sm:max-w-md bg-ink border-l border-hairline shadow-2xl transition-transform duration-300 ${
                        open ? 'translate-x-0' : 'translate-x-full'
                    }`}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
                        <div className="flex gap-1">
                            <button onClick={() => setTab('reminders')}
                                className={`kpi-number text-[10px] px-2.5 py-1.5 rounded border ${
                                    tab === 'reminders' ? 'bg-white/10 text-fg border-white/20' : 'border-transparent text-fgMuted hover:text-fg hover:bg-white/5'
                                }`}>
                                EVENTS &amp; REMINDERS
                            </button>
                            <button onClick={() => setTab('rules')}
                                className={`kpi-number text-[10px] px-2.5 py-1.5 rounded border ${
                                    tab === 'rules' ? 'bg-white/10 text-fg border-white/20' : 'border-transparent text-fgMuted hover:text-fg hover:bg-white/5'
                                }`}>
                                ALERT RULES
                            </button>
                        </div>
                        <button onClick={() => setOpen(false)}
                            className="kpi-number text-xs px-2.5 py-1.5 rounded border border-hairline text-fgMuted hover:text-fg hover:bg-white/5">
                            ✕
                        </button>
                    </div>
                    <div className="overflow-y-auto h-[calc(100%-49px)] p-4">
                        {/* Notification permission helper */}
                        {notifPerm !== 'granted' && (
                            <div className="mb-3 p-3 rounded border border-cyan2/40 bg-cyan2/[0.06]">
                                <div className="text-sm text-fg flex items-center gap-2">
                                    🔔 <span>Browser notifications are off</span>
                                </div>
                                <div className="kpi-number text-[10px] text-fgDim mt-1">
                                    Turn them on so reminders &amp; alerts can pop up even when this tab isn't focused.
                                </div>
                                <button
                                    onClick={ensureNotifPerm}
                                    className="mt-2 kpi-number text-[10px] px-2.5 py-1.5 rounded border border-cyan2/40 text-cyan2 hover:bg-cyan2/10">
                                    ENABLE NOTIFICATIONS
                                </button>
                            </div>
                        )}

                        {tab === 'reminders' ? <EventsAndReminders /> : <AlertRules onTrigger={() => {}} />}
                    </div>
                </aside>
            </div>
        </DrawerContext.Provider>
    );
}
