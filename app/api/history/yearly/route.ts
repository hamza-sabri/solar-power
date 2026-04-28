import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rows = await q(
            `SELECT year, imported_kwh::float AS imported_kwh,
                    exported_kwh::float AS exported_kwh, net_kwh::float AS net_kwh
               FROM yearly_energy ORDER BY year ASC`
        );
        return NextResponse.json(rows);
    } catch (e: any) {
        console.error('[/api/history/yearly] failed:', e?.message);
        return NextResponse.json([]);
    }
}
