import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
    const url = new URL(req.url);
    const withImpact = url.searchParams.get('withImpact') === '1';
    const events = await q<{
        id: number; ts: string; category: string; title: string; notes: string | null;
    }>(
        `SELECT id, ts::text, category, title, notes FROM events ORDER BY ts DESC LIMIT 50`
    );
    if (!withImpact) return NextResponse.json(events);

    // Compute simple before/after impact for each event using daily_energy.
    const enriched = await Promise.all(events.map(async (e) => {
        const w = 7;
        const [agg] = await q<{ before_avg: number | null; after_avg: number | null; n_after: number }>(
            `WITH eday AS (SELECT $1::date AS d)
             SELECT
               (SELECT AVG(exported_kwh)::float FROM daily_energy
                  WHERE day BETWEEN (SELECT d - $2::int FROM eday) AND (SELECT d - 1 FROM eday)
               ) AS before_avg,
               (SELECT AVG(exported_kwh)::float FROM daily_energy
                  WHERE day BETWEEN (SELECT d FROM eday) AND (SELECT d + $2::int FROM eday)
               ) AS after_avg,
               (SELECT COUNT(*)::int FROM daily_energy
                  WHERE day BETWEEN (SELECT d FROM eday) AND (SELECT d + $2::int FROM eday)
               ) AS n_after`,
            [new Date(e.ts).toISOString().slice(0, 10), w]
        );
        const before = agg.before_avg ?? 0;
        const after = agg.after_avg ?? 0;
        const delta_pct = before > 0 ? ((after - before) / before) * 100 : 0;
        return {
            ...e,
            impact: agg.n_after >= 1 ? {
                before_avg: before, after_avg: after,
                delta_pct, window_days: w, n_days_after: agg.n_after,
            } : null,
        };
    }));

    return NextResponse.json(enriched);
    } catch (e: any) {
        console.error('[/api/events] failed:', e?.message);
        return NextResponse.json([]);
    }
}

export async function POST(req: Request) {
    const body = await req.json();
    const { category, title, notes } = body || {};
    if (!category || !title) {
        return NextResponse.json({ error: 'category and title required' }, { status: 400 });
    }
    const [row] = await q<{ id: number }>(
        `INSERT INTO events (category, title, notes) VALUES ($1, $2, $3) RETURNING id`,
        [category, title, notes || null]
    );
    return NextResponse.json({ ok: true, id: row.id });
}
