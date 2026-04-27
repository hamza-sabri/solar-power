import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const url = new URL(req.url);
    const w = Math.max(1, Math.min(60, Number(url.searchParams.get('days') ?? 7)));

    const [evt] = await q<{ ts: string; title: string; category: string }>(
        `SELECT ts::text, title, category FROM events WHERE id = $1`, [id]
    );
    if (!evt) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const day = new Date(evt.ts).toISOString().slice(0, 10);
    const [agg] = await q<{ before_avg_export: number | null; after_avg_export: number | null;
                          before_avg_import: number | null; after_avg_import: number | null;
                          n_before: number; n_after: number; }>(
        `WITH eday AS (SELECT $1::date AS d)
         SELECT
           (SELECT AVG(exported_kwh)::float FROM daily_energy
              WHERE day BETWEEN (SELECT d - $2::int FROM eday) AND (SELECT d - 1 FROM eday)) AS before_avg_export,
           (SELECT AVG(exported_kwh)::float FROM daily_energy
              WHERE day BETWEEN (SELECT d FROM eday) AND (SELECT d + $2::int FROM eday)) AS after_avg_export,
           (SELECT AVG(imported_kwh)::float FROM daily_energy
              WHERE day BETWEEN (SELECT d - $2::int FROM eday) AND (SELECT d - 1 FROM eday)) AS before_avg_import,
           (SELECT AVG(imported_kwh)::float FROM daily_energy
              WHERE day BETWEEN (SELECT d FROM eday) AND (SELECT d + $2::int FROM eday)) AS after_avg_import,
           (SELECT COUNT(*)::int FROM daily_energy
              WHERE day BETWEEN (SELECT d - $2::int FROM eday) AND (SELECT d - 1 FROM eday)) AS n_before,
           (SELECT COUNT(*)::int FROM daily_energy
              WHERE day BETWEEN (SELECT d FROM eday) AND (SELECT d + $2::int FROM eday)) AS n_after`,
        [day, w]
    );

    const exp_before = agg.before_avg_export ?? 0;
    const exp_after  = agg.after_avg_export ?? 0;
    const imp_before = agg.before_avg_import ?? 0;
    const imp_after  = agg.after_avg_import ?? 0;
    return NextResponse.json({
        event: { id: Number(id), title: evt.title, category: evt.category, day },
        window_days: w,
        n_days_before: agg.n_before,
        n_days_after: agg.n_after,
        export_kwh_per_day: { before: exp_before, after: exp_after,
            delta_pct: exp_before > 0 ? ((exp_after - exp_before) / exp_before) * 100 : null },
        import_kwh_per_day: { before: imp_before, after: imp_after,
            delta_pct: imp_before > 0 ? ((imp_after - imp_before) / imp_before) * 100 : null },
    });
}
