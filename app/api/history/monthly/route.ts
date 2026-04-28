import { NextResponse } from 'next/server';
import { q } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rows = await q(
            `SELECT to_char(month, 'YYYY-MM') AS month,
                    imported_kwh::float AS imported_kwh,
                    exported_kwh::float AS exported_kwh,
                    net_kwh::float AS net_kwh
               FROM monthly_energy
              ORDER BY month ASC`
        );
        return NextResponse.json(rows);
    } catch (e: any) {
        console.error('[/api/history/monthly] failed:', e?.message);
        return NextResponse.json([]);
    }
}
