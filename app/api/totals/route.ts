import { NextResponse } from 'next/server';
import { q, tariffs } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(9999, Number(url.searchParams.get('days') ?? 30)));

    try {
        const cutoff = days >= 9999 ? '1900-01-01' : `CURRENT_DATE - INTERVAL '${days - 1} days'`;
        const sql = days >= 9999
            ? `SELECT COALESCE(SUM(imported_kwh),0)::float AS imported,
                      COALESCE(SUM(exported_kwh),0)::float AS exported,
                      MIN(day)::text AS from_day, MAX(day)::text AS to_day
                 FROM daily_energy`
            : `SELECT COALESCE(SUM(imported_kwh),0)::float AS imported,
                      COALESCE(SUM(exported_kwh),0)::float AS exported,
                      MIN(day)::text AS from_day, MAX(day)::text AS to_day
                 FROM daily_energy
                WHERE day >= ${cutoff}`;

        const [row] = await q<{ imported: number; exported: number; from_day: string; to_day: string }>(sql);
        const net = row.imported - row.exported;
        const bill = row.imported * tariffs.import - row.exported * tariffs.export;

        return NextResponse.json({
            days,
            imported_kwh: row.imported,
            exported_kwh: row.exported,
            net_kwh: net,
            bill_estimate: bill,
            tariff_import: tariffs.import,
            tariff_export: tariffs.export,
            range: { from: row.from_day, to: row.to_day },
        });
    } catch (e: any) {
        console.error('[/api/totals] failed:', e?.message);
        // Safe shape so the UI doesn't crash. Real diagnostic at /api/health.
        return NextResponse.json({
            days,
            imported_kwh: 0,
            exported_kwh: 0,
            net_kwh: 0,
            bill_estimate: 0,
            tariff_import: tariffs.import,
            tariff_export: tariffs.export,
            range: { from: '—', to: '—' },
            __error: e?.message || 'unknown',
        });
    }
}
