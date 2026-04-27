'use client';
// Registers tools the CopilotKit chat can call. The actual data-fetching
// happens via our /api routes — these are the bridges.
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import { useEffect, useState } from 'react';

async function getJSON(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
}

export function CopilotActions() {
    // Make some always-on context readable by the AI so simple questions don't need a tool call.
    const [live, setLive] = useState<any>(null);
    useEffect(() => {
        const tick = () => getJSON('/api/live').then(setLive).catch(() => {});
        tick();
        const id = setInterval(tick, 15_000);
        return () => clearInterval(id);
    }, []);
    useCopilotReadable({
        description: 'Live grid power right now',
        value: live ? {
            net_grid_kw: live.p_sum_kw,                       // negative = exporting
            direction: (live.p_sum_kw ?? 0) < 0 ? 'exporting' : 'importing',
            today_imported_kwh: live.today_imp_kwh,
            this_month_imported_kwh: live.thismonth_imp_kwh,
            timestamp: live.localTime,
        } : null,
    });

    useCopilotAction({
        name: 'get_period_totals',
        description: 'Get total imported, exported and net energy for a period (in days).',
        parameters: [
            { name: 'days', type: 'number', description: 'How many days back from today (1, 7, 30, 365)', required: true },
        ],
        handler: async ({ days }) => {
            return getJSON(`/api/totals?days=${days}`);
        },
    });

    useCopilotAction({
        name: 'get_daily_history',
        description: 'Get daily import/export kWh for the last N days. Use to compare days, find anomalies, etc.',
        parameters: [
            { name: 'days', type: 'number', description: 'How many days back', required: true },
        ],
        handler: async ({ days }) => {
            return getJSON(`/api/history/daily?days=${days}`);
        },
    });

    useCopilotAction({
        name: 'get_monthly_history',
        description: 'Get all monthly totals. Use for the bill story / year-on-year comparison.',
        parameters: [],
        handler: async () => {
            return getJSON('/api/history/monthly');
        },
    });

    useCopilotAction({
        name: 'get_yearly_history',
        description: 'Get yearly totals (multi-year trend).',
        parameters: [],
        handler: async () => {
            return getJSON('/api/history/yearly');
        },
    });

    useCopilotAction({
        name: 'mark_event',
        description: 'Record a user event like "cleaned the panels", "added new freezer", or any note. Use when the user mentions doing something physical.',
        parameters: [
            { name: 'category', type: 'string', description: 'cleaning | maintenance | appliance_added | appliance_removed | inverter_change | fault | note | other', required: true },
            { name: 'title', type: 'string', description: 'Short title, e.g. "Cleaned panels"', required: true },
            { name: 'notes', type: 'string', description: 'Optional details', required: false },
        ],
        handler: async ({ category, title, notes }) => {
            const res = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, title, notes }),
            });
            return res.json();
        },
    });

    useCopilotAction({
        name: 'compare_event_impact',
        description: 'Compare daily exports for the N days BEFORE vs AFTER a user-marked event. Returns averages and the percent change. Useful for "did cleaning help?".',
        parameters: [
            { name: 'eventId', type: 'number', description: 'Event id (use list_events first to find it)', required: true },
            { name: 'windowDays', type: 'number', description: 'Comparison window length, default 7', required: false },
        ],
        handler: async ({ eventId, windowDays }) => {
            const w = windowDays || 7;
            return getJSON(`/api/events/${eventId}/impact?days=${w}`);
        },
    });

    useCopilotAction({
        name: 'list_events',
        description: 'List recent user-marked events.',
        parameters: [],
        handler: async () => getJSON('/api/events'),
    });

    useCopilotAction({
        name: 'list_alerts',
        description: 'List open and recent alerts.',
        parameters: [],
        handler: async () => getJSON('/api/alerts'),
    });

    return null;
}
